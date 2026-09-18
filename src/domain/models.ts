import type { ModelKey } from './types';

export const MODELS = {
  draft: {
    name: 'Higgsfield Soul',
    endpoint: '/v1/text2image/soul',
    baseModel: 'higgsfield-soul',
    capabilities: ['text-to-image'],
    inputs: ['prompt', 'width_and_height', 'batch_size', 'seed'],
    limits: { images: 4, prompt: 5000 },
    priceUnit: 'image',
  },
  train: {
    name: 'Higgsfield Soul ID',
    endpoint: '/v1/custom-references',
    baseModel: 'higgsfield-soul-id',
    capabilities: ['soul-id-training'],
    inputs: ['name', 'input_images'],
    limits: { minImages: 20, maxImages: 80 },
    priceUnit: 'job',
  },
  image: {
    name: 'Higgsfield Soul · Character',
    endpoint: '/v1/text2image/soul',
    baseModel: 'higgsfield-soul',
    capabilities: ['text-to-image', 'soul-id'],
    inputs: ['prompt', 'width_and_height', 'batch_size', 'custom_reference_id', 'seed'],
    limits: { images: 4, prompt: 5000 },
    priceUnit: 'image',
  },
  edit: {
    name: 'Higgsfield Soul · Reference',
    endpoint: '/v1/text2image/soul',
    baseModel: 'higgsfield-soul',
    capabilities: ['reference-image'],
    inputs: ['prompt', 'width_and_height', 'batch_size', 'image_reference', 'seed'],
    limits: { references: 1, images: 4, prompt: 5000 },
    priceUnit: 'image',
  },
  video: {
    name: 'Kling 3.0 Pro · Higgsfield',
    endpoint: 'kling-video/v3.0/pro/image-to-video',
    baseModel: 'kling-v3',
    capabilities: ['image-to-video'],
    inputs: ['prompt', 'image_url', 'duration', 'sound', 'cfg_scale', 'multi_shots'],
    limits: { minSeconds: 3, maxSeconds: 15, minDimension: 300, maxBytes: 10485760 },
    priceUnit: 'second',
  },
  motion: {
    name: 'Genjutsu Motion Transfer · Higgsfield',
    endpoint: 'higgsfiled/genjutsu/motion-transfer/v1.0',
    baseModel: 'higgsfield-genjutsu',
    capabilities: ['motion-transfer'],
    inputs: ['prompt', 'video_url', 'image_urls', 'resolution'],
    limits: {
      maxReferences: 8,
      minDimension: 340,
      maxDimension: 3850,
      maxVideoBytes: 104857600,
    },
    priceUnit: 'second',
  },
} as const satisfies Record<ModelKey, unknown>;

export const SCHEMA_CHECKED_AT = '2026-09-18';

export const ERROR_MAP = {
  400: 'PROVIDER_INPUT_REJECTED',
  401: 'PROVIDER_AUTH',
  402: 'PROVIDER_CREDITS',
  403: 'PROVIDER_AUTH',
  422: 'PROVIDER_INPUT_REJECTED',
  429: 'PROVIDER_RATE_LIMIT',
} as const;
