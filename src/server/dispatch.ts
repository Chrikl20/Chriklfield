// This entry is safe to import from Vercel: worker code is only imported as a type.
import { tasks } from '@trigger.dev/sdk';
import type { creatorJob, mediaUpload } from '@/trigger/jobs';
import { adminClient } from './database';
import { check } from './repository';
import { alert } from './alerts';
export async function dispatchUpload(id: string) {
  return tasks.trigger<typeof mediaUpload>(
    'media-upload',
    { uploadId: id },
    {
      idempotencyKey: `upload:${id}:${Math.floor(Date.now() / 60000)}`,
      idempotencyKeyTTL: '5m',
    },
  );
}
export async function dispatchOutbox() {
  const db = adminClient();
  const entries = check(await db.rpc('claim_outbox', { p_limit: 10 })) as {
    id: string;
    job_id: string;
    lease_token: string;
  }[];
  for (const entry of entries) {
    try {
      await tasks.trigger<typeof creatorJob>(
        'creator-job',
        { jobId: entry.job_id },
        { idempotencyKey: `dispatch:${entry.job_id}`, idempotencyKeyTTL: '24h' },
      );
      check(
        await db
          .from('outbox')
          .update({ state: 'sent', lease_until: null })
          .eq('id', entry.id)
          .eq('lease_token', entry.lease_token),
      );
    } catch {
      check(
        await db
          .from('outbox')
          .update({ state: 'pending', available_at: new Date(Date.now() + 60000).toISOString() })
          .eq('id', entry.id)
          .eq('lease_token', entry.lease_token),
      );
      await alert('DISPATCH_FAILED', entry.job_id);
    }
  }
  return entries.length;
}
