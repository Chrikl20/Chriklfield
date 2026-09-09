import { schedules, task } from '@trigger.dev/sdk';
import { processJob } from '@/server/worker';
import { alert } from '@/server/alerts';
import { dispatchOutbox, dispatchUpload } from '@/server/dispatch';
import { processUpload, purgeUploadStaging } from '@/server/media/upload-worker';
import { adminClient } from '@/server/database';
import { check } from '@/server/repository';
import { purgeDeletedAssets } from '@/server/deletion';
export const creatorJob = task({
  id: 'creator-job',
  maxDuration: 600,
  retry: { maxAttempts: 3, minTimeoutInMs: 5000, maxTimeoutInMs: 30000, factor: 2 },
  machine: 'medium-1x',
  run: async (payload: { jobId: string }) => processJob(payload.jobId),
});
export const recoverJobs = schedules.task({
  id: 'recover-jobs',
  cron: '* * * * *',
  run: async () => {
    await dispatchOutbox();
    const jobs = check(
      await adminClient()
        .from('jobs')
        .select('id')
        .in('status', ['queued', 'submitting', 'unknown', 'running', 'persisting'])
        .order('updated_at', { ascending: true })
        .limit(50),
    );
    // Read/recovery tasks may repeat; the database's attempt journal prevents a repeated provider POST.
    for (const j of jobs)
      await creatorJob.trigger(
        { jobId: j.id },
        {
          idempotencyKey: `reconcile:${j.id}:${Math.floor(Date.now() / 60000)}`,
          idempotencyKeyTTL: '5m',
        },
      );
    return { checked: jobs.length };
  },
});
export const retention = schedules.task({
  id: 'private-retention',
  cron: '17 * * * *',
  run: async () => purgeDeletedAssets(),
});
export const recoverStripe = schedules.task({
  id: 'recover-payments',
  cron: '*/5 * * * *',
  run: async () => {
    const { recoverPayments } = await import('@/server/billing/recovery');
    return recoverPayments();
  },
});

export const mediaUpload = task({
  id: 'media-upload',
  maxDuration: 300,
  machine: 'medium-1x',
  queue: { concurrencyLimit: 5 },
  retry: { maxAttempts: 3, minTimeoutInMs: 5000, maxTimeoutInMs: 30000, factor: 2 },
  run: async (payload: { uploadId: string }) => processUpload(payload.uploadId),
});
export const recoverUploads = schedules.task({
  id: 'recover-uploads',
  cron: '* * * * *',
  run: async () => {
    const db = adminClient();
    await purgeUploadStaging();
    const uploads = check(
      await db
        .from('upload_intents')
        .select('id')
        .in('state', ['queued', 'processing'])
        .order('created_at')
        .limit(50),
    );
    for (const u of uploads) {
      try {
        await dispatchUpload(u.id);
      } catch {
        await alert('UPLOAD_DISPATCH_FAILED', u.id);
      }
    }
    return { checked: uploads.length };
  },
});
