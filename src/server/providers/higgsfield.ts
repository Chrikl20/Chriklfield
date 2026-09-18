import { z } from 'zod';
import { MODELS, ERROR_MAP } from '@/domain/models';
import type { JobInput, ModelKey } from '@/domain/types';
import type { JobContext } from '../quotes';
import { required } from '../config';

const BASE_URL = 'https://api.higgsfield.ai';

export interface ProviderFiles {
  sourceUrl?: string;
  motionUrl?: string;
  referenceUrls?: string[];
  providerReferenceId?: string;
}

type SoulInput = {
  prompt: string;
  width_and_height: string;
  quality: '1080p';
  batch_size: 1 | 4;
  custom_reference_id?: string;
  custom_reference_strength?: number;
  image_reference?: { type: 'image_url'; image_url: string };
  seed?: number;
};

type SoulIdInput = {
  name: string;
  input_images: Array<{ type: 'image_url'; image_url: string }>;
};

type KlingVideoInput = {
  prompt: string;
  image_url: string;
  duration: number;
  sound: 'on' | 'off';
  cfg_scale: number;
  multi_shots: boolean;
};

type KlingMotionInput = {
  prompt: string;
  image_url: string;
  video_url: string;
  character_orientation: 'image' | 'video';
  keep_original_sound: 'yes' | 'no';
};

export type ProviderInput = SoulInput | SoulIdInput | KlingVideoInput | KlingMotionInput;

export interface ProviderResult {
  files: { url: string; kind: 'image' | 'video'; mime: string }[];
  providerReferenceId?: string;
}

export class ProviderRejected extends Error {
  constructor(
    public code: string,
    public confirmedNoCharge = false,
  ) {
    super(code);
  }
}

export class ProviderUnknown extends Error {
  constructor() {
    super('PROVIDER_ACCEPTANCE_UNKNOWN');
  }
}

export interface Provider {
  submit(model: ModelKey, input: ProviderInput): Promise<string>;
  status(model: ModelKey, requestId: string): Promise<'running' | 'completed' | 'failed' | 'unknown'>;
  result(model: ModelKey, requestId: string): Promise<ProviderResult>;
}

export function assembledPrompt(
  input: JobInput,
  context: Pick<JobContext, 'identity' | 'body'>,
) {
  return [context.identity, context.body, input.scene, input.outfit, input.pose, input.prompt]
    .filter(Boolean)
    .join('. ');
}

const soulSizes: Record<JobInput['format'], string> = {
  '4:5': '1152x1536',
  '1:1': '1536x1536',
  '9:16': '1152x2048',
  '16:9': '2048x1152',
};

function soulBatch(count: number): 1 | 4 {
  if (count !== 1 && count !== 4) throw new Error('SOUL_BATCH_MUST_BE_1_OR_4');
  return count;
}

