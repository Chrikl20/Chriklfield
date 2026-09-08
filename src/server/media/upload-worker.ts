import { adminClient } from '../database';
import { check, ownedCharacter } from '../repository';
import { assertActor } from '../access';
import { normalizeMedia } from './files';
import { detectMedia } from './validation';
import { BUCKET } from './storage';
import type { UploadIntent } from '@/domain/uploads';

type Media = Awaited<ReturnType<typeof normalizeMedia>>;
export interface UploadServices {
  claim(id: string): Promise<UploadIntent | null>;
  authorize(u: UploadIntent): Promise<void>;
  read(u: UploadIntent): Promise<Buffer>;
  normalize(bytes: Buffer): Promise<Media>;
  persist(u: UploadIntent, media: Media): Promise<void>;
  retry(u: UploadIntent, code: string, terminal: boolean): Promise<void>;
}
const terminalCodes = new Set([
  'FORBIDDEN',
  'CHARACTER_NOT_FOUND',
  'UNSUPPORTED_MEDIA',
  'UPLOAD_SIZE_MISMATCH',
  'FILE_TOO_LARGE',
  'IMAGE_LIMITS',
  'VIDEO_LIMITS',
  'INVALID_IMAGE',
  'INVALID_VIDEO',
  'STORAGE_LIMIT',
]);

export async function runUpload(id: string, services: UploadServices) {
  const u = await services.claim(id);
  if (!u?.id || !u.lease_token) return { claimed: false };
  try {
    await services.authorize(u);
    const bytes = await services.read(u);
    if (bytes.length !== Number(u.expected_bytes)) throw new Error('UPLOAD_SIZE_MISMATCH');
    if (bytes.length > Number(u.capacity_bytes)) throw new Error('FILE_TOO_LARGE');
    if (detectMedia(bytes) !== u.kind) throw new Error('UNSUPPORTED_MEDIA');
    const media = await services.normalize(bytes);
    if (media.bytes.length > Number(u.capacity_bytes)) throw new Error('FILE_TOO_LARGE');
    // Re-check membership/character after expensive processing as well.
    await services.authorize(u);
    await services.persist(u, media);
    return { claimed: true, ready: true };
  } catch (e) {
    const code =
      e instanceof Error && /^[A-Z_]{1,64}$/.test(e.message)
        ? e.message
        : 'UPLOAD_PROCESSING_FAILED';
    // A timed-out commit may already be ready. The RPC only touches this exact processing lease.
    await services.retry(u, code, terminalCodes.has(code));
    return { claimed: true, ready: false };
  }
}
export function processUpload(id: string) {
  const db = adminClient();
  return runUpload(id, {
    claim: async (id) =>
      check(await db.rpc('claim_upload', { p_upload: id })) as UploadIntent | null,
    authorize: async (u) => {
      const actor = { userId: u.user_id, workspaceId: u.workspace_id, admin: false };
      await assertActor(actor);
      if (u.character_id) await ownedCharacter(actor, u.character_id);
    },
    read: async (u) => {
      const { data, error } = await db.storage.from(u.bucket).download(u.path);
      if (error || !data) throw new Error('UPLOAD_STORAGE_UNAVAILABLE');
      return Buffer.from(await data.arrayBuffer());
    },
    normalize: async (bytes) => {
      try {
        return await normalizeMedia(bytes);
      } catch (e) {
        if (e instanceof Error && terminalCodes.has(e.message)) throw e;
        // Missing FFmpeg is an installation fault; do not blame a user's file.
        if ((e as NodeJS.ErrnoException).code === 'ENOENT')
          throw new Error('UPLOAD_WORKER_NOT_CONFIGURED');
        throw new Error(detectMedia(bytes) === 'image' ? 'INVALID_IMAGE' : 'INVALID_VIDEO');
      }
    },
    persist: async (u, media) => {
      const path = `${u.workspace_id}/${u.asset_id}/asset.${media.extension}`;
      check(
        await db.storage
          .from(BUCKET)
          .upload(path, media.bytes, { contentType: media.mime, upsert: true }),
      );
      check(
        await db.rpc('finish_upload', {
          p_upload: u.id,
          p_lease: u.lease_token,
          p_meta: {
            mime: media.mime,
            bytes: media.bytes.length,
            width: media.width,
            height: media.height,
            duration: media.duration,
          },
        }),
      );
    },
    retry: async (u, code, terminal) => {
      check(
        await db.rpc('retry_upload', {
          p_upload: u.id,
          p_lease: u.lease_token,
          p_code: code,
          p_terminal: terminal,
        }),
      );
    },
  });
}

export async function purgeUploadStaging() {
  const db = adminClient();
  check(await db.rpc('expire_uploads'));
  const rows = check(
    await db
      .from('upload_intents')
      .select('id,workspace_id,asset_id,kind,bucket,path,state')
      .in('state', ['ready', 'failed'])
      .lt('cleanup_after', new Date().toISOString())
      .is('raw_purged_at', null)
      .limit(100),
  );
  for (const u of rows) {
    check(await db.storage.from(u.bucket).remove([u.path]));
    if (u.state === 'failed') {
      // Recover an orphan normalized object after a crash before its DB transaction.
      const existing = check(
        await db.from('assets').select('id').eq('id', u.asset_id).maybeSingle(),
      );
      if (!existing)
        check(
          await db.storage
            .from(BUCKET)
            .remove([
              `${u.workspace_id}/${u.asset_id}/asset.${u.kind === 'image' ? 'jpg' : 'mp4'}`,
            ]),
        );
    }
    check(
      await db
        .from('upload_intents')
        .update({ raw_purged_at: new Date().toISOString() })
        .eq('id', u.id),
    );
  }
  return rows.length;
}
