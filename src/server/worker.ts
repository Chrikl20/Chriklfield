import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Actor, Job, ProviderAttempt } from '@/domain/types';
import { adminClient } from './database';
import { alert } from './alerts';
import { assertActor } from './access';
import { check, ownedAsset } from './repository';
import { appUrl, assertGenerationEnabled } from './config';
import {
  buildProviderInput,
  FalProvider,
  parseProviderResult,
  ProviderRejected,
  type Provider,
  type ProviderResult,
} from './providers/fal';
import { webhookBinding } from './providers/webhook';
import { buildTrainingArchive, normalizeMedia } from './media/files';
import { downloadToFile } from './media/download';
import { MAX_WEIGHT_BYTES, validateSafetensors } from './media/validation';
import { readAssetBytes, savePrivateAsset, signedAssetUrl } from './media/storage';
import type { JobContext } from './quotes';
type DurableJob = Job & { context: JobContext };
export function outputId(jobId: string, index: number) {
  const h = createHash('sha256').update(`${jobId}:${index}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
async function persistResult(actor: Actor, job: DurableJob, result: ProviderResult) {
  const dir = await mkdtemp(path.join(tmpdir(), 'chriklfield-result-'));
  try {
    for (const [i, file] of result.files.entries()) {
      await assertActor(actor);
      const id = outputId(job.id, i);
      const existing = check(
        await adminClient()
          .from('assets')
          .select('id')
          .eq('id', id)
          .eq('workspace_id', actor.workspaceId)
          .maybeSingle(),
      );
      if (existing) continue;
      const local = path.join(dir, `${i}`);
      await downloadToFile(
        file.url,
        local,
        file.kind === 'weights'
          ? MAX_WEIGHT_BYTES
          : file.kind === 'config'
            ? 1024 * 1024
            : file.kind === 'video'
              ? 100 * 1024 * 1024
              : 10 * 1024 * 1024,
      );
      let bytes = await readFile(local);
      let mime = file.mime,
        ext = file.kind === 'weights' ? 'safetensors' : 'json',
        width: number | null = null,
        height: number | null = null,
        duration: number | null = null;
      if (file.kind === 'image' || file.kind === 'video') {
        const normalized = await normalizeMedia(bytes);
        if (normalized.kind !== file.kind) throw new Error('RESULT_MEDIA_MISMATCH');
        ({ bytes, mime, width, height, duration } = normalized);
        ext = normalized.extension;
      } else if (file.kind === 'weights') validateSafetensors(bytes);
      else JSON.parse(bytes.toString('utf8'));
      await savePrivateAsset(
        actor,
        bytes,
        {
          kind: file.kind,
          mime,
          bytes: bytes.length,
          width,
          height,
          duration,
          character_id: job.input.characterId || null,
          job_id: job.id,
        },
        { id, extension: ext },
      );
    }
    if (job.model === 'train')
      check(
        await adminClient()
          .from('character_versions')
          .update({ weights_asset_id: outputId(job.id, 0), config_asset_id: outputId(job.id, 1) })
          .eq('id', job.version_id)
          .eq('workspace_id', actor.workspaceId),
      );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
export async function processJob(jobId: string, provider: Provider = new FalProvider()) {
  const db = adminClient(),
    token = randomUUID();
  const claim = check(await db.rpc('claim_job', { p_job: jobId, p_token: token })) as {
    action: string;
    job?: DurableJob;
    attempt?: ProviderAttempt;
  };
  if (['busy', 'done'].includes(claim.action)) return claim.action;
  const job = claim.job!;
  const actor: Actor = { workspaceId: job.workspace_id, userId: job.user_id, admin: false };
  await assertActor(actor);
  try {
    if (claim.action === 'unknown') {
      await alert('PROVIDER_ACCEPTANCE_UNKNOWN', job.id);
      return 'unknown';
    }
    if (claim.action === 'prepare') {
      assertGenerationEnabled();
      // Check ownership and deletion before every privileged use, including snapshots.
      for (const asset of job.context.assets) await ownedAsset(actor, asset.id);
      const files: {
        datasetUrl?: string;
        weightsUrl?: string;
        sourceUrl?: string;
        motionUrl?: string;
        referenceUrls?: string[];
      } = {};
      if (job.model === 'train') {
        const v = check(
          await db
            .from('character_versions')
            .select('trigger_word')
            .eq('id', job.version_id)
            .eq('workspace_id', actor.workspaceId)
            .single(),
        );
        job.context.triggerWord = v.trigger_word;
        const archive = await buildTrainingArchive(
          job.context.references,
          (id) => readAssetBytes(actor, id),
          job.input.resolution,
          v.trigger_word,
        );
        const asset = await savePrivateAsset(
          actor,
          archive,
          {
            kind: 'dataset',
            mime: 'application/zip',
            bytes: archive.length,
            width: null,
            height: null,
            duration: null,
            character_id: job.input.characterId || null,
            job_id: job.id,
          },
          { id: outputId(job.id, 99), extension: 'zip' },
        );
        files.datasetUrl = await signedAssetUrl(actor, asset.id, 21600);
      }
      if (job.context.weightsAssetId)
        files.weightsUrl = await signedAssetUrl(actor, job.context.weightsAssetId, 21600);
      if (job.input.sourceAssetId)
        files.sourceUrl = await signedAssetUrl(actor, job.input.sourceAssetId, 21600);
      if (job.input.motionAssetId)
        files.motionUrl = await signedAssetUrl(actor, job.input.motionAssetId, 21600);
      if (job.model === 'edit')
        files.referenceUrls = await Promise.all(
          job.context.references.map((r) => signedAssetUrl(actor, r.asset_id, 21600)),
        );
      const input = buildProviderInput(job.input, job.context, files);
      const attemptId = check(
        await db.rpc('begin_attempt', { p_job: jobId, p_token: token }),
      ) as string;
      const webhook = new URL('/api/webhooks/fal', appUrl());
      webhook.searchParams.set('attempt', attemptId);
      webhook.searchParams.set('binding', webhookBinding(attemptId));
      try {
        const requestId = await provider.submit(job.model, input, webhook.toString());
        check(await db.rpc('accept_attempt', { p_attempt: attemptId, p_request: requestId }));
        return 'running';
      } catch (e) {
        if (e instanceof ProviderRejected && e.confirmedNoCharge) {
          check(
            await db
              .from('provider_attempts')
              .update({
                state: 'failed',
                error_code: e.code,
                actual_microusd: 0,
                cost_status: 'confirmed',
              })
              .eq('id', attemptId)
              .is('request_id', null),
          );
          check(await db.rpc('settle_job', { p_job: jobId, p_success: false, p_error: e.code }));
          return 'failed';
        }
        // An accepted request whose DB write failed is also ambiguous. Never resubmit.
        check(
          await db
            .from('provider_attempts')
            .update({ state: 'unknown', error_code: 'PROVIDER_ACCEPTANCE_UNKNOWN' })
            .eq('id', attemptId)
            .is('request_id', null),
        );
        check(
          await db
            .from('jobs')
            .update({ status: 'unknown', error_code: 'PROVIDER_ACCEPTANCE_UNKNOWN' })
            .eq('id', jobId)
            .eq('status', 'submitting'),
        );
        await alert('PROVIDER_ACCEPTANCE_UNKNOWN', jobId);
        return 'unknown';
      }
    }
    const attempt = claim.attempt!;
    const events = check(
      await db
        .from('webhook_inbox')
        .select('*')
        .eq('provider', 'fal')
        .eq('request_id', attempt.request_id)
        .order('created_at', { ascending: true })
        .limit(1),
    );
    const event = events[0];
    let result: ProviderResult;
    if (event?.payload.status === 'ERROR') {
      check(
        await db
          .from('provider_attempts')
          .update({ state: 'failed', error_code: 'PROVIDER_GENERATION_FAILED' })
          .eq('id', attempt.id),
      );
      check(
        await db.rpc('settle_job', {
          p_job: jobId,
          p_success: false,
          p_error: 'PROVIDER_GENERATION_FAILED',
        }),
      );
      check(
        await db
          .from('webhook_inbox')
          .update({ processed_at: new Date().toISOString() })
          .eq('provider', 'fal')
          .eq('event_id', event.event_id),
      );
      return 'failed';
    }
    if (event?.payload.status === 'OK' && event.payload.payload)
      result = parseProviderResult(job.model, event.payload.payload);
    else {
      const status = await provider.status(job.model, attempt.request_id!);
      if (status !== 'completed') {
        if (status === 'unknown') await alert('PROVIDER_STATUS_UNAVAILABLE', job.id);
        return status;
      }
      result = await provider.result(job.model, attempt.request_id!);
    }
    if (['draft', 'image', 'edit'].includes(job.model) && result.files.length !== job.input.count)
      throw new ProviderRejected('PROVIDER_INCOMPLETE_RESULT');
    check(
      await db
        .from('jobs')
        .update({ status: 'persisting', updated_at: new Date().toISOString() })
        .eq('id', jobId)
        .not('status', 'in', '(succeeded,failed)'),
    );
    await persistResult(actor, job, result);
    check(await db.from('provider_attempts').update({ state: 'completed' }).eq('id', attempt.id));
    check(await db.rpc('settle_job', { p_job: jobId, p_success: true }));
    if (event)
      check(
        await db
          .from('webhook_inbox')
          .update({ processed_at: new Date().toISOString() })
          .eq('provider', 'fal')
          .eq('event_id', event.event_id),
      );
    return 'succeeded';
  } catch (e) {
    if (e instanceof ProviderRejected) {
      check(
        await db
          .from('provider_attempts')
          .update({ state: 'failed', error_code: e.code })
          .eq('job_id', jobId),
      );
      check(await db.rpc('settle_job', { p_job: jobId, p_success: false, p_error: e.code }));
      return 'failed';
    }
    // Preparation before any provider call can safely release; after acceptance preserve the reservation.
    const attempt = check(
      await db.from('provider_attempts').select('id').eq('job_id', jobId).maybeSingle(),
    );
    if (!attempt) {
      check(
        await db.rpc('settle_job', {
          p_job: jobId,
          p_success: false,
          p_error: 'PREPARATION_FAILED',
        }),
      );
      return 'failed';
    }
    await alert('RESULT_RECONCILIATION_REQUIRED', job.id);
    throw new Error('WORKER_RETRY_REQUIRED');
  } finally {
    check(
      await db.from('jobs').update({ lease_until: null }).eq('id', jobId).eq('lease_token', token),
    );
  }
}