export function buildProviderInput(
  input: JobInput,
  context: JobContext,
  files: ProviderFiles,
): ProviderInput {
  const prompt = assembledPrompt(input, context);
  switch (input.model) {
    case 'train':
      if (!files.referenceUrls?.length) throw new Error('REFERENCES_MISSING');
      return {
        name: context.characterName || 'Chriklfield Character',
        input_images: files.referenceUrls.map((image_url) => ({ type: 'image_url' as const, image_url })),
      };
    case 'draft':
      return {
        prompt,
        width_and_height: soulSizes[input.format],
        quality: '1080p',
        batch_size: soulBatch(input.count),
        ...(input.seed === undefined ? {} : { seed: input.seed }),
      };
    case 'image':
      if (!files.providerReferenceId) throw new Error('SOUL_ID_MISSING');
      return {
        prompt,
        width_and_height: soulSizes[input.format],
        quality: '1080p',
        batch_size: soulBatch(input.count),
        custom_reference_id: files.providerReferenceId,
        custom_reference_strength: 1,
        ...(input.seed === undefined ? {} : { seed: input.seed }),
      };
    case 'edit':
      if (!files.referenceUrls?.[0]) throw new Error('REFERENCES_MISSING');
      return {
        prompt,
        width_and_height: soulSizes[input.format],
        quality: '1080p',
        batch_size: soulBatch(input.count),
        image_reference: { type: 'image_url', image_url: files.referenceUrls[0] },
        ...(input.seed === undefined ? {} : { seed: input.seed }),
      };
    case 'video':
      if (!files.sourceUrl) throw new Error('SOURCE_MISSING');
      return {
        prompt: input.prompt,
        image_url: files.sourceUrl,
        duration: input.duration,
        sound: input.audio ? 'on' : 'off',
        cfg_scale: 0.5,
        multi_shots: false,
      };
    case 'motion':
      if (!files.sourceUrl || !files.motionUrl) throw new Error('MOTION_SOURCE_MISSING');
      return {
        prompt: input.prompt,
        image_url: files.sourceUrl,
        video_url: files.motionUrl,
        character_orientation: input.orientation,
        keep_original_sound: input.audio ? 'yes' : 'no',
      };
  }
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function credentials() {
  const raw = required('HF_CREDENTIALS');
  const split = raw.indexOf(':');
  if (split <= 0 || split === raw.length - 1) throw new Error('HF_CREDENTIALS_INVALID');
  return { raw, key: raw.slice(0, split), secret: raw.slice(split + 1) };
}

function legacyHeaders() {
  const c = credentials();
  return {
    'hf-api-key': c.key,
    'hf-secret': c.secret,
    'Content-Type': 'application/json',
  };
}

function v2Headers() {
  return {
    Authorization: `Key ${credentials().raw}`,
    'Content-Type': 'application/json',
  };
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function mappedError(status: number) {
  return ERROR_MAP[status as keyof typeof ERROR_MAP] || 'PROVIDER_REQUEST_FAILED';
}

async function send(
  transport: typeof fetch,
  method: 'GET' | 'POST',
  path: string,
  init: { legacy?: boolean; body?: unknown } = {},
) {
  let response: Response;
  try {
    response = await transport(`${BASE_URL}${path}`, {
      method,
      headers: init.legacy ? legacyHeaders() : v2Headers(),
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      signal: AbortSignal.timeout(method === 'POST' ? 30000 : 20000),
      redirect: 'error',
    });
  } catch {
    if (method === 'POST') throw new ProviderUnknown();
    throw new Error('PROVIDER_STATUS_UNAVAILABLE');
  }
  const body = await readJson(response);
  if (!response.ok) {
    if (method === 'POST' && [400, 401, 402, 403, 422, 429].includes(response.status))
      throw new ProviderRejected(mappedError(response.status), true);
    throw new Error(mappedError(response.status));
  }
  return body;
}

function legacyJobStatus(data: unknown) {
  const jobs = record(data).jobs;
  if (!Array.isArray(jobs) || jobs.length === 0) return 'unknown' as const;
  const statuses = jobs.map((job) => String(record(job).status || 'unknown'));
  if (statuses.some((s) => s === 'failed' || s === 'nsfw' || s === 'canceled')) return 'failed' as const;
  if (statuses.every((s) => s === 'completed')) return 'completed' as const;
  return 'running' as const;
}

function legacyFiles(data: unknown): ProviderResult['files'] {
  const jobs = record(data).jobs;
  if (!Array.isArray(jobs)) return [];
  return jobs.flatMap((job) => {
    const raw = record(record(record(job).results).raw);
    const url = raw.url;
    if (typeof url !== 'string') return [];
    return [{ url, kind: 'image' as const, mime: 'image/jpeg' }];
  });
}

export class HiggsfieldProvider implements Provider {
  constructor(private transport: typeof fetch = fetch) {}

  async submit(model: ModelKey, input: ProviderInput) {
    if (model === 'train') {
      const data = record(await send(this.transport, 'POST', '/v1/custom-references', {
        legacy: true,
        body: input,
      }));
      if (typeof data.id !== 'string' || !data.id) throw new ProviderUnknown();
      return data.id;
    }
    if (['draft', 'image', 'edit'].includes(model)) {
      const data = record(await send(this.transport, 'POST', '/v1/text2image/soul', {
        legacy: true,
        body: { params: input },
      }));
      if (typeof data.id !== 'string' || !data.id) throw new ProviderUnknown();
      return data.id;
    }
    const data = record(await send(this.transport, 'POST', `/${MODELS[model].endpoint}`, {
      body: input,
    }));
    if (typeof data.request_id !== 'string' || !data.request_id) throw new ProviderUnknown();
    return data.request_id;
  }

  async status(model: ModelKey, requestId: string) {
    try {
      if (model === 'train') {
        const data = record(
          await send(this.transport, 'GET', `/v1/custom-references/${encodeURIComponent(requestId)}`, {
            legacy: true,
          }),
        );
        const status = String(data.status || 'unknown');
        if (status === 'completed') return 'completed';
        if (status === 'failed') return 'failed';
        return ['not_ready', 'queued', 'in_progress'].includes(status) ? 'running' : 'unknown';
      }
      if (['draft', 'image', 'edit'].includes(model)) {
        return legacyJobStatus(
          await send(this.transport, 'GET', `/v1/job-sets/${encodeURIComponent(requestId)}`, {
            legacy: true,
          }),
        );
      }
      const data = record(
        await send(this.transport, 'GET', `/requests/${encodeURIComponent(requestId)}/status`),
      );
      const status = String(data.status || 'unknown');
      if (status === 'completed') return 'completed';
      if (status === 'failed' || status === 'nsfw' || status === 'canceled') return 'failed';
      return status === 'queued' || status === 'in_progress' ? 'running' : 'unknown';
    } catch (e) {
      if (e instanceof ProviderRejected) throw e;
      return 'unknown';
    }
  }

  async result(model: ModelKey, requestId: string): Promise<ProviderResult> {
    if (model === 'train') {
      const data = record(
        await send(this.transport, 'GET', `/v1/custom-references/${encodeURIComponent(requestId)}`, {
          legacy: true,
        }),
      );
      if (String(data.status) === 'failed')
        throw new ProviderRejected('PROVIDER_GENERATION_FAILED', true);
      if (String(data.status) !== 'completed') throw new Error('PROVIDER_RESULT_NOT_READY');
      return { files: [], providerReferenceId: requestId };
    }
    if (['draft', 'image', 'edit'].includes(model)) {
      const data = await send(
        this.transport,
        'GET',
        `/v1/job-sets/${encodeURIComponent(requestId)}`,
        { legacy: true },
      );
      const status = legacyJobStatus(data);
      if (status === 'failed') throw new ProviderRejected('PROVIDER_GENERATION_FAILED', true);
      if (status !== 'completed') throw new Error('PROVIDER_RESULT_NOT_READY');
      return { files: legacyFiles(data) };
    }
    const data = record(
      await send(this.transport, 'GET', `/requests/${encodeURIComponent(requestId)}/status`),
    );
    const status = String(data.status || 'unknown');
    if (status === 'failed' || status === 'nsfw' || status === 'canceled')
      throw new ProviderRejected(
        status === 'nsfw' ? 'PROVIDER_CONTENT_REJECTED' : 'PROVIDER_GENERATION_FAILED',
        true,
      );
    if (status !== 'completed') throw new Error('PROVIDER_RESULT_NOT_READY');
    const video = record(data.video).url;
    if (typeof video === 'string')
      return { files: [{ url: video, kind: 'video', mime: 'video/mp4' }] };
    const images = Array.isArray(data.images)
      ? data.images.flatMap((item) => {
          const url = record(item).url;
          return typeof url === 'string'
            ? [{ url, kind: 'image' as const, mime: 'image/jpeg' }]
            : [];
        })
      : [];
    return { files: images };
  }
}
