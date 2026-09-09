import { afterEach, describe, it, expect, vi } from 'vitest';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import {
  buildProviderInput,
  FalProvider,
  parseProviderResult,
  ProviderRejected,
} from '@/server/providers/fal';
import { verifyFalSignature } from '@/server/providers/webhook';
import { jobInputSchema } from '@/domain/validation';
import { assertLoraCompatible } from '@/domain/models';
import { calculateQuote } from '@/domain/pricing';
import type { ModelPrice } from '@/domain/types';
const context = {
  identity: 'identity',
  body: 'body',
  assets: [],
  references: [],
  triggerWord: 'chrNova',
};
afterEach(() => vi.unstubAllEnvs());
describe('documented provider adapters and failure boundaries', () => {
  it('uses Krea training field names and a numeric resolution, with paid auto-captioning off', () => {
    const p = buildProviderInput(
      jobInputSchema.parse({ model: 'train', characterId: '11111111-1111-4111-8111-111111111111' }),
      context,
      { datasetUrl: 'https://storage.example/train.zip' },
    );
    expect(p).toEqual({
      images_data_url: 'https://storage.example/train.zip',
      trigger_phrase: 'chrNova',
      auto_captioning: 'Off',
      steps: 100,
      learning_rate: 0.0005,
      resolution: 768,
      debug_dataset: false,
    });
  });
  it('never sends LoRA weights to Kling and distinguishes start_image_url from motion image_url', () => {
    const input = jobInputSchema.parse({
      model: 'video',
      prompt: 'wave',
      sourceAssetId: '11111111-1111-4111-8111-111111111111',
    });
    const p = buildProviderInput(input, context, {
      sourceUrl: 'https://img.example/x',
      weightsUrl: 'secret',
    });
    expect(p).toEqual({
      prompt: 'wave',
      start_image_url: 'https://img.example/x',
      duration: '5',
      generate_audio: false,
    });
    expect(() => assertLoraCompatible('video', 'krea-2')).toThrow('INCOMPATIBLE_LORA');
    expect(() => assertLoraCompatible('image', 'flux')).toThrow('INCOMPATIBLE_LORA');
  });
  it('requires actual reference images for Seedream identity views', () => {
    const input = jobInputSchema.parse({
      model: 'edit',
      prompt: 'profile',
      characterId: '11111111-1111-4111-8111-111111111111',
    });
    expect(() => buildProviderInput(input, context, {})).toThrow('REFERENCES_MISSING');
    expect(
      buildProviderInput(input, context, { referenceUrls: ['https://img.example/identity'] }),
    ).toMatchObject({ max_images: 1 });
  });
  it('does not repeat a paid submit after timeout, 500, or a malformed success response', async () => {
    vi.stubEnv('FAL_KEY', 'test-not-a-real-key');
    for (const transport of [
      vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError')),
      vi.fn().mockResolvedValue(new Response('{}', { status: 500 })),
      vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
    ]) {
      const provider = new FalProvider(transport);
      await expect(
        provider.submit(
          'draft',
          buildProviderInput(jobInputSchema.parse({ model: 'draft', prompt: 'test' }), context, {}),
          'https://app.example/webhook',
        ),
      ).rejects.toThrow('PROVIDER_ACCEPTANCE_UNKNOWN');
      expect(transport).toHaveBeenCalledTimes(1);
    }
  });
  it('marks a definitive provider input rejection as terminal without speculative retries', async () => {
    vi.stubEnv('FAL_KEY', 'test');
    const transport = vi.fn().mockResolvedValue(new Response('{}', { status: 422 }));
    await expect(
      new FalProvider(transport).submit(
        'train',
        buildProviderInput(
          jobInputSchema.parse({
            model: 'train',
            characterId: '11111111-1111-4111-8111-111111111111',
          }),
          context,
          { datasetUrl: 'https://example.test/fixture.zip' },
        ),
        'https://app.example/hook',
      ),
    ).rejects.toMatchObject({ confirmedNoCharge: true, code: 'PROVIDER_INPUT_REJECTED' });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('rejects unsafe results and validates train/video output shapes', () => {
    expect(() =>
      parseProviderResult('image', {
        images: [{ url: 'https://fal.media/x' }],
        has_nsfw_concepts: [true],
      }),
    ).toThrow(ProviderRejected);
    expect(() => parseProviderResult('train', { images: [] })).toThrow();
    expect(
      parseProviderResult('video', { video: { url: 'https://fal.media/x.mp4' } }).files[0].kind,
    ).toBe('video');
  });
  it('verifies ED25519 signatures over raw bytes, enforces account identity and rejects stale/replayed bodies', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519'),
      key = publicKey.export({ format: 'jwk' }) as { kty: 'OKP'; crv: 'Ed25519'; x: string };
    const now = Date.now(),
      stamp = String(Math.floor(now / 1000)),
      body = Buffer.from('{"request_id":"req-1","status":"OK"}');
    const msg = Buffer.from(
      ['req-1', 'our-fal-user', stamp, createHash('sha256').update(body).digest('hex')].join('\n'),
    );
    const h = new Headers({
      'x-fal-webhook-request-id': 'req-1',
      'x-fal-webhook-user-id': 'our-fal-user',
      'x-fal-webhook-timestamp': stamp,
      'x-fal-webhook-signature': sign(null, msg, privateKey).toString('hex'),
    });
    expect(verifyFalSignature(h, body, [key], 'our-fal-user', now)).toBe(true);
    expect(verifyFalSignature(h, Buffer.from('{}'), [key], 'our-fal-user', now)).toBe(false);
    expect(verifyFalSignature(h, body, [key], 'another-user', now)).toBe(false);
    expect(verifyFalSignature(h, body, [key], 'our-fal-user', now + 301000)).toBe(false);
  });
  it('uses verified server-side prices and measured motion duration, including credit rounding', () => {
    const p: ModelPrice = {
      model: 'motion',
      version: 'v1',
      unit: 'second',
      unit_microusd: 168000,
      audio_multiplier: 1,
      resolution_multiplier: 1,
      verified_at: new Date().toISOString(),
      enabled: true,
      max_parallel: 3,
      budget_microusd: 10000000,
    };
    const input = jobInputSchema.parse({
      model: 'motion',
      prompt: 'move',
      sourceAssetId: '11111111-1111-4111-8111-111111111111',
      motionAssetId: '22222222-2222-4222-8222-222222222222',
    });
    const q = calculateQuote(input, p, { motionSeconds: 10 });
    expect(q.estimatedMicrousd).toBe(1932000);
    expect(q.credits).toBe(310);
    expect(() => calculateQuote(input, { ...p, verified_at: null }, { motionSeconds: 5 })).toThrow(
      'PRICE_REVIEW_REQUIRED',
    );
  });
});
