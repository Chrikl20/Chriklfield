import 'server-only';
import type { Actor } from '@/domain/types';
import { isAdmin, mode } from './config';
import { userClient } from '@/lib/supabase/server';
import { adminClient } from './database';
export const DEMO_ACTOR: Actor = {
  userId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  admin: true,
};
export async function actor(): Promise<Actor> {
  if (mode() === 'demo') return DEMO_ACTOR;
  const client = await userClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error('UNAUTHENTICATED');
  const { data: w, error: e } = await adminClient().rpc('bootstrap_workspace', {
    p_user: data.user.id,
  });
  if (e) throw new Error('WORKSPACE_UNAVAILABLE');
  return { userId: data.user.id, workspaceId: w, admin: isAdmin(data.user.id) };
}
export { assertActor } from './access';
