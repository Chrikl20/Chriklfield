import { createFalClient, ApiError } from '@fal-ai/client';
import { z } from 'zod';
import { MODELS, ERROR_MAP } from '@/domain/models';
import { dimensions } from '@/domain/validation';
import type { JobInput, ModelKey } from '@/domain/types';
import type { JobContext } from '../quotes';
import { required } from '../config';
export interface ProviderFiles {
  datasetUrl?: string;
  weightsUrl?: string;
  sourceUrl?: string;
  motionUrl?: string;
  referenceUrls?: string[];
}
export interface KreaImageInput {
  prompt: string;
  image_size: { width: number; height: number };
  num_images: number;
  enable_safety_checker: true;
  enable_prompt_expansion: false;
  output_format: 'jpeg';
  seed?: number;
  loras?: { path: string; scale: number }[];
}
export interface KreaTrainInput {
  images_data_url: string;
  trigger_phrase: string;
  auto_captioning: 'Off';
  steps: number;
  learning_rate: number;
  resolution: 768 | 1024;
  debug_dataset: false;
}
export interface SeedreamEditInput {
  prompt: string;
  image_urls: string[];
  image_size: 'auto_2K';
  num_images: number;
  max_images: 1;
  enable_safety_checker: true;
  seed?: number;
}
export interface KlingVideoInput {
  prompt: string;
  start_image_url: string;
  duration: string;
  generate_audio: boolean;
}
export interface KlingMotionInput {
  prompt: string;
  image_url: string;
  video_url: string;
  character_orientation: 'image' | 'video';
  keep_original_sound: boolean;
}
export type ProviderInput =
  KreaImageInput | KreaTrainInput | SeedreamEditInput | KlingVideoInput | KlingMotionInput;
