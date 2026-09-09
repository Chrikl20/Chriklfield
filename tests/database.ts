import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
export const U1 = '11111111-1111-4111-8111-111111111111',
  U2 = '22222222-2222-4222-8222-222222222222';
export const W1 = '33333333-3333-4333-8333-333333333333',
  W2 = '44444444-4444-4444-8444-444444444444';
export const bootstrapSql = `create role anon;create role authenticated;create role service_role bypassrls;alter default privileges in schema public grant all on tables to anon,authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated,service_role;grant select on storage.objects to authenticated;`;
export async function migrations() {
  const files = (await readdir('supabase/migrations'))
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort();
  return (await Promise.all(files.map((f) => readFile(`supabase/migrations/${f}`, 'utf8')))).join(
    '\n',
  );
}
export const seedSql = `insert into auth.users values('${U1}'),('${U2}');insert into workspaces(id,owner_id,balance)values('${W1}','${U1}',100),('${W2}','${U2}',100);insert into memberships values('${W1}','${U1}','owner'),('${W2}','${U2}','owner');update model_prices set enabled=true,unit_microusd=10000,verified_at=now(),version='test-v1';`;
export async function makeDb() {
  const db = new PGlite();
  await db.exec(bootstrapSql);
  await db.exec(await migrations());
  await db.exec(seedSql);
  return db;
}
export async function quote(
  db: PGlite,
  options: {
    user?: string;
    workspace?: string;
    credits?: number;
    cost?: number;
    model?: string;
  } = {},
) {
  const { rows } = await db.query<{ id: string }>(
    `insert into quotes(workspace_id,user_id,model,input,context,input_hash,credits,estimated_microusd,pricing_version,expires_at)values($1,$2,$3,'{"model":"draft","prompt":"fixture"}','{"assets":[],"references":[]}','fixture',$4,$5,'test:test-v1',now()+interval '10 minutes')returning id`,
    [
      options.workspace || W1,
      options.user || U1,
      options.model || 'draft',
      options.credits || 70,
      options.cost || 100000,
    ],
  );
  return rows[0].id;
}
export async function enqueue(db: PGlite, q: string, key = 'idempotency-001', u = U1, w = W1) {
  return (await db.query<{ id: string }>('select enqueue_job($1,$2,$3,$4) id', [u, w, q, key]))
    .rows[0].id;
}
export async function balance(db: PGlite, w = W1) {
  return (
    await db.query<{ balance: number; reserved: number }>(
      'select balance::int,reserved::int from workspaces where id=$1',
      [w],
    )
  ).rows[0];
}
