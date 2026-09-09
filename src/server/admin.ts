import type { Actor } from '@/domain/types';
import { MODELS } from '@/domain/models';
import { z } from 'zod';
import { adminClient } from './database';
import { check } from './repository';
import { assertActor } from './access';
import { fetchFalPrices, FalProvider } from './providers/fal';
export async function adminData(actor: Actor) {
  await assertActor(actor);
  if (!actor.admin) throw new Error('FORBIDDEN');
  const db = adminClient();
  const [jobs, attempts, alerts, prices, templates, limits] = await Promise.all([
    db
      .from('jobs')
      .select('id,model,status,credits,estimated_microusd,error_code,created_at')
      .order('created_at', { ascending: false })
      .limit(100),
    db.from('provider_attempts').select('*').order('created_at', { ascending: false }).limit(100),
    db.from('alerts').select('*').order('created_at', { ascending: false }).limit(100),
    db.from('model_prices').select('*'),
    db.from('templates').select('*'),
    db.from('project_limits').select('*').single(),
  ]);
  return {
    jobs: check(jobs),
    attempts: check(attempts),
    alerts: check(alerts),
    prices: check(prices),
    templates: check(templates),
    limits: check(limits),
    models: MODELS,
  };
}
export async function adminAction(actor: Actor, raw: unknown) {
  await assertActor(actor);
  if (!actor.admin) throw new Error('FORBIDDEN');
  const action = z.object({ action: z.string(), data: z.unknown() }).parse(raw);
  const db = adminClient();
  if (action.action === 'fetch-prices') return { prices: await fetchFalPrices() };
  if (action.action === 'price') {
    const p = z
      .object({
        model: z.enum(['draft', 'train', 'image', 'edit', 'video', 'motion']),
        unit: z.enum(['image', 'megapixel', 'step', 'second', 'job']),
        unit_microusd: z.number().int().positive(),
        audio_multiplier: z.number().min(1).max(10),
        resolution_multiplier: z.number().min(1).max(10),
        enabled: z.boolean(),
        max_parallel: z.number().int().min(1).max(20),
        budget_microusd: z.number().int().positive(),
        reviewed: z.literal(true),
      })
      .parse(action.data);
    const units: Record<string, string[]> = {
      draft: ['image', 'megapixel'],
      image: ['image', 'megapixel'],
      train: ['step', 'job'],
      edit: ['image'],
      video: ['second'],
      motion: ['second'],
    };
    if (!units[p.model].includes(p.unit)) throw new Error('UNSUPPORTED_PRICE_FORMULA');
    const { reviewed: _, ...price } = p;
    void _;
    check(
      await db
        .from('model_prices')
        .update({ ...price, version: Date.now().toString(), verified_at: new Date().toISOString() })
        .eq('model', p.model),
    );
    check(
      await db.from('audit_log').insert({
        actor_id: actor.userId,
        action: 'price_reviewed',
        object_id: p.model,
        details: price,
      }),
    );
    return { ok: true };
  }
  if (action.action === 'cost') {
    const p = z
      .object({ attemptId: z.uuid(), actualMicrousd: z.number().int().nonnegative() })
      .parse(action.data);
    check(
      await db
        .from('provider_attempts')
        .update({ actual_microusd: p.actualMicrousd, cost_status: 'confirmed' })
        .eq('id', p.attemptId),
    );
    check(
      await db.from('audit_log').insert({
        actor_id: actor.userId,
        action: 'provider_cost_reconciled',
        object_id: p.attemptId,
        details: p,
      }),
    );
    return { ok: true };
  }
  if (action.action === 'attach-request') {
    const p = z
      .object({
        attemptId: z.uuid(),
        requestId: z.string().min(1).max(200),
        reconciledWithProvider: z.literal(true),
      })
      .parse(action.data);
    const a = check(
      await db
        .from('provider_attempts')
        .select('job_id,state,request_id')
        .eq('id', p.attemptId)
        .single(),
    );
    if (a.request_id || !['unknown', 'submitting'].includes(a.state))
      throw new Error('ATTEMPT_NOT_UNKNOWN');
    const j = check(await db.from('jobs').select('model').eq('id', a.job_id).single());
    if ((await new FalProvider().status(j.model, p.requestId)) === 'unknown')
      throw new Error('PROVIDER_REQUEST_NOT_VERIFIED');
    check(await db.rpc('accept_attempt', { p_attempt: p.attemptId, p_request: p.requestId }));
    check(
      await db.from('audit_log').insert({
        actor_id: actor.userId,
        action: 'provider_request_linked',
        object_id: p.attemptId,
        details: { requestId: p.requestId },
      }),
    );
    return { ok: true };
  }
  if (action.action === 'resolve-unaccepted') {
    const p = z
      .object({
        attemptId: z.uuid(),
        evidence: z.string().min(10).max(300),
        providerConfirmedNoAcceptanceAndNoCharge: z.literal(true),
      })
      .parse(action.data);
    check(
      await db.rpc('resolve_unaccepted', {
        p_actor: actor.userId,
        p_attempt: p.attemptId,
        p_evidence: p.evidence,
      }),
    );
    return { ok: true };
  }
  if (action.action === 'pause') {
    const p = z.object({ paused: z.boolean() }).parse(action.data);
    check(await db.from('project_limits').update(p).eq('id', 1));
    return { ok: true };
  }
  if (action.action === 'template') {
    const p = z
      .object({
        id: z
          .string()
          .regex(/^[a-z0-9-]+$/)
          .max(60),
        title: z.string().min(1).max(80),
        category: z.string().max(50),
        scene: z.string().max(400),
        outfit: z.string().max(250),
        pose: z.string().max(250),
        prompt: z.string().max(1800),
        format: z.enum(['1:1', '4:5', '9:16', '16:9']),
        cover: z.enum(['/demo/coast.jpg', '/demo/city.jpg', '/demo/interior.jpg']),
        enabled: z.boolean(),
      })
      .parse(action.data);
    check(await db.from('templates').upsert(p));
    return { ok: true };
  }
  throw new Error('UNKNOWN_ADMIN_ACTION');
}
