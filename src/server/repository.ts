import { adminClient } from '@/server/database';
import { assertActor } from './access';
import { uploadStatusFields, type UploadStatus } from '@/domain/uploads';
import type {
  Actor,
  Asset,
  Character,
  CharacterVersion,
  Reference,
  Job,
  ModelPrice,
  Template,
  Snapshot,
} from '@/domain/types';
export function check<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) {
    const code = result.error.message.match(/\b[A-Z][A-Z_]{3,}\b/)?.[0];
    throw new Error(code || 'DATABASE_ERROR');
  }
  return result.data as NonNullable<T>;
}
export async function ownedAsset(a: Actor, id: string) {
  await assertActor(a);
  const asset = check(
    await adminClient()
      .from('assets')
      .select('*')
      .eq('id', id)
      .eq('workspace_id', a.workspaceId)
      .is('deleted_at', null)
      .maybeSingle(),
  ) as Asset | null;
  if (!asset) throw new Error('ASSET_NOT_FOUND');
  return asset;
}
export async function ownedCharacter(a: Actor, id: string) {
  await assertActor(a);
  const c = check(
    await adminClient()
      .from('characters')
      .select('*')
      .eq('id', id)
      .eq('workspace_id', a.workspaceId)
      .is('deleted_at', null)
      .maybeSingle(),
  ) as Character | null;
  if (!c) throw new Error('CHARACTER_NOT_FOUND');
  return c;
}
export async function liveSnapshot(a: Actor): Promise<Snapshot> {
  await assertActor(a);
  const db = adminClient();
  const [cs, vs, rs, as, js, ts, ps, ws, ls, us] = await Promise.all([
    db
      .from('characters')
      .select('*')
      .eq('workspace_id', a.workspaceId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    db
      .from('character_versions')
      .select('*')
      .eq('workspace_id', a.workspaceId)
      .order('version', { ascending: false }),
    db.from('character_references').select('*').eq('workspace_id', a.workspaceId),
    db
      .from('assets')
      .select('*')
      .eq('workspace_id', a.workspaceId)
      .is('deleted_at', null)
      .in('kind', ['image', 'video'])
      .order('created_at', { ascending: false })
      .limit(200),
    db
      .from('jobs')
      .select(
        'id,workspace_id,user_id,input,model,status,credits,estimated_microusd,error_code,created_at,version_id',
      )
      .eq('workspace_id', a.workspaceId)
      .order('created_at', { ascending: false })
      .limit(50),
    db.from('templates').select('*').eq('enabled', true),
    db.from('model_prices').select('*'),
    db.from('workspaces').select('balance,reserved,plan').eq('id', a.workspaceId).single(),
    db
      .from('credit_ledger')
      .select('id,kind,amount,created_at')
      .eq('workspace_id', a.workspaceId)
      .order('created_at', { ascending: false })
      .limit(50),
    db
      .from('upload_intents')
      .select(uploadStatusFields)
      .eq('workspace_id', a.workspaceId)
      .eq('user_id', a.userId)
      .neq('state', 'ready')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);
  const w = check(ws);
  const assets = check(as) as Asset[];
  // Browser receives only app-authenticated URLs, never provider URLs or private weights.
  return {
    mode: 'live',
    workspaceId: a.workspaceId,
    userId: a.userId,
    admin: a.admin,
    characters: check(cs) as Character[],
    versions: check(vs) as CharacterVersion[],
    references: check(rs) as Reference[],
    assets: assets.map((x) => ({ ...x, path: '', url: `/api/assets/${x.id}` })),
    uploads: check(us) as unknown as UploadStatus[],
    jobs: check(js) as Job[],
    templates: check(ts) as Template[],
    prices: check(ps) as ModelPrice[],
    balance: Number(w.balance),
    reserved: Number(w.reserved),
    plan: w.plan,
    ledger: check(ls),
  };
}