export interface ProviderResult {
  files: { url: string; kind: 'image' | 'video' | 'weights' | 'config'; mime: string }[];
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
  submit(model: ModelKey, input: ProviderInput, webhookUrl: string): Promise<string>;
  status(model: ModelKey, requestId: string): Promise<'running' | 'completed' | 'unknown'>;
  result(model: ModelKey, requestId: string): Promise<ProviderResult>;
}
export function assembledPrompt(
  input: JobInput,
  context: Pick<JobContext, 'triggerWord' | 'identity' | 'body'>,
) {
  return [
    context.triggerWord,
    context.identity,
    context.body,
    input.scene,
    input.outfit,
    input.pose,
    input.prompt,
  ]
    .filter(Boolean)
    .join('. ');
}
export function buildProviderInput(
  input: JobInput,
  context: JobContext,
  files: ProviderFiles,
): ProviderInput {
  const prompt = assembledPrompt(input, context);
  if (['draft', 'image', 'edit'].includes(input.model) && prompt.length > 5000)
    throw new Error('PROMPT_TOO_LONG');
  const base: KreaImageInput = {
    prompt,
    image_size: dimensions[input.format],
    num_images: input.count,
    enable_safety_checker: true,
    enable_prompt_expansion: false,
    output_format: 'jpeg',
    ...(input.seed === undefined ? {} : { seed: input.seed }),
  };
  switch (input.model) {
    case 'draft':
      return base;
    case 'train':
      if (!files.datasetUrl) throw new Error('DATASET_MISSING');
      return {
        images_data_url: files.datasetUrl,
        trigger_phrase: context.triggerWord || '',
        auto_captioning: 'Off',
        steps: input.steps,
        learning_rate: input.learningRate,
        resolution: input.resolution,
        debug_dataset: false,
      };
    case 'image':
      if (!files.weightsUrl) throw new Error('WEIGHTS_MISSING');
      return { ...base, loras: [{ path: files.weightsUrl, scale: input.loraScale }] };
    case 'edit':
      if (!files.referenceUrls?.length) throw new Error('REFERENCES_MISSING');
      return {
        prompt,
        image_urls: files.referenceUrls,
        image_size: 'auto_2K',
        num_images: input.count,
        max_images: 1,
        enable_safety_checker: true,
        ...(input.seed === undefined ? {} : { seed: input.seed }),
      };
    case 'video':
      if (!files.sourceUrl) throw new Error('SOURCE_MISSING');
      return {
        prompt: input.prompt,
        start_image_url: files.sourceUrl,
        duration: String(input.duration),
        generate_audio: input.audio,
      };
    case 'motion':
      if (!files.sourceUrl || !files.motionUrl) throw new Error('MOTION_SOURCE_MISSING');
      return {
        prompt: input.prompt,
        image_url: files.sourceUrl,
        video_url: files.motionUrl,
        character_orientation: input.orientation,
        keep_original_sound: input.audio,
      };
  }
}
const fileSchema = z.object({ url: z.url() });
export function parseProviderResult(model: ModelKey, data: unknown): ProviderResult {
  if (model === 'train') {
    const v = z.object({ lora_file: fileSchema, config_file: fileSchema }).parse(data);
    return {
      files: [
        { url: v.lora_file.url, kind: 'weights', mime: 'application/octet-stream' },
        { url: v.config_file.url, kind: 'config', mime: 'application/json' },
      ],
    };
  }
  if (model === 'video' || model === 'motion') {
    const v = z.object({ video: fileSchema }).parse(data);
    return { files: [{ url: v.video.url, kind: 'video', mime: 'video/mp4' }] };
  }
  const v = z
    .object({
      images: z.array(fileSchema).min(1).max(4),
      has_nsfw_concepts: z.array(z.boolean()).optional(),
    })
    .parse(data);
  if (v.has_nsfw_concepts?.some(Boolean)) throw new ProviderRejected('PROVIDER_CONTENT_REJECTED');
  return {
    files: v.images.map((f) => ({ url: f.url, kind: 'image' as const, mime: 'image/jpeg' })),
  };
}
export class FalProvider implements Provider {
  constructor(private transport: typeof fetch = fetch) {}
  async submit(model: ModelKey, input: ProviderInput, webhookUrl: string) {
    // SDK 1.10.1 queue.submit overrides retry config internally. Use documented Queue
    // REST for this one POST so an ambiguous acceptance can NEVER cause a second POST.
    const url = new URL(`https://queue.fal.run/${MODELS[model].endpoint}`);
    url.searchParams.set('fal_webhook', webhookUrl);
    let response: Response;
    try {
      response = await this.transport(url, {
        method: 'POST',
        headers: {
          Authorization: `Key ${required('FAL_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(30000),
        redirect: 'error',
      });
    } catch {
      throw new ProviderUnknown();
    }
    if (!response.ok) {
      const mapped = ERROR_MAP[response.status as keyof typeof ERROR_MAP];
      if (mapped) throw new ProviderRejected(mapped, true);
      throw new ProviderUnknown();
    }
    try {
      return z.object({ request_id: z.string().min(1) }).parse(await response.json()).request_id;
    } catch {
      throw new ProviderUnknown();
    }
  }
  private sdk() {
    return createFalClient({
      credentials: required('FAL_KEY'),
      fetch: (u, i) => this.transport(u, { ...i, signal: AbortSignal.timeout(20000) }),
      retry: { maxRetries: 0 },
    });
  }
  async status(model: ModelKey, requestId: string) {
    try {
      const status = await this.sdk().queue.status(MODELS[model].endpoint, {
        requestId,
        logs: false,
      });
      return status.status === 'COMPLETED' ? 'completed' : 'running';
    } catch {
      return 'unknown';
    }
  }
  async result(model: ModelKey, requestId: string) {
    try {
      const r = await this.sdk().queue.result(MODELS[model].endpoint, { requestId });
      return parseProviderResult(model, r.data);
    } catch (e) {
      if (e instanceof ApiError && e.status === 422)
        throw new ProviderRejected('PROVIDER_GENERATION_FAILED');
      throw e;
    }
  }
}
export async function fetchFalPrices() {
  const url = new URL('https://api.fal.ai/v1/models/pricing');
  url.searchParams.set(
    'endpoint_id',
    Object.values(MODELS)
      .map((m) => m.endpoint)
      .join(','),
  );
  const response = await fetch(url, {
    headers: { Authorization: `Key ${required('FAL_KEY')}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('PRICE_LOOKUP_FAILED');
  return z
    .object({
      prices: z.array(
        z.object({
          endpoint_id: z.string(),
          unit_price: z.number().nonnegative(),
          unit: z.string(),
          currency: z.string(),
        }),
      ),
    })
    .parse(await response.json()).prices;
}
