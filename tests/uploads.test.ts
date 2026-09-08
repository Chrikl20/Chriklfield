import { describe, test, expect } from 'vitest';
import { makeDb, U1, U2, W1, W2 } from './database';
import type { PGlite } from '@electric-sql/pglite';
import type { UploadIntent } from '@/domain/uploads';
async function start(
  db: PGlite,
  key = 'upload-key-0001',
  user = U1,
  workspace = W1,
  character: string | null = null,
) {
  return (
    await db.query<UploadIntent>('select * from begin_upload($1,$2,$3,$4,$5,$6)', [
      user,
      workspace,
      character,
      'image/jpeg',
      1000,
      key,
    ])
  ).rows[0];
}
async function queue(db: PGlite, id: string, user = U1, workspace = W1) {
  await db.query('select queue_upload($1,$2,$3)', [user, workspace, id]);
}
async function claim(db: PGlite, id: string) {
  return (await db.query<UploadIntent>('select * from claim_upload($1)', [id])).rows[0];
}
const meta = { mime: 'image/jpeg', bytes: 1500, width: 300, height: 400, duration: null };
describe('private direct uploads', () => {
  test('denies another user, direct RPC access and reads of unvalidated storage', async () => {
    const db = await makeDb();
    try {
      const u = await start(db);
      await expect(start(db, 'foreign-key', U2, W1)).rejects.toThrow('FORBIDDEN');
      await expect(queue(db, u.id, U2, W2)).rejects.toThrow('UPLOAD_NOT_FOUND');
      await db.exec(`insert into storage.objects(bucket_id,name)values('creator-intake-images','${u.path}');
        set role authenticated;select set_config('request.jwt.claim.sub','${U1}',false);`);
      expect((await db.query('select * from storage.objects')).rows).toHaveLength(0);
      await expect(db.query('select * from upload_intents')).rejects.toThrow('permission denied');
      await expect(start(db, 'forged-key')).rejects.toThrow('permission denied');
      await db.exec('reset role');
      expect(
        (
          await db.query(
            `select has_function_privilege('authenticated','public.finish_upload(uuid,uuid,jsonb)','EXECUTE') allowed`,
          )
        ).rows[0],
      ).toEqual({ allowed: false });
    } finally {
      await db.close();
    }
  });
  test('serializes storage reservations, freezes idempotent input and reserves bucket capacity', async () => {
    const db = await makeDb();
    try {
      await db.query('update workspaces set storage_limit_bytes=$1 where id=$2', [
        50 * 1024 * 1024,
        W1,
      ]);
      const attempts = await Promise.allSettled([
        start(db, 'upload-0001'),
        start(db, 'upload-0002'),
        start(db, 'upload-0003'),
      ]);
      expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(2);
      const original = await start(db, 'upload-0001');
      expect((await start(db, 'upload-0001')).id).toBe(original.id);
      await expect(
        db.query('select begin_upload($1,$2,null,$3,$4,$5)', [
          U1,
          W1,
          'image/jpeg',
          900,
          'upload-0001',
        ]),
      ).rejects.toThrow('IDEMPOTENCY_CONFLICT');
      expect(
        Number(
          (await db.query<{ n: number }>('select upload_reserved_bytes($1) n', [W1])).rows[0].n,
        ),
      ).toBe(40 * 1024 * 1024);
      // Generated files must respect the capacity held by pending uploads.
      await expect(
        db.query('select register_asset($1,$2,$3)', [
          U1,
          W1,
          {
            id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            path: `${W1}/fixture.jpg`,
            kind: 'image',
            mime: 'image/jpeg',
            bytes: 11 * 1024 * 1024,
          },
        ]),
      ).rejects.toThrow('STORAGE_LIMIT');
    } finally {
      await db.close();
    }
  });
  test('deduplicates completion, fences a restarted worker and publishes exactly one asset', async () => {
    const db = await makeDb();
    try {
      const u = await start(db);
      await queue(db, u.id);
      await queue(db, u.id);
      const first = await claim(db, u.id);
      expect((await claim(db, u.id)).id).toBeNull();
      await db.query(
        "update upload_intents set lease_until=now()-interval '1 second' where id=$1",
        [u.id],
      );
      const second = await claim(db, u.id);
      expect(second.lease_token).not.toBe(first.lease_token);
      await expect(
        db.query('select finish_upload($1,$2,$3)', [u.id, first.lease_token, meta]),
      ).rejects.toThrow('UPLOAD_LEASE_LOST');
      expect((await db.query('select * from assets')).rows).toHaveLength(0);
      await db.query('select finish_upload($1,$2,$3)', [u.id, second.lease_token, meta]);
      await db.query('select finish_upload($1,$2,$3)', [u.id, second.lease_token, meta]);
      await db.query('select retry_upload($1,$2,$3,false)', [
        u.id,
        first.lease_token,
        'UPLOAD_STORAGE_UNAVAILABLE',
      ]);
      expect((await db.query('select id from assets')).rows).toEqual([{ id: u.asset_id }]);
      expect((await db.query('select state from upload_intents')).rows[0]).toEqual({
        state: 'ready',
      });
      expect(
        Number(
          (await db.query<{ n: number }>('select upload_reserved_bytes($1) n', [W1])).rows[0].n,
        ),
      ).toBe(10 * 1024 * 1024);
    } finally {
      await db.close();
    }
  });
  test('bounds recovery attempts and blocks deletion until validation stops', async () => {
    const db = await makeDb();
    try {
      const u = await start(db);
      await queue(db, u.id);
      await expect(
        db.query("select request_deletion($1,$2,'workspace',$2)", [U1, W1]),
      ).rejects.toThrow('ACTIVE_UPLOADS_BLOCK_DELETION');
      for (let i = 0; i < 5; i++) {
        const leased = await claim(db, u.id);
        await db.query('select retry_upload($1,$2,$3,false)', [
          u.id,
          leased.lease_token,
          'UPLOAD_STORAGE_UNAVAILABLE',
        ]);
      }
      expect((await db.query('select state,attempts from upload_intents')).rows[0]).toEqual({
        state: 'failed',
        attempts: 5,
      });
      expect((await claim(db, u.id)).id).toBeNull();
      await db.query("select request_deletion($1,$2,'workspace',$2)", [U1, W1]);
      await expect(start(db, 'after-deletion')).rejects.toThrow('FORBIDDEN');
    } finally {
      await db.close();
    }
  });
  test('expires abandoned uploads while retaining raw capacity until token expiry and purge', async () => {
    const db = await makeDb();
    try {
      const u = await start(db);
      await db.query("update upload_intents set expires_at=now()-interval '1 minute' where id=$1", [
        u.id,
      ]);
      await expect(queue(db, u.id)).rejects.toThrow('UPLOAD_EXPIRED');
      await db.query('select expire_uploads()');
      expect(
        (await db.query('select state,error_code,raw_purged_at from upload_intents')).rows[0],
      ).toEqual({ state: 'failed', error_code: 'UPLOAD_EXPIRED', raw_purged_at: null });
      expect(
        Number(
          (await db.query<{ n: number }>('select upload_reserved_bytes($1) n', [W1])).rows[0].n,
        ),
      ).toBe(10 * 1024 * 1024);
    } finally {
      await db.close();
    }
  });
});
