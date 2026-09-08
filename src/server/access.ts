import type { Actor } from '@/domain/types';
import { adminClient } from './database';
export async function assertActor(a: Actor) {
  const { error } = await adminClient().rpc('assert_member', { w: a.workspaceId, u: a.userId });
  if (error) throw new Error('FORBIDDEN');
}
