import 'server-only';
import { randomUUID, createHash } from 'node:crypto';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { actor, DEMO_ACTOR } from '@/server/auth';
import { assertActor } from '@/server/access';
import { adminClient } from '@/server/database';
import { userClient } from '@/lib/supabase/server';
import { mode, appUrl, required, assertGenerationEnabled } from '@/server/config';
import { json, jsonBody, route, sameOrigin, boundedBody } from '@/server/http';
import { check, liveSnapshot, ownedAsset, ownedCharacter } from '@/server/repository';
import {
  demoSnapshot,
  demoQuote,
  demoStart,
  demoCharacter,
  demoReference,
  demoTransaction,
  demoAddAsset,
  demoBytes,
} from '@/server/demo';
import { characterSchema, jobInputSchema, referenceSchema } from '@/domain/validation';
import { createQuote } from '@/server/quotes';
import { normalizeMedia } from '@/server/media/files';
import { BUCKET } from '@/server/media/storage';
import { prepareUpload, completeUpload, ownedUpload } from '@/server/media/uploads';
import { dispatchUpload, dispatchOutbox } from '@/server/dispatch';
import { falEventSchema, verifyWebhook, verifyBinding } from '@/server/providers/webhook';
import { checkout, portal, stripe, processStripeEvent } from '@/server/billing/stripe';
import { adminData, adminAction } from '@/server/admin';
import { alert } from '@/server/alerts';
import type { Asset } from '@/domain/types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type Params = { params: Promise<{ path: string[] }> };
export function GET(request: Request, context: Params) {
  return route(async () => {
    const parts = (await context.params).path;
    const a = await actor(),
      demo = mode() === 'demo';
    const db = demo ? null : adminClient();
    if (parts[0] === 'uploads' && parts[1] && !demo)
      return json(await ownedUpload(a, z.uuid().parse(parts[1])));
    if (parts[0] === 'state') return json(demo ? await demoSnapshot() : await liveSnapshot(a));
    if (parts[0] === 'admin')
      return json(
        demo
          ? {
              ...(await demoSnapshot()),
              attempts: [],
              alerts: [],
              limits: { paused: false },
              models: {},
            }
          : await adminData(a),
      );
    if (parts[0] === 'assets' && parts[1]) {
      const id = z.uuid().parse(parts[1]);
      const download = new URL(request.url).searchParams.has('download');
      if (demo) {
        const asset = (await demoSnapshot()).assets.find((x) => x.id === id && !x.deleted_at);
        if (!asset) throw new Error('ASSET_NOT_FOUND');
        const bytes = await demoBytes(asset);
        return new Response(new Uint8Array(bytes), {
          headers: {
            'Content-Type': asset.mime,
            'Content-Length': String(bytes.length),
            'Cache-Control': 'private, no-store',
            ...(download
              ? {
                  'Content-Disposition': `attachment; filename="chriklfield-${id}.${asset.kind === 'video' ? 'mp4' : 'jpg'}"`,
                }
              : {}),
          },
        });
      }
      const asset = await ownedAsset(a, id);
      const url = check(
        await db!.storage.from(BUCKET).createSignedUrl(asset.path, 60, { download }),
      ).signedUrl;
      return NextResponse.redirect(url, 307);
    }
    if (parts[0] === 'billing' && parts[1] === 'prices') {
      if (demo) return json({ demo: true, prices: [] });
      const { products } = await import('@/server/billing/stripe');
      const prices = [];
      for (const [key, p] of Object.entries(products()))
        if (p.id) {
          const v = await stripe().prices.retrieve(p.id);
          prices.push({
            key,
            amount: v.unit_amount,
            currency: v.currency,
            credits: p.credits,
            interval: v.recurring?.interval,
          });
        }
      return json({ prices });
    }
    throw new Error('NOT_FOUND');
  });
}
export function POST(request: Request, context: Params) {
  return route(async () => {
    const parts = (await context.params).path;
    if (parts[0] === 'webhooks') {
      if (mode() === 'demo') throw new Error('WEBHOOKS_DISABLED_IN_DEMO');
      const bytes = await boundedBody(request, 2 * 1024 * 1024),
        db = adminClient();
      if (parts[1] === 'fal') {
        const url = new URL(request.url),
          attempt = z.uuid().parse(url.searchParams.get('attempt'));
        if (
          !verifyBinding(attempt, url.searchParams.get('binding') || '') ||
          !(await verifyWebhook(request.headers, bytes))
        )
          throw new Error('INVALID_WEBHOOK_SIGNATURE');
        const event = falEventSchema.parse(JSON.parse(bytes.toString('utf8')));
        if (event.request_id !== request.headers.get('x-fal-webhook-request-id'))
          throw new Error('WEBHOOK_REQUEST_MISMATCH');
        const known = check(
          await db
            .from('provider_attempts')
            .select('id,job_id,request_id')
            .eq('id', attempt)
            .maybeSingle(),
        );
        if (!known || (known.request_id && known.request_id !== event.request_id))
          throw new Error('WEBHOOK_REQUEST_MISMATCH');
        check(
          await db.from('webhook_inbox').upsert(
            {
              provider: 'fal',
              event_id: `${event.request_id}:${event.status}`,
              request_id: event.request_id,
              attempt_id: attempt,
              payload: event,
              body_hash: createHash('sha256').update(bytes).digest('hex'),
            },
            { onConflict: 'provider,event_id', ignoreDuplicates: true },
          ),
        );
        check(await db.rpc('accept_attempt', { p_attempt: attempt, p_request: event.request_id }));
        const job = check(await db.from('jobs').select('status').eq('id', known.job_id).single());
        if (['succeeded', 'failed'].includes(job.status)) {
          if ((job.status === 'succeeded') !== (event.status === 'OK'))
            await alert('LATE_CONFLICTING_WEBHOOK', known.job_id);
          check(
            await db
              .from('webhook_inbox')
              .update({ processed_at: new Date().toISOString() })
              .eq('provider', 'fal')
              .eq('event_id', `${event.request_id}:${event.status}`),
          );
        }
        return json({ received: true });
      }
      if (parts[1] === 'stripe') {
        const signature = request.headers.get('stripe-signature');
        if (!signature) throw new Error('INVALID_WEBHOOK_SIGNATURE');
        let event;
        try {
          event = stripe().webhooks.constructEvent(
            bytes,
            signature,
            required('STRIPE_WEBHOOK_SECRET'),
          );
        } catch {
          throw new Error('INVALID_WEBHOOK_SIGNATURE');
        }
        if (event.livemode && process.env.ALLOW_STRIPE_LIVE !== 'true')
          throw new Error('STRIPE_LIVE_DISABLED');
        const old = check(
          await db
            .from('webhook_inbox')
            .select('processed_at')
            .eq('provider', 'stripe')
            .eq('event_id', event.id)
            .maybeSingle(),
        );
        if (old?.processed_at) return json({ received: true });
        // Store identifiers only. Stripe objects are re-fetched from its authenticated API.
        check(
          await db.from('webhook_inbox').upsert(
            {
              provider: 'stripe',
              event_id: event.id,
              payload: {
                type: event.type,
                objectId: 'id' in event.data.object ? event.data.object.id : null,
              },
              body_hash: createHash('sha256').update(bytes).digest('hex'),
            },
            { onConflict: 'provider,event_id', ignoreDuplicates: true },
          ),
        );
        await processStripeEvent(event);
        check(
          await db
            .from('webhook_inbox')
            .update({ processed_at: new Date().toISOString() })
            .eq('provider', 'stripe')
            .eq('event_id', event.id),
        );
        return json({ received: true });
      }
      throw new Error('NOT_FOUND');
    }
    sameOrigin(request);
    if (parts[0] === 'auth') {
      if (mode() === 'demo') return json({ ok: true });
      const client = await userClient();
      if (parts[1] === 'logout') {
        const { error } = await client.auth.signOut();
        if (error) throw new Error('LOGOUT_FAILED');
        return json({ ok: true });
      }
      const body = z.object({ email: z.email() }).parse(await jsonBody(request));
      const { error } = await client.auth.signInWithOtp({
        email: body.email,
        options: { emailRedirectTo: `${appUrl()}/auth/callback` },
      });
      if (error) throw new Error('LOGIN_FAILED');
      return json({ ok: true });
    }
    const a = await actor(),
      demo = mode() === 'demo';
    if (!demo) {
      await assertActor(a);
      check(
        await adminClient().rpc('consume_rate', {
          p_user: a.userId,
          p_scope: parts[0],
          p_limit: parts[0] === 'uploads' ? 10 : parts[0] === 'quotes' ? 30 : 120,
        }),
      );
    }
    const db = demo ? null : adminClient();
    if (parts[0] === 'quotes') {
      const input = jobInputSchema.parse(await jsonBody(request));
      return json(demo ? await demoQuote(input) : await createQuote(a, input));
    }
    if (parts[0] === 'jobs') {
      const b = z
        .object({ quoteId: z.uuid(), idempotencyKey: z.string().min(8).max(128) })
        .parse(await jsonBody(request));
      if (demo) return json(await demoStart(b.quoteId, b.idempotencyKey), 202);
      assertGenerationEnabled();
      const id = check(
        await db!.rpc('enqueue_job', {
          p_user: a.userId,
          p_workspace: a.workspaceId,
          p_quote: b.quoteId,
          p_key: b.idempotencyKey,
        }),
      );
      // Durable outbox recovery runs independently even if Trigger is temporarily unreachable.
      try {
        await dispatchOutbox();
      } catch {
        /* The committed outbox is retried by the scheduled dispatcher. */
      }
      return json({ id }, 202);
    }
    if (parts[0] === 'characters') {
      const body = characterSchema.parse(await jsonBody(request));
      if (demo) return json(await demoCharacter(body));
      return json(
        check(
          await db!
            .from('characters')
            .insert({ ...body, workspace_id: a.workspaceId })
            .select('*')
            .single(),
        ),
        201,
      );
    }
    if (parts[0] === 'references') {
      const b = referenceSchema.parse(await jsonBody(request));
      const value = {
        character_id: b.characterId,
        asset_id: b.assetId,
        kind: b.kind,
        caption: b.caption,
        approved: b.approved,
        crop_mode: b.cropMode,
        crop_confirmed: b.cropConfirmed,
      };
      if (demo) return json(await demoReference(value));
      await ownedCharacter(a, b.characterId);
      const asset = await ownedAsset(a, b.assetId);
      if (asset.kind !== 'image') throw new Error('REFERENCE_MUST_BE_IMAGE');
      return json(
        check(
          await db!
            .from('character_references')
            .upsert(
              { ...value, workspace_id: a.workspaceId, generated: !!asset.job_id },
              { onConflict: 'character_id,asset_id' },
            )
            .select('*')
            .single(),
        ),
      );
    }
    if (parts[0] === 'uploads') {
      if (!demo) {
        if (parts.length === 1) return json(await prepareUpload(a, await jsonBody(request)), 201);
        if (parts[1] && parts[2] === 'complete') {
          const id = z.uuid().parse(parts[1]);
          const status = await completeUpload(a, id);
          if (status.state === 'queued') {
            try {
              await dispatchUpload(id);
            } catch {
              /* The durable row is recovered independently by recover-uploads. */
            }
          }
          return json(status, 202);
        }
        throw new Error('NOT_FOUND');
      }
      const characterId = new URL(request.url).searchParams.get('characterId');
      if (characterId) {
        z.uuid().parse(characterId);
        if (demo) {
          if (!(await demoSnapshot()).characters.some((c) => c.id === characterId))
            throw new Error('CHARACTER_NOT_FOUND');
        } else await ownedCharacter(a, characterId);
      }
      const bytes = await boundedBody(request, 100 * 1024 * 1024);
      const m = await normalizeMedia(bytes);
      const id = randomUUID();
      const meta = {
        kind: m.kind,
        mime: m.mime,
        bytes: m.bytes.length,
        width: m.width,
        height: m.height,
        duration: m.duration,
        character_id: characterId,
        job_id: null,
      };
      if (demo) {
        await mkdir('.demo/uploads', { recursive: true });
        const file = `.demo/uploads/${id}.${m.extension}`;
        await writeFile(file, m.bytes);
        const asset: Asset = {
          ...meta,
          id,
          path: file,
          url: `/api/assets/${id}`,
          favorite: false,
          deleted_at: null,
          demo: true,
        };
        await demoAddAsset(asset);
        return json(asset, 201);
      }
      throw new Error('DEMO_UPLOAD_FAILED');
    }
    if (parts[0] === 'billing') {
      if (demo)
        return json({ demo: true, message: 'In der Demo werden keine Zahlungen gestartet.' });
      if (parts[1] === 'portal') return json(await portal(a));
      const b = z
        .object({
          product: z.enum(['credits', 'creator']),
          idempotencyKey: z.string().min(8).max(128),
        })
        .parse(await jsonBody(request));
      return json(await checkout(a, b.product, b.idempotencyKey));
    }
    if (parts[0] === 'admin') {
      if (demo)
        return json({
          demo: true,
          message: 'Betriebseinstellungen sind in der Demo schreibgeschützt.',
        });
      return json(await adminAction(a, await jsonBody(request)));
    }
    if (parts[0] === 'versions' && parts[1] === 'test-image') {
      const b = z.object({ versionId: z.uuid(), assetId: z.uuid() }).parse(await jsonBody(request));
      if (demo) {
        await demoTransaction((s) => {
          const v = s.versions.find((v) => v.id === b.versionId);
          if (!v || !s.assets.some((x) => x.id === b.assetId)) throw new Error('NOT_FOUND');
          v.test_asset_ids = [...new Set([...v.test_asset_ids, b.assetId])];
        });
        return json({ ok: true });
      }
      const asset = await ownedAsset(a, b.assetId);
      const v = check(
        await db!
          .from('character_versions')
          .select('*')
          .eq('id', b.versionId)
          .eq('workspace_id', a.workspaceId)
          .single(),
      );
      if (asset.kind !== 'image' || asset.character_id !== v.character_id)
        throw new Error('TEST_IMAGE_MISMATCH');
      check(
        await db!.rpc('add_test_image', {
          p_user: a.userId,
          p_workspace: a.workspaceId,
          p_version: b.versionId,
          p_asset: b.assetId,
        }),
      );
      return json({ ok: true });
    }
    throw new Error('NOT_FOUND');
  });
}
export function PATCH(request: Request, context: Params) {
  return route(async () => {
    sameOrigin(request);
    const parts = (await context.params).path;
    const a = await actor(),
      id = z.uuid().parse(parts[1]),
      demo = mode() === 'demo';
    if (parts[0] === 'characters') {
      const body = characterSchema.parse(await jsonBody(request));
      if (demo) return json(await demoCharacter(body, id));
      await ownedCharacter(a, id);
      return json(
        check(
          await adminClient()
            .from('characters')
            .update(body)
            .eq('id', id)
            .eq('workspace_id', a.workspaceId)
            .select('*')
            .single(),
        ),
      );
    }
    if (parts[0] === 'assets') {
      const body = z.object({ favorite: z.boolean() }).parse(await jsonBody(request));
      if (demo) {
        await demoTransaction((s) => {
          const asset = s.assets.find((a) => a.id === id);
          if (!asset) throw new Error('ASSET_NOT_FOUND');
          asset.favorite = body.favorite;
        });
        return json({ ok: true });
      }
      await ownedAsset(a, id);
      check(
        await adminClient()
          .from('assets')
          .update(body)
          .eq('id', id)
          .eq('workspace_id', a.workspaceId),
      );
      return json({ ok: true });
    }
    throw new Error('NOT_FOUND');
  });
}
export function DELETE(request: Request, context: Params) {
  return route(async () => {
    sameOrigin(request);
    const parts = (await context.params).path;
    const a = await actor(),
      id = z.uuid().parse(parts[1]);
    const kind =
      parts[0] === 'assets'
        ? 'asset'
        : parts[0] === 'characters'
          ? 'character'
          : parts[0] === 'workspaces'
            ? 'workspace'
            : null;
    if (!kind) throw new Error('NOT_FOUND');
    if (mode() === 'demo') {
      await demoTransaction(async (s) => {
        if (s.jobs.some((j) => j.status === 'queued'))
          throw new Error('ACTIVE_JOBS_BLOCK_DELETION');
        const deleting = s.assets.filter(
          (x) =>
            kind === 'workspace' || (kind === 'character' ? x.character_id === id : x.id === id),
        );
        for (const x of deleting)
          if (x.path.startsWith('.demo/uploads/')) await rm(x.path, { force: true });
        s.assets = s.assets.filter((x) => !deleting.includes(x));
        s.references = s.references.filter((r) => !deleting.some((a) => a.id === r.asset_id));
        if (kind === 'character') {
          s.characters = s.characters.filter((c) => c.id !== id);
          s.versions = s.versions.filter((v) => v.character_id !== id);
        }
        if (kind === 'workspace') {
          if (id !== DEMO_ACTOR.workspaceId) throw new Error('FORBIDDEN');
          s.characters = [];
          s.versions = [];
          s.references = [];
          s.jobs = [];
          s.quotes = [];
        }
      });
      return json({ ok: true });
    }
    check(
      await adminClient().rpc('request_deletion', {
        p_user: a.userId,
        p_workspace: a.workspaceId,
        p_kind: kind,
        p_target: id,
      }),
    );
    return json({ ok: true }, 202);
  });
}
