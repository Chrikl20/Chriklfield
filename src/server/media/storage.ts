import { randomUUID } from 'node:crypto';
import { adminClient } from '@/server/database';
import type { Actor, Asset } from '@/domain/types';
import { assertActor } from '../access';
import { check, ownedAsset } from '../repository';
export const BUCKET = 'creator-private';
export async function readAssetBytes(actor: Actor, id: string) {
  const asset = await ownedAsset(actor, id);
  const file = check(await adminClient().storage.from(BUCKET).download(asset.path));
  return Buffer.from(await file.arrayBuffer());
}
export async function signedAssetUrl(actor: Actor, id: string, seconds = 3600) {
  const asset = await ownedAsset(actor, id);
  return check(await adminClient().storage.from(BUCKET).createSignedUrl(asset.path, seconds))
    .signedUrl;
}
export async function savePrivateAsset(
  actor: Actor,
  bytes: Buffer,
  meta: Omit<Asset, 'id' | 'path' | 'url' | 'favorite' | 'deleted_at'>,
  options: { id?: string; extension: string },
): Promise<Asset> {
  await assertActor(actor);
  const id = options.id || randomUUID(),
    objectPath = `${actor.workspaceId}/${id}/asset.${options.extension}`;
  const db = adminClient();
  const existing = check(
    await db
      .from('assets')
      .select('*')
      .eq('id', id)
      .eq('workspace_id', actor.workspaceId)
      .maybeSingle(),
  ) as Asset | null;
  if (existing) {
    if (existing.deleted_at) throw new Error('ASSET_NOT_FOUND');
    return existing;
  }
  check(
    await db.storage
      .from(BUCKET)
      .upload(objectPath, bytes, { contentType: meta.mime, upsert: true }),
  );
  // Deterministic job-derived IDs permit persistence retries after a worker crash.
  const asset = {
    ...meta,
    id,
    path: objectPath,
    workspace_id: actor.workspaceId,
    favorite: false,
    deleted_at: null,
  };
  try {
    return check(
      await db.rpc('register_asset', {
        p_user: actor.userId,
        p_workspace: actor.workspaceId,
        p_asset: asset,
      }),
    ) as Asset;
  } catch (e) {
    // A failed/ambiguous DB response may still have committed. Preserve its durable object.
    const receipt = await db
      .from('assets')
      .select('id')
      .eq('id', id)
      .eq('workspace_id', actor.workspaceId)
      .maybeSingle();
    if (!receipt.error && !receipt.data) await db.storage.from(BUCKET).remove([objectPath]);
    throw e;
  }
}
