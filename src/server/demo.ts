import 'server-only';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import type { Snapshot, Quote, Character, Reference, JobInput, Asset } from '@/domain/types';
import { DEMO_ACTOR } from './auth';
import { DEMO_TEMPLATES } from '@/domain/templates';
import { calculateQuote, inputHash } from '@/domain/pricing';
import { mode } from './config';
const characterId = '00000000-0000-4000-8000-000000000003',
  versionId = '00000000-0000-4000-8000-000000000004';
type DemoState = Snapshot & { quotes: Quote[]; keys: Record<string, string> };
function seed(): DemoState {
  const created = '2026-09-05T12:00:00Z';
  return {
    mode: 'demo',
    workspaceId: DEMO_ACTOR.workspaceId,
    userId: DEMO_ACTOR.userId,
    admin: true,
    balance: 2500,
    reserved: 0,
    plan: 'Demo',
    quotes: [],
    keys: {},
    characters: [
      {
        id: characterId,
        name: 'Nova',
        identity:
          'Erfundener Demo-Charakter. Referenzbilder sind Szenenfotos zum Testen der Bedienung.',
        body: 'Merkmale nach eigenen Referenzen definieren.',
        confirmed: true,
        created_at: created,
      },
    ],
    versions: [
      {
        id: versionId,
        character_id: characterId,
        version: 1,
        base_model: 'higgsfield-soul',
        status: 'ready',
        provider_reference_id: 'demo-soul-id',
        identity_snapshot: 'Demo',
        body_snapshot: 'Demo',
        parameters: { demo: true },
        test_asset_ids: [],
      },
    ],
    assets: [0, 1, 2].map((i) => ({
      id: `00000000-0000-4000-8000-00000000001${i}`,
      kind: 'image',
      path: DEMO_TEMPLATES[i].cover,
      mime: 'image/jpeg',
      bytes: 100000,
      width: 1024,
      height: 1280,
      duration: null,
      character_id: characterId,
      job_id: null,
      favorite: i === 0,
      deleted_at: null,
      url: DEMO_TEMPLATES[i].cover,
      demo: true,
    })),
    references: [],
    jobs: [],
    templates: DEMO_TEMPLATES,
    ledger: [],
    prices: (
      [
        ['draft', 'image', 20000],
        ['train', 'job', 2500000],
        ['image', 'image', 25000],
        ['edit', 'image', 40000],
        ['video', 'second', 140000],
        ['motion', 'second', 318000],
      ] as const
    ).map(([model, unit, rate]) => ({
      model,
      unit,
      unit_microusd: rate,
      version: 'DEMO-FIXTURE',
      audio_multiplier: 2,
      resolution_multiplier: 1.5,
      verified_at: null,
      enabled: true,
      max_parallel: 3,
      budget_microusd: 50000000,
    })),
  };
}
let queue = Promise.resolve();
export async function demoTransaction<T>(fn: (s: DemoState) => T | Promise<T>): Promise<T> {
  if (mode() !== 'demo') throw new Error('DEMO_DISABLED');
  const previous = queue;
  let release!: () => void;
  queue = new Promise<void>((r) => {
    release = r;
  });
  await previous;
  try {
    await mkdir('.demo', { recursive: true });
    let s: DemoState;
    try {
      s = JSON.parse(await readFile('.demo/state.json', 'utf8'));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      s = seed();
    }
    for (const job of s.jobs.filter(
      (j) => j.status === 'queued' && Date.now() - Date.parse(j.created_at) > 1200,
    )) {
      job.status = 'succeeded';
      s.reserved -= job.credits;
      s.balance -= job.credits;
      s.ledger.unshift({
        id: job.id,
        kind: 'capture',
        amount: -job.credits,
        created_at: new Date().toISOString(),
      });
      if (job.model === 'train') {
        const v = s.versions.find((v) => v.id === job.version_id);
        if (v) v.status = 'ready';
      } else
        for (
          let i = 0;
          i < (job.model === 'video' || job.model === 'motion' ? 1 : job.input.count);
          i++
        ) {
          const file =
            job.model === 'video' || job.model === 'motion'
              ? '/demo/testclip.mp4'
              : DEMO_TEMPLATES[(parseInt(job.id.slice(0, 4), 16) + i) % 3].cover;
          s.assets.unshift({
            id: randomUUID(),
            kind: file.endsWith('mp4') ? 'video' : 'image',
            path: file,
            mime: file.endsWith('mp4') ? 'video/mp4' : 'image/jpeg',
            bytes: 100000,
            width: 1024,
            height: 1280,
            duration: file.endsWith('mp4') ? 5 : null,
            character_id: job.input.characterId || null,
            job_id: job.id,
            favorite: false,
            deleted_at: null,
            url: file,
            demo: true,
          });
        }
    }
    const result = await fn(s);
    await writeFile('.demo/state.tmp', JSON.stringify(s));
    await rename('.demo/state.tmp', '.demo/state.json');
    return result;
  } finally {
    release();
  }
}
export function demoSnapshot() {
  return demoTransaction((s) => {
    const { quotes: _, keys: __, ...snapshot } = s;
    void _;
    void __;
    return snapshot;
  });
}
export function demoQuote(input: JobInput) {
  return demoTransaction((s) => {
    if (input.characterId && !s.characters.some((c) => c.id === input.characterId))
      throw new Error('CHARACTER_NOT_FOUND');
    if (
      input.model === 'image' &&
      !s.versions.some((v) => v.character_id === input.characterId && v.status === 'ready')
    )
      throw new Error('TRAINING_REQUIRED');
    const price = s.prices.find((p) => p.model === input.model)!;
    const p = calculateQuote(input, price, { demo: true, motionSeconds: 5 });
    const q: Quote = {
      id: randomUUID(),
      workspace_id: s.workspaceId,
      user_id: s.userId,
      input,
      input_hash: inputHash(input),
      model: input.model,
      credits: p.credits,
      estimated_microusd: p.estimatedMicrousd,
      pricing_version: p.pricingVersion,
      expires_at: new Date(Date.now() + 600000).toISOString(),
    };
    s.quotes.push(q);
    return q;
  });
}
export function demoStart(quoteId: string, key: string) {
  return demoTransaction((s) => {
    if (s.keys[key]) return { id: s.keys[key] };
    const q = s.quotes.find((q) => q.id === quoteId);
    if (!q || Date.parse(q.expires_at) < Date.now()) throw new Error('QUOTE_EXPIRED');
    const existing = s.jobs.find((j) => s.keys[`quote:${quoteId}`] === j.id);
    if (existing) return { id: existing.id };
    if (s.balance - s.reserved < q.credits) throw new Error('INSUFFICIENT_CREDITS');
    if (s.jobs.filter((j) => j.status === 'queued').length >= 3)
      throw new Error('CONCURRENCY_LIMIT');
    let v = q.input.versionId || null;
    if (q.model === 'train') {
      const c = s.characters.find((c) => c.id === q.input.characterId);
      if (!c?.confirmed) throw new Error('IDENTITY_NOT_CONFIRMED');
      const refs = s.references.filter((r) => r.character_id === c.id);
      if (refs.length < 20 || refs.some((r) => !r.approved || !r.crop_confirmed))
        throw new Error('NEED_TWENTY_APPROVED_REFERENCES');
      v = randomUUID();
      s.versions.unshift({
        id: v,
        character_id: c.id,
        version: 1 + s.versions.filter((v) => v.character_id === c.id).length,
        base_model: 'higgsfield-soul',
        status: 'training',
        provider_reference_id: null,
        identity_snapshot: c.identity,
        body_snapshot: c.body,
        parameters: q.input as unknown as Record<string, unknown>,
        test_asset_ids: [],
      });
    }
    const id = randomUUID();
    s.jobs.unshift({
      id,
      workspace_id: s.workspaceId,
      user_id: s.userId,
      input: q.input,
      model: q.model,
      status: 'queued',
      credits: q.credits,
      estimated_microusd: q.estimated_microusd,
      error_code: null,
      created_at: new Date().toISOString(),
      version_id: v,
    });
    s.reserved += q.credits;
    s.keys[key] = id;
    s.keys[`quote:${quoteId}`] = id;
    return { id };
  });
}
export function demoCharacter(data: Omit<Character, 'id' | 'created_at'>, id?: string) {
  return demoTransaction((s) => {
    const c = { ...data, id: id || randomUUID(), created_at: new Date().toISOString() };
    if (id) {
      const i = s.characters.findIndex((x) => x.id === id);
      if (i < 0) throw new Error('CHARACTER_NOT_FOUND');
      s.characters[i] = c;
    } else s.characters.unshift(c);
    return c;
  });
}
export function demoReference(data: Omit<Reference, 'id' | 'generated'>) {
  return demoTransaction((s) => {
    const asset = s.assets.find((a) => a.id === data.asset_id && !a.deleted_at);
    if (!asset) throw new Error('ASSET_NOT_FOUND');
    const old = s.references.find(
      (r) => r.character_id === data.character_id && r.asset_id === data.asset_id,
    );
    const ref = { ...data, id: old?.id || randomUUID(), generated: !!asset.job_id };
    s.references = s.references.filter((r) => r.id !== ref.id);
    s.references.push(ref);
    return ref;
  });
}
export function demoAddAsset(asset: Asset) {
  return demoTransaction((s) => {
    s.assets.unshift(asset);
    return asset;
  });
}
export async function demoBytes(asset: Asset) {
  if (asset.path.startsWith('/demo/'))
    return readFile(path.join(process.cwd(), 'public', asset.path));
  if (!/^\.demo\/uploads\/[\w-]+\.(jpg|mp4)$/.test(asset.path)) throw new Error('INVALID_PATH');
  return readFile(asset.path);
}
