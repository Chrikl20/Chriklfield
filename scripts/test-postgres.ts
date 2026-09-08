// Real multi-connection checks. Requires an EMPTY disposable PostgreSQL database.
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { bootstrapSql, migrations, seedSql, U1, U2, W1, W2 } from '../tests/database';
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.startsWith('/chriklfield_test'))
  throw new Error(
    'Use a disposable database named chriklfield_test*. No existing schema is dropped.',
  );
const clients = Array.from({ length: 3 }, () => new Client({ connectionString: url }));
try {
  await Promise.all(clients.map((c) => c.connect()));
  const [a, b, c] = clients;
  if ((await a.query("select to_regclass('public.workspaces') present")).rows[0].present)
    throw new Error('Test database must be empty.');
  await a.query(bootstrapSql);
  await a.query(await migrations());
  await a.query(seedSql);
  async function quote(user = U1, ws = W1, credits = 70) {
    return (
      await a.query(
        "insert into quotes(workspace_id,user_id,model,input,context,input_hash,credits,estimated_microusd,pricing_version,expires_at)values($1,$2,'draft','{\"model\":\"draft\"}','{\"assets\":[],\"references\":[]}','fixture',$3,100000,'test:test-v1',now()+interval '10 minutes')returning id",
        [ws, user, credits],
      )
    ).rows[0].id;
  }
  const [q1, q2] = await Promise.all([quote(), quote()]);
  const reservations = await Promise.allSettled([
    b.query('select enqueue_job($1,$2,$3,$4)id', [U1, W1, q1, 'parallel-connection-1']),
    c.query('select enqueue_job($1,$2,$3,$4)id', [U1, W1, q2, 'parallel-connection-2']),
  ]);
  assert.equal(reservations.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    (await a.query('select reserved::int from workspaces where id=$1', [W1])).rows[0].reserved,
    70,
  );
  const job = (await a.query('select id from jobs')).rows[0].id;
  await Promise.all([
    b.query("select settle_job($1,false,'PREPARATION_FAILED')", [job]),
    c.query("select settle_job($1,false,'PREPARATION_FAILED')", [job]),
  ]);
  assert.equal(
    (await a.query("select count(*)::int n from credit_ledger where kind='release'")).rows[0].n,
    1,
  );
  // Exercise both arrival orders under actual concurrent transactions, not an in-memory mutex.
  for (let i = 0; i < 12; i++) {
    const paid = ['evt' + i, 'cs' + i, W1, 'pi' + i, 'ch' + i, 1000, 'usd', 1000],
      refund = ['rf' + i, 'ch' + i, 500];
    const actions =
      i % 2
        ? [
            c.query('select apply_refund($1,$2,$3)', refund),
            b.query('select apply_payment($1,$2,$3,$4,$5,$6,$7,$8)', paid),
          ]
        : [
            b.query('select apply_payment($1,$2,$3,$4,$5,$6,$7,$8)', paid),
            c.query('select apply_refund($1,$2,$3)', refund),
          ];
    await Promise.all(actions);
  }
  assert.equal(
    (await a.query('select balance::int from workspaces where id=$1', [W1])).rows[0].balance,
    6100,
  );
  await a.query('update project_limits set budget_microusd=150000');
  const [q3, q4] = await Promise.all([quote(U1, W1, 10), quote(U2, W2, 10)]);
  const global = await Promise.allSettled([
    b.query('select enqueue_job($1,$2,$3,$4)', [U1, W1, q3, 'global-user-one']),
    c.query('select enqueue_job($1,$2,$3,$4)', [U2, W2, q4, 'global-user-two']),
  ]);
  assert.equal(global.filter((r) => r.status === 'fulfilled').length, 1);
  // Direct uploads share the workspace lock with generated assets and deletion.
  await a.query('update workspaces set storage_limit_bytes=$1 where id=$2', [30 * 1024 * 1024, W2]);
  const uploads = await Promise.allSettled([
    b.query("select * from begin_upload($1,$2,null,'image/jpeg',1000,'parallel-upload-1')", [
      U2,
      W2,
    ]),
    c.query("select * from begin_upload($1,$2,null,'image/jpeg',1000,'parallel-upload-2')", [
      U2,
      W2,
    ]),
  ]);
  assert.equal(uploads.filter((r) => r.status === 'fulfilled').length, 1);
  const upload = (await a.query('select id from upload_intents where workspace_id=$1', [W2]))
    .rows[0].id;
  await a.query('select queue_upload($1,$2,$3)', [U2, W2, upload]);
  const lease = (await a.query('select * from claim_upload($1)', [upload])).rows[0].lease_token;
  const meta = { mime: 'image/jpeg', bytes: 1000, width: 300, height: 300, duration: null };
  await Promise.all([
    b.query('select finish_upload($1,$2,$3)', [upload, lease, meta]),
    c.query('select finish_upload($1,$2,$3)', [upload, lease, meta]),
  ]);
  assert.equal(
    (await a.query('select count(*)::int n from assets where workspace_id=$1', [W2])).rows[0].n,
    1,
  );
  console.log(
    'PostgreSQL: concurrent credits/storage, duplicate settlement/upload completion, 12 refund/payment races and global budgets passed.',
  );
} finally {
  await Promise.allSettled(clients.map((c) => c.end()));
}
