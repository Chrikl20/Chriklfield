import type { ModelKey } from './types';
export const MODELS = {
  draft: {
    name: 'Krea 2 Turbo',
    endpoint: 'fal-ai/krea-2/turbo',
    baseModel: 'krea-2',
    capabilities: ['text-to-image'],
    inputs: ['prompt', 'image_size', 'num_images', 'seed'],
    limits: { images: 4, prompt: 5000 },
    priceUnit: 'megapixel',
  },
  train: {
    name: 'Krea 2 Training',
    endpoint: 'fal-ai/krea-2-trainer',
    baseModel: 'krea-2',
    capabilities: ['train-lora'],
    inputs: [
      'images_data_url',
      'trigger_phrase',
      'steps',
      'learning_rate',
      'resolution',
      'auto_captioning',
    ],
    limits: { minImages: 8, maxImages: 80, minSteps: 50, maxSteps: 2000 },
    priceUnit: 'step',
  },
  image: {
    name: 'Krea 2 · Character LoRA',
    endpoint: 'fal-ai/krea-2/turbo/lora',
    baseModel: 'krea-2',
    capabilities: ['text-to-image', 'lora'],
    inputs: ['prompt', 'image_size', 'num_images', 'seed', 'loras'],
    limits: { images: 4, loras: 3, prompt: 5000 },
    priceUnit: 'megapixel',
  },
  edit: {
    name: 'Seedream 4.5 Edit',
    endpoint: 'fal-ai/bytedance/seedream/v4.5/edit',
    baseModel: 'seedream-4.5',
    capabilities: ['reference-edit'],
    inputs: ['prompt', 'image_urls', 'num_images', 'max_images', 'image_size', 'seed'],
    limits: { references: 10, images: 4 },
    priceUnit: 'image',
  },
  video: {
    name: 'Kling 3 Pro',
    endpoint: 'fal-ai/kling-video/v3/pro/image-to-video',
    baseModel: 'kling-v3',
    capabilities: ['image-to-video'],
    inputs: ['prompt', 'start_image_url', 'duration', 'generate_audio'],
    limits: { minSeconds: 3, maxSeconds: 15, minDimension: 300, maxBytes: 10485760 },
    priceUnit: 'second',
  },
  motion: {
    name: 'Kling 3 · Motion Control',
    endpoint: 'fal-ai/kling-video/v3/pro/motion-control',
    baseModel: 'kling-v3',
    capabilities: ['motion-transfer'],
    inputs: ['prompt', 'image_url', 'video_url', 'character_orientation', 'keep_original_sound'],
    limits: {
      minSeconds: 3,
      maxSecondsImage: 10,
      maxSecondsVideo: 30,
      minDimension: 340,
      maxDimension: 3850,
      maxVideoBytes: 104857600,
    },
    priceUnit: 'second',
  },
} as const satisfies Record<ModelKey, unknown>;
export const SCHEMA_CHECKED_AT = '2026-09-05';
export function assertLoraCompatible(model: ModelKey, baseModel: string) {
  if (model !== 'image' || baseModel !== MODELS.image.baseModel)
    throw new Error('INCOMPATIBLE_LORA');
}
export const ERROR_MAP = {
  400: 'PROVIDER_INPUT_REJECTED',
  401: 'PROVIDER_AUTH',
  403: 'PROVIDER_AUTH',
  422: 'PROVIDER_INPUT_REJECTED',
  429: 'PROVIDER_RATE_LIMIT',
} as const;
