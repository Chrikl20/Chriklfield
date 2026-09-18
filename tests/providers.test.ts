import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  buildProviderInput,
  HiggsfieldProvider,
  ProviderRejected,
} from '@/server/providers/higgsfield';
import { jobInputSchema } from '@/domain/validation';
import { calculateQuote } from '@/domain/pricing';
import type { ModelPrice } from '@/domain/types';

const context = {
  identity: 'identity',
  body: 'body',
  characterName: 'Nova',
  assets: [],
  references: [],
};

afterEach(() => vi.unstubAllEnvs());

describe('Higgsfield provider adapter and pricing boundaries', () => {
  it('builds Soul ID training input from approved image URLs', () => {
    const p = buildProviderInput(
      jobInputSchema.parse({
        model: 'train',
        characterId: '11111111-1111-4111-8111-111111111111',
      }),
      context,
      {
        referenceUrls: Array.from(
          { length: 20 },
          (_, i) => `https://example.test/reference-${i + 1}.jpg`,
        ),
      },
    );
    expect(p).toEqual({
      name: 'Nova',
      input_images: Array.from({ length: 20 }, (_, i) => ({
        type: 'image_url',
        image_url: `https://example.test/reference-${i + 1}.jpg`,
      })),
    });
  });

  it('uses a Soul ID for character image generation', () => {
    const p = buildProviderInput(
      jobInputSchema.parse({
        model: 'image',
        characterId: '11111111-1111-4111-8111-111111111111',
        prompt: 'portrait',
        count: 1,
      }),
      context,
      { providerReferenceId: 'soul-id-1' },
    );
    expect(p).toMatchObject({
      custom_reference_id: 'soul-id-1',
      custom_reference_strength: 1,
      batch_size: 1,
    });
  });

  it('does not repeat an ambiguous paid submit', async () => {
    vi.stubEnv('HF_API_KEY_ID', 'key');
    vi.stubEnv('HF_API_KEY_SECRET', 'secret');
    const transport = vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    const provider = new HiggsfieldProvider(transport);
    await expect(
      provider.submit(
        'video',
        buildProviderInput(
          jobInputSchema.parse({
            model: 'video',
            prompt: 'wave',
            sourceAssetId: '11111111-1111-4111-8111-111111111111',
          }),
          context,
          { sourceUrl: 'https://example.test/x.jpg' },
        ),
      ),
    ).rejects.toThrow('PROVIDER_ACCEPTANCE_UNKNOWN');
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('marks a definitive provider input rejection as terminal', async () => {
    vi.stubEnv('HF_CREDENTIALS', 'key:secret');
    const transport = vi.fn().mockResolvedValue(new Response('{}', { status: 422 }));
    const provider = new HiggsfieldProvider(transport);
    await expect(
      provider.submit(
        'video',
        buildProviderInput(
          jobInputSchema.parse({
            model: 'video',
            prompt: 'wave',
            sourceAssetId: '11111111-1111-4111-8111-111111111111',
          }),
          context,
          { sourceUrl: 'https://example.test/x.jpg' },
        ),
      ),
    ).rejects.toMatchObject({
      confirmedNoCharge: true,
      code: 'PROVIDER_INPUT_REJECTED',
    } satisfies Partial<ProviderRejected>);
  });

  it('uses verified server-side prices and measured motion duration', () => {
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
  });
});
