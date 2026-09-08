import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { makeDb, quote, enqueue, balance, U1, U2, W1, W2 } from './database';
let db: PGlite;
beforeEach(async () => {
  db = await makeDb();
});
afterEach(async () => {
  await db?.close();
});
describe('PostgreSQL migrations, tenancy and atomic accounting', () => {
  it('isolates two users with RLS, including private storage rows and service RPC permissions', async () => {
    const id = randomUUID();
    await db.query('insert into characters(id,workspace_id,name)values($1,$2,$3)', [
      id,
      W1,
      'Private',
    ]);
    await db.query(
      "insert into assets(id,workspace_id,kind,path,mime,bytes)values($1,$2,'image',$3,'image/jpeg',100)",
      [randomUUID(), W1, `${W1}/private.jpg`],
    );
    await db.query("insert into storage.objects(bucket_id,name)values('creator-private',$1)", [
      `${W1}/private.jpg`,
    ]);
    await db.exec(`set role authenticated;set request.jwt.claim.sub='${U2}';`);
    expect((await db.query('select * from characters')).rows).toHaveLength(0);
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(0);
    await expect(
      db.query('select enqueue_job($1,$2,$3,$4)', [U1, W1, randomUUID(), 'forged-key']),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      db.query('update workspaces set balance=999999 where id=$1', [W2]),
    ).rejects.toThrow(/permission denied/i);
    await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${U1}';`);
    expect((await db.query('select * from characters')).rows).toHaveLength(1);
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(1);
  });
  it('denies a privileged backend request with the wrong actor', async () => {
    const q = await quote(db);
    await expect(enqueue(db, q, 'malicious-key', U2, W1)).rejects.toThrow('FORBIDDEN');
    expect(await balance(db)).toEqual({ balance: 100, reserved: 0 });
  });
  it('admits only one of two parallel reservations, without overspending or orphan jobs', async () => {
    const q1 = await quote(db),
      q2 = await quote(db);
    const results = await Promise.allSettled([
      enqueue(db, q1, 'parallel-a'),
      enqueue(db, q2, 'parallel-b'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await balance(db)).toEqual({ balance: 100, reserved: 70 });
    expect((await db.query('select * from outbox')).rows).toHaveLength(1);
    expect((await db.query('select * from reservations')).rows).toHaveLength(1);
  });
  it('deduplicates start keys and quotes, and rejects key reuse with a different quote', async () => {
    const q = await quote(db),
      first = await enqueue(db, q);
    expect(await enqueue(db, q)).toBe(first);
    expect(await enqueue(db, q, 'new-key-same-quote')).toBe(first);
    await expect(enqueue(db, await quote(db))).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    expect(await balance(db)).toEqual({ balance: 100, reserved: 70 });
  });
  it('includes in-flight jobs in project spend limits across different workspaces', async () => {
    await db.exec('update project_limits set budget_microusd=150000');
    await enqueue(db, await quote(db));
    await expect(
      enqueue(db, await quote(db, { user: U2, workspace: W2 }), 'other-workspace', U2, W2),
    ).rejects.toThrow('SPEND_LIMIT');
  });
  it('releases exactly once after a definitive preparation or training failure', async () => {
    const j = await enqueue(db, await quote(db));
    await db.query("select settle_job($1,false,'PREPARATION_FAILED')", [j]);
    await db.query("select settle_job($1,false,'PREPARATION_FAILED')", [j]);
    expect(await balance(db)).toEqual({ balance: 100, reserved: 0 });
    expect((await db.query("select * from credit_ledger where kind='release'")).rows).toHaveLength(
      1,
    );
  });
  it('keeps ambiguous reservations and does not submit again after worker restart', async () => {
    const j = await enqueue(db, await quote(db)),
      token = randomUUID();
    await db.query('select claim_job($1,$2)', [j, token]);
    await db.query('select begin_attempt($1,$2)', [j, token]);
    await db.query("update jobs set lease_until=now()-interval '1 minute' where id=$1", [j]);
    const result = (
      await db.query<{ result: { action: string } }>('select claim_job($1,$2)result', [
        j,
        randomUUID(),
      ])
    ).rows[0].result;
    expect(result.action).toBe('unknown');
    await expect(db.query("select settle_job($1,false,'TIMEOUT')", [j])).rejects.toThrow(
      'PROVIDER_NOT_TERMINAL',
    );
    expect(await balance(db)).toEqual({ balance: 100, reserved: 70 });
    expect((await db.query('select * from provider_attempts')).rows).toHaveLength(1);
  });
  it('late signed-callback correlation recovers an unknown attempt without a second submission', async () => {
    const j = await enqueue(db, await quote(db)),
      token = randomUUID();
    await db.query('select claim_job($1,$2)', [j, token]);
    const a = (await db.query<{ id: string }>('select begin_attempt($1,$2)id', [j, token])).rows[0]
      .id;
    await db.query("update jobs set status='unknown',lease_until=null where id=$1", [j]);
    await db.query("update provider_attempts set state='unknown' where id=$1", [a]);
    await db.query('select accept_attempt($1,$2)', [a, 'fal-request-1']);
    const result = (
      await db.query<{ result: { action: string } }>('select claim_job($1,$2)result', [
        j,
        randomUUID(),
      ])
    ).rows[0].result;
    expect(result.action).toBe('reconcile');
    expect((await db.query('select * from provider_attempts')).rows).toHaveLength(1);
  });
  it('captures success only once and ignores later failure settlement', async () => {
    const j = await enqueue(db, await quote(db));
    await db.query(
      "insert into assets(workspace_id,kind,path,mime,bytes,job_id)values($1,'image',$2,'image/jpeg',100,$3)",
      [W1, `${W1}/result.jpg`, j],
    );
    await db.query(
      "insert into provider_attempts(job_id,state,estimated_microusd)values($1,'completed',100000)",
      [j],
    );
    await db.query('select settle_job($1,true)', [j]);
    expect(await balance(db)).toEqual({ balance: 30, reserved: 0 });
    await db.query("select settle_job($1,false,'LATE_ERROR')", [j]);
    expect(await balance(db)).toEqual({ balance: 30, reserved: 0 });
    expect((await db.query("select * from credit_ledger where kind='capture'")).rows).toHaveLength(
      1,
    );
  });
  it('counts failed provider attempts with unconfirmed invoices in cost exposure', async () => {
    const j = await enqueue(db, await quote(db));
    await db.query(
      "insert into provider_attempts(job_id,state,estimated_microusd)values($1,'failed',100000)",
      [j],
    );
    await db.query("select settle_job($1,false,'PROVIDER_GENERATION_FAILED')", [j]);
    expect(
      (await db.query<{ cost: number }>('select cost_exposure()::int cost')).rows[0].cost,
    ).toBe(100000);
  });
  it('deduplicates paid resources across different Stripe events and adjusts partial refunds monotonically', async () => {
    const args = ['evt1', 'checkout1', W1, 'pi1', 'ch1', 1000, 'usd', 1000];
    await db.query('select apply_payment($1,$2,$3,$4,$5,$6,$7,$8)', args);
    args[0] = 'evt2';
    await db.query('select apply_payment($1,$2,$3,$4,$5,$6,$7,$8)', args);
    expect((await balance(db)).balance).toBe(1100);
    await db.query('select apply_refund($1,$2,$3)', ['refund1', 'ch1', 500]);
    await db.query('select apply_refund($1,$2,$3)', ['refund2', 'ch1', 500]);
    await db.query('select apply_refund($1,$2,$3)', ['old-refund', 'ch1', 250]);
    expect((await balance(db)).balance).toBe(600);
  });
  it('handles refund arriving before the paid webhook and blocks forged workspace IDs', async () => {
    await db.query('select apply_refund($1,$2,$3)', ['evt-refund', 'early-charge', 1000]);
    await db.query('select apply_payment($1,$2,$3,$4,$5,$6,$7,$8)', [
      'evt-paid',
      'checkout2',
      W1,
      'pi2',
      'early-charge',
      1000,
      'usd',
      1000,
    ]);
    expect((await balance(db)).balance).toBe(100);
  });
  it('blocks deletion during in-flight jobs and hides tombstoned storage immediately afterwards', async () => {
    const id = randomUUID();
    await db.query(
      "insert into assets(id,workspace_id,kind,path,mime,bytes)values($1,$2,'image',$3,'image/jpeg',100)",
      [id, W1, `${W1}/delete.jpg`],
    );
    await db.query("insert into storage.objects(bucket_id,name)values('creator-private',$1)", [
      `${W1}/delete.jpg`,
    ]);
    const j = await enqueue(db, await quote(db));
    await expect(
      db.query('select request_deletion($1,$2,$3,$4)', [U1, W1, 'asset', id]),
    ).rejects.toThrow('ACTIVE_JOBS_BLOCK_DELETION');
    await db.query("select settle_job($1,false,'PREPARATION_FAILED')", [j]);
    await db.query('select request_deletion($1,$2,$3,$4)', [U1, W1, 'asset', id]);
    await db.exec(`set role authenticated;set request.jwt.claim.sub='${U1}';`);
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(0);
  });
  it('reclaims an expired outbox lease and leaves a live lease alone', async () => {
    await enqueue(db, await quote(db));
    const first = (
      await db.query<{ id: string; lease_token: string }>('select * from claim_outbox(10)')
    ).rows;
    expect(first).toHaveLength(1);
    expect((await db.query('select * from claim_outbox(10)')).rows).toHaveLength(0);
    await db.exec("update outbox set lease_until=now()-interval '1 minute'");
    const second = (await db.query<{ lease_token: string }>('select * from claim_outbox(10)')).rows;
    expect(second[0].lease_token).not.toBe(first[0].lease_token);
  });
});

describe('training snapshots, recovery receipts and deletion races', () => {
  it('snapshots reviewed references and marks a failed training version without capturing credits', async () => {
    const c = randomUUID();
    await db.query(
      "insert into characters(id,workspace_id,name,identity,body,confirmed)values($1,$2,'Test','identity v1','body v1',true)",
      [c, W1],
    );
    for (let i = 0; i < 8; i++) {
      const a = randomUUID();
      await db.query(
        "insert into assets(id,workspace_id,kind,path,mime,bytes,character_id)values($1,$2,'image',$3,'image/jpeg',100,$4)",
        [a, W1, `${W1}/${a}.jpg`, c],
      );
      await db.query(
        "insert into character_references(workspace_id,character_id,asset_id,kind,caption,approved,crop_confirmed)values($1,$2,$3,$4,'reviewed caption',true,true)",
        [W1, c, a, ['face', 'profile', 'body', 'expression'][i % 4]],
      );
    }
    const refs = (await db.query('select * from character_references')).rows;
    const q = await quote(db, { model: 'train' });
    await db.query('update quotes set input=$1,context=$2 where id=$3', [
      JSON.stringify({ model: 'train', characterId: c, steps: 100 }),
      JSON.stringify({ identity: 'identity v1', body: 'body v1', references: refs, assets: [] }),
      q,
    ]);
    const j = await enqueue(db, q);
    await db.query("update characters set identity='identity v2' where id=$1", [c]);
    expect(
      (
        await db.query<{ identity_snapshot: string }>(
          'select identity_snapshot from character_versions',
        )
      ).rows[0].identity_snapshot,
    ).toBe('identity v1');
    await db.query(
      "insert into provider_attempts(job_id,state,estimated_microusd)values($1,'failed',100000)",
      [j],
    );
    await db.query("select settle_job($1,false,'TRAINING_FAILED')", [j]);
    expect(
      (await db.query<{ status: string }>('select status from character_versions')).rows[0].status,
    ).toBe('failed');
    expect(await balance(db)).toEqual({ balance: 100, reserved: 0 });
  });
  it('refuses to capture when only the uploaded dataset survived a worker crash', async () => {
    const j = await enqueue(db, await quote(db));
    await db.query(
      "insert into provider_attempts(job_id,state,estimated_microusd)values($1,'completed',100000)",
      [j],
    );
    await db.query(
      "insert into assets(workspace_id,kind,path,mime,bytes,job_id)values($1,'dataset',$2,'application/zip',100,$3)",
      [W1, `${W1}/only-dataset.zip`, j],
    );
    await expect(db.query('select settle_job($1,true)', [j])).rejects.toThrow(
      'RESULTS_NOT_PERSISTED',
    );
    expect((await balance(db)).reserved).toBe(70);
  });
  it('retains a persisted receipt through restart and captures only after the provider is terminal', async () => {
    const j = await enqueue(db, await quote(db)),
      token = randomUUID();
    await db.query('select claim_job($1,$2)', [j, token]);
    const a = (await db.query<{ id: string }>('select begin_attempt($1,$2)id', [j, token])).rows[0]
      .id;
    await db.query('select accept_attempt($1,$2)', [a, 'restarted-request']);
    await db.query(
      "insert into assets(workspace_id,kind,path,mime,bytes,job_id)values($1,'image',$2,'image/jpeg',100,$3)",
      [W1, `${W1}/saved-before-crash.jpg`, j],
    );
    await expect(db.query('select settle_job($1,true)', [j])).rejects.toThrow(
      'PROVIDER_NOT_TERMINAL',
    );
    await db.query("update jobs set lease_until=now()-interval '1 minute' where id=$1", [j]);
    expect(
      (await db.query<{ r: { action: string } }>('select claim_job($1,$2)r', [j, randomUUID()]))
        .rows[0].r.action,
    ).toBe('reconcile');
    await db.query("update provider_attempts set state='completed' where id=$1", [a]);
    await db.query('select settle_job($1,true)', [j]);
    expect(await balance(db)).toEqual({ balance: 30, reserved: 0 });
  });
  it('requires provider evidence for manual unknown resolution and keeps late success from double charging', async () => {
    const j = await enqueue(db, await quote(db)),
      token = randomUUID();
    await db.query('select claim_job($1,$2)', [j, token]);
    const a = (await db.query<{ id: string }>('select begin_attempt($1,$2)id', [j, token])).rows[0]
      .id;
    await db.query("update jobs set lease_until=null,status='unknown' where id=$1", [j]);
    await db.query("update provider_attempts set state='unknown' where id=$1", [a]);
    await expect(
      db.query('select resolve_unaccepted($1,$2,$3)', [U1, a, 'timeout']),
    ).rejects.toThrow('PROVIDER_EVIDENCE_REQUIRED');
    await db.query('select resolve_unaccepted($1,$2,$3)', [
      U1,
      a,
      'Support ticket FAL-12345: no acceptance or charge',
    ]);
    expect((await balance(db)).reserved).toBe(0);
    await db.query('select accept_attempt($1,$2)', [a, 'unexpected-late-id']);
    expect(
      (await db.query<{ status: string }>('select status from jobs where id=$1', [j])).rows[0]
        .status,
    ).toBe('failed');
    expect((await db.query('select * from audit_log')).rows).toHaveLength(1);
  });
  it('prevents an upload from registering after its character is deleted and prevents resurrection', async () => {
    const c = randomUUID(),
      a = randomUUID();
    await db.query("insert into characters(id,workspace_id,name)values($1,$2,'Delete race')", [
      c,
      W1,
    ]);
    await db.query('select request_deletion($1,$2,$3,$4)', [U1, W1, 'character', c]);
    const asset = {
      id: a,
      kind: 'image',
      path: `${W1}/${a}.jpg`,
      mime: 'image/jpeg',
      bytes: 100,
      character_id: c as string | null,
    };
    await expect(
      db.query('select register_asset($1,$2,$3)', [U1, W1, JSON.stringify(asset)]),
    ).rejects.toThrow('CHARACTER_NOT_FOUND');
    asset.character_id = null;
    await db.query('select register_asset($1,$2,$3)', [U1, W1, JSON.stringify(asset)]);
    await db.query('select request_deletion($1,$2,$3,$4)', [U1, W1, 'asset', a]);
    await expect(
      db.query('select register_asset($1,$2,$3)', [U1, W1, JSON.stringify(asset)]),
    ).rejects.toThrow('ASSET_NOT_FOUND');
  });
  it('deduplicates webhook envelopes and retains negative credit debt after spent funds are refunded', async () => {
    await db.exec(
      "insert into webhook_inbox(provider,event_id,payload,body_hash)values('stripe','event-1','{}','h')on conflict do nothing;insert into webhook_inbox(provider,event_id,payload,body_hash)values('stripe','event-1','{}','h')on conflict do nothing;",
    );
    expect((await db.query('select * from webhook_inbox')).rows).toHaveLength(1);
    await db.query('select apply_payment($1,$2,$3,$4,$5,$6,$7,$8)', [
      'paid-debt',
      'paid-debt',
      W1,
      'pi-debt',
      'ch-debt',
      1000,
      'usd',
      1000,
    ]);
    await db.query('update workspaces set balance=50 where id=$1', [W1]);
    await db.query('select apply_refund($1,$2,$3)', ['ref-debt', 'ch-debt', 1000]);
    expect((await balance(db)).balance).toBe(-950);
    await expect(enqueue(db, await quote(db))).rejects.toThrow('INSUFFICIENT_CREDITS');
  });
});
