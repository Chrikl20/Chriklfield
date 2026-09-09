import { adminClient } from '../database';
import { check } from '../repository';
import { assertActor } from '../access';
import { required } from '../config';
import type { Actor } from '@/domain/types';
import {
  uploadSchema,
  uploadStatus,
  uploadStatusFields,
  type UploadIntent,
  type UploadStatus,
} from '@/domain/uploads';

export async function prepareUpload(a: Actor, input: unknown) {
  await assertActor(a);
  required('TRIGGER_SECRET_KEY'); // Do not issue large-upload tickets before a worker is configured.
  const b = uploadSchema.parse(input),
    db = adminClient();
  const u = check(
    await db.rpc('begin_upload', {
      p_user: a.userId,
      p_workspace: a.workspaceId,
      p_character: b.characterId,
      p_mime: b.mime,
      p_bytes: b.bytes,
      p_key: b.idempotencyKey,
    }),
  ) as UploadIntent;
  // Supabase fixes token validity at two hours. Allow signing only in the first ten minutes;
  // raw objects are retained until 135 minutes after creation to prevent re-upload after purge.
  if (u.state !== 'awaiting' || Date.now() > Date.parse(u.created_at) + 10 * 60000)
    throw new Error('UPLOAD_EXPIRED');
  const signed = check(
    await db.storage.from(u.bucket).createSignedUploadUrl(u.path, { upsert: false }),
  );
  return { ...uploadStatus(u), bucket: u.bucket, path: u.path, token: signed.token };
}
export async function completeUpload(a: Actor, id: string) {
  await assertActor(a);
  return uploadStatus(
    check(
      await adminClient().rpc('queue_upload', {
        p_user: a.userId,
        p_workspace: a.workspaceId,
        p_upload: id,
      }),
    ) as UploadIntent,
  );
}
export async function ownedUpload(a: Actor, id: string) {
  await assertActor(a);
  const u = check(
    await adminClient()
      .from('upload_intents')
      .select(uploadStatusFields)
      .eq('id', id)
      .eq('user_id', a.userId)
      .eq('workspace_id', a.workspaceId)
      .maybeSingle(),
  ) as UploadStatus | null;
  if (!u) throw new Error('UPLOAD_NOT_FOUND');
  return u;
}
