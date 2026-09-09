import { afterEach, test, expect, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { appUrl } from '@/server/config';
import { sameOrigin } from '@/server/http';
afterEach(() => vi.unstubAllEnvs());
test('uses trusted Vercel URLs and keeps unrelated origins blocked', () => {
  vi.stubEnv('APP_URL', '');
  vi.stubEnv('VERCEL_ENV', 'preview');
  vi.stubEnv('VERCEL_URL', 'studio-build.example.test');
  vi.stubEnv('VERCEL_BRANCH_URL', 'studio-branch.example.test');
  vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'studio.example.test');
  expect(appUrl()).toBe('https://studio-branch.example.test');
  sameOrigin(
    new Request('https://ignored.test', {
      headers: { origin: 'https://studio-build.example.test' },
    }),
  );
  expect(() =>
    sameOrigin(
      new Request('https://ignored.test', { headers: { origin: 'https://attacker.test' } }),
    ),
  ).toThrow('ORIGIN_REJECTED');
  vi.stubEnv('VERCEL_ENV', 'production');
  expect(appUrl()).toBe('https://studio.example.test');
  expect(() =>
    sameOrigin(
      new Request('https://ignored.test', {
        headers: { origin: 'https://studio-build.example.test' },
      }),
    ),
  ).toThrow('ORIGIN_REJECTED');
  vi.stubEnv('APP_URL', 'https://custom.example.test');
  expect(appUrl()).toBe('https://custom.example.test');
});
test('installed Supabase SDK signs a single path and uploads directly without overwrite', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const client = createClient('https://project.example.test', 'public-test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        calls.push({ url: String(input), init: init || {} });
        return new Response(
          JSON.stringify(
            calls.length === 1
              ? {
                  url: '/object/upload/sign/creator-intake-images/workspace/intent/source?token=fixture-token',
                }
              : { Key: 'creator-intake-images/workspace/intent/source' },
          ),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    },
  });
  const bucket = client.storage.from('creator-intake-images');
  const signed = await bucket.createSignedUploadUrl('workspace/intent/source', { upsert: false });
  expect(signed.error).toBeNull();
  await bucket.uploadToSignedUrl(signed.data!.path, signed.data!.token, new Uint8Array([1, 2]), {
    contentType: 'image/jpeg',
    cacheControl: '0',
  });
  expect(calls).toHaveLength(2);
  expect(calls[0].init.method).toBe('POST');
  expect(new Headers(calls[0].init.headers).get('x-upsert')).not.toBe('true');
  expect(new URL(calls[1].url).hostname).toBe('project.example.test');
  expect(new URL(calls[1].url).searchParams.get('token')).toBe('fixture-token');
  expect(new Headers(calls[1].init.headers).get('x-upsert')).toBe('false');
});
