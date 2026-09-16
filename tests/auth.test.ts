import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthApiError, AuthPKCECodeVerifierMissingError } from '@supabase/supabase-js';
import { GET, POST } from '@/app/api/auth/[action]/route';
import * as privateApi from '@/app/api/[...path]/route';
import { userClient } from '@/lib/supabase/server';
import { authFailure } from '@/server/auth-errors';
import { isPublicPage, readAuthReturn } from '@/domain/auth-link';

// Only the HTTP provider and Next's cookie jar are simulated. The installed
// Supabase SDK/SSR client validates responses and writes real cookie chunks.
const cookieJar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
  }),
}));

const origin = 'https://studio.test';
const user = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'test@example.test',
};
const jwt =
  [
    { alg: 'HS256', typ: 'JWT' },
    { sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated' },
  ]
    .map((v) => Buffer.from(JSON.stringify(v)).toString('base64url'))
    .join('.') + '.test-signature';
const session = { access_token: jwt, refresh_token: 'deterministic-test-refresh-token' };
let provider: ReturnType<typeof vi.fn<typeof fetch>>;

function request(action: string, body: unknown, requestOrigin = origin) {
  return POST(
    new Request(`${origin}/api/auth/${action}`, {
      method: 'POST',
      headers: { Origin: requestOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ action }) },
  );
}

beforeEach(() => {
  cookieJar.clear();
  vi.stubEnv('APP_MODE', 'live');
  vi.stubEnv('APP_URL', origin);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-publishable-key');
  provider = vi.fn<typeof fetch>(async () => {
    throw new Error('Unexpected provider request');
  });
  vi.stubGlobal('fetch', provider);
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('email-link authentication', () => {
  it('sends the canonical callback without a browser-bound verifier or server secret', async () => {
    provider.mockResolvedValue(Response.json({}));
    const response = await request('magic-link', { email: 'test@example.test' });
    expect(response.status).toBe(200);
    expect(provider).toHaveBeenCalledTimes(1);
    const [url, init] = provider.mock.calls[0]!;
    expect(new URL(String(url)).pathname).toBe('/auth/v1/otp');
    expect(new URL(String(url)).searchParams.get('redirect_to')).toBe(`${origin}/auth/callback`);
    const body = JSON.parse(String(init!.body));
    expect(body.code_challenge).toBeNull();
    expect(body.code_challenge_method).toBeNull();
    expect(cookieJar.size).toBe(0);
    expect(new Headers(init!.headers).get('apikey')).toBe('test-publishable-key');
  });

  it('establishes a verified cookie session in a fresh browser before the studio request', async () => {
    provider.mockImplementation(async (url, init) => {
      expect(String(url)).toBe('https://supabase.test/auth/v1/user');
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${jwt}`);
      return Response.json(user);
    });
    const response = await request('complete', session);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect([...cookieJar].some(([name, value]) => name.startsWith('sb-') && value)).toBe(true);
    const nextRequest = await userClient();
    const { data, error } = await nextRequest.auth.getUser();
    expect(error).toBeNull();
    expect(data.user?.id).toBe(user.id);
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain(jwt);
  });

  it('rejects forged credentials instead of establishing a session', async () => {
    provider.mockResolvedValue(
      Response.json(
        { code: 'bad_jwt', message: 'Invalid JWT' },
        {
          status: 401,
          headers: { 'x-supabase-api-version': '2024-01-01' },
        },
      ),
    );
    const response = await request('complete', session);
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe('AUTH_LINK_INVALID');
    expect([...cookieJar.values()].filter(Boolean)).toEqual([]);
  });

  it('explains legacy PKCE links with no matching browser cookie without consuming the code', async () => {
    const response = await request('complete', { code: 'old-email-code' });
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe('AUTH_BROWSER_MISMATCH');
    expect(provider).not.toHaveBeenCalled();
  });

  it('does not call Supabase for cross-origin or incomplete submissions', async () => {
    expect((await request('complete', session, 'https://attacker.test')).status).toBe(403);
    expect((await request('complete', { access_token: jwt })).status).toBe(400);
    expect((await request('login', {})).status).toBe(400);
    expect((await request('unknown', {})).status).toBe(404);
    expect(provider).not.toHaveBeenCalled();
  });

  it('still exchanges an existing PKCE link in its original browser exactly once', async () => {
    provider.mockImplementation(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === '/auth/v1/otp') return Response.json({});
      expect(path).toBe('/auth/v1/token');
      const body = JSON.parse(String(init?.body));
      expect(body.auth_code).toBe('existing-pkce-code');
      expect(body.code_verifier.length).toBeGreaterThan(20);
      return Response.json({ ...session, user, expires_in: 3600, token_type: 'bearer' });
    });
    const browser = await userClient();
    await browser.auth.signInWithOtp({ email: 'test@example.test' });
    expect([...cookieJar.keys()].some((name) => name.includes('code-verifier'))).toBe(true);
    expect((await request('complete', { code: 'existing-pkce-code' })).status).toBe(200);
    provider.mockClear();
    const second = await request('complete', { code: 'existing-pkce-code' });
    expect(second.status).toBe(401);
    expect(provider).not.toHaveBeenCalled();
  });

  it('rejects an expired session whose refresh credential is no longer valid', async () => {
    const expiredJwt =
      jwt.split('.')[0] +
      '.' +
      Buffer.from(JSON.stringify({ sub: user.id, exp: 1 })).toString('base64url') +
      '.test-signature';
    provider.mockImplementation(async (url) => {
      expect(new URL(String(url)).searchParams.get('grant_type')).toBe('refresh_token');
      return Response.json(
        { code: 'refresh_token_not_found', message: 'Invalid refresh' },
        {
          status: 400,
          headers: { 'x-supabase-api-version': '2024-01-01' },
        },
      );
    });
    const response = await request('complete', { ...session, access_token: expiredJwt });
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe('AUTH_LINK_EXPIRED');
    expect([...cookieJar.values()].filter(Boolean)).toEqual([]);
  });

  it.each([
    ['over_email_send_rate_limit', 429, 'AUTH_EMAIL_LIMIT'],
    ['email_address_not_authorized', 400, 'AUTH_EMAIL_UNAVAILABLE'],
  ])(
    'reports sending failure %s without retrying or claiming an email was sent',
    async (code, status, expected) => {
      provider.mockResolvedValue(
        Response.json(
          { code, message: 'Private diagnostic text' },
          {
            status,
            headers: { 'x-supabase-api-version': '2024-01-01' },
          },
        ),
      );
      const response = await request('magic-link', { email: 'test@example.test' });
      expect((await response.json()).error).toBe(expected);
      expect(provider).toHaveBeenCalledTimes(1);
    },
  );
});

describe('safe authentication diagnostics', () => {
  it.each([
    ['otp_expired', 'AUTH_LINK_EXPIRED', 401],
    ['bad_code_verifier', 'AUTH_BROWSER_MISMATCH', 401],
    ['over_request_rate_limit', 'AUTH_REQUEST_LIMIT', 429],
    ['email_provider_disabled', 'AUTH_EMAIL_UNAVAILABLE', 503],
  ])('maps %s to an actionable error', async (providerCode, expected, status) => {
    const response = authFailure(
      new AuthApiError('Never show this message', 400, providerCode),
      'complete',
    );
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body.error).toBe(expected);
    expect(body.message).not.toBe('Never show this message');
  });
  it('recognizes the SDK verifier-missing error', async () => {
    const response = authFailure(new AuthPKCECodeVerifierMissingError(), 'complete');
    expect((await response.json()).error).toBe('AUTH_BROWSER_MISMATCH');
  });
  it('never logs arbitrary provider codes, messages, addresses or token-bearing URLs', async () => {
    const privateValue = 'person@example.test https://example.test/#access_token=secret';
    const response = authFailure(new AuthApiError(privateValue, 500, privateValue), 'complete');
    expect(await response.text()).not.toContain(privateValue);
    const logs = JSON.stringify(vi.mocked(console.info).mock.calls);
    expect(logs).not.toContain(privateValue);
    expect(logs).toContain('unknown');
    expect(logs).toContain('complete');
  });
});

describe('callback routing', () => {
  it('reads tokens from the fragment, preserving no query-controlled redirect or user', () => {
    const hash = new URLSearchParams(session).toString();
    expect(readAuthReturn(`${origin}/auth/callback?next=https://attacker.test#${hash}`)).toEqual(
      session,
    );
    expect(readAuthReturn(`${origin}/auth/callback?access_token=foo&refresh_token=bar`)).toBe(
      'AUTH_LINK_INVALID',
    );
  });
  it('supports existing code links, rejects mixed credentials, and hides provider error descriptions', () => {
    expect(readAuthReturn(`${origin}/auth/callback?code=old-code`)).toEqual({ code: 'old-code' });
    expect(readAuthReturn(`${origin}/auth/callback?code=old&sb_flow_id=flow-1`)).toEqual({
      code: 'old',
      flowId: 'flow-1',
    });
    expect(
      readAuthReturn(`${origin}/auth/callback?code=old#access_token=foo&refresh_token=bar`),
    ).toBe('AUTH_LINK_INVALID');
    expect(
      readAuthReturn(
        `${origin}/auth/callback#error=access_denied&error_code=otp_expired&error_description=PRIVATE`,
      ),
    ).toBe('AUTH_LINK_EXPIRED');
    expect(readAuthReturn(`${origin}/auth/callback`)).toBe('AUTH_LINK_INVALID');
  });
  it('does not race studio polling against a callback that has not established cookies', () => {
    expect(isPublicPage('/auth/callback')).toBe(true);
    expect(isPublicPage('/explore')).toBe(true);
  });
});

describe('password accounts and private preferences', () => {
  const credentials = { email: 'test@example.test', password: 'a-long-unique-test-passphrase' };
  it('signs in using the password grant and writes cookies without an email request', async () => {
    provider.mockImplementation(async (url, init) => {
      expect(new URL(String(url)).searchParams.get('grant_type')).toBe('password');
      expect(JSON.parse(String(init?.body))).toMatchObject(credentials);
      return Response.json({ ...session, user, expires_in: 3600, token_type: 'bearer' });
    });
    const response = await request('login', credentials);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, authenticated: true });
    expect([...cookieJar.values()].some(Boolean)).toBe(true);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain(credentials.password);
  });
  it('requires a real confirmation before a new account gets a session', async () => {
    provider.mockImplementation(async (url, init) => {
      expect(new URL(String(url)).pathname).toBe('/auth/v1/signup');
      expect(new URL(String(url)).searchParams.get('redirect_to')).toBe(`${origin}/auth/callback`);
      expect(JSON.parse(String(init?.body))).toMatchObject(credentials);
      return Response.json({ ...user, identities: [] });
    });
    expect(await (await request('signup', credentials)).json()).toEqual({
      ok: true,
      confirmationRequired: true,
    });
    expect(cookieJar.size).toBe(0);
  });
  it('rejects weak passwords, forged roles and cross-origin submissions before the provider', async () => {
    expect((await request('signup', { ...credentials, password: 'short' })).status).toBe(400);
    expect((await request('signup', { ...credentials, role: 'admin' })).status).toBe(400);
    expect((await request('login', credentials, 'https://attacker.test')).status).toBe(403);
    expect(provider).not.toHaveBeenCalled();
  });
  it('gives the same login error for incorrect or nonexistent credentials', async () => {
    provider.mockResolvedValue(
      Response.json(
        { code: 'invalid_credentials', message: 'Sensitive reason' },
        { status: 400, headers: { 'x-supabase-api-version': '2024-01-01' } },
      ),
    );
    expect((await (await request('login', credentials)).json()).error).toBe('AUTH_CREDENTIALS');
    expect([...cookieJar.values()].filter(Boolean)).toEqual([]);
  });
  it('requests recovery with the existing cross-browser callback and no automatic account creation', async () => {
    provider.mockImplementation(async (url) => {
      expect(new URL(String(url)).pathname).toBe('/auth/v1/recover');
      expect(new URL(String(url)).searchParams.get('redirect_to')).toBe(`${origin}/auth/callback`);
      return Response.json({});
    });
    expect((await request('forgot', { email: credentials.email })).status).toBe(200);
    expect(cookieJar.size).toBe(0);
  });
  it('returns a minimal guest session and rejects anonymous password/preferences writes', async () => {
    const response = await GET(new Request(`${origin}/api/auth/session`), {
      params: Promise.resolve({ action: 'session' }),
    });
    expect(await response.json()).toEqual({ authenticated: false });
    expect(
      (
        await request('profile', {
          version: 1,
          goal: 'images',
          vibe: 'Fashion',
          platform: 'tiktok',
          completed: true,
        })
      ).status,
    ).toBe(401);
    expect((await request('password', { password: credentials.password })).status).toBe(401);
    expect(provider).not.toHaveBeenCalled();
  });
  it('only updates the current verified user; never accepts another user id or admin fields', async () => {
    const preferences = {
      version: 1,
      goal: 'images',
      vibe: 'Fashion',
      platform: 'tiktok',
      completed: true,
    };
    provider.mockImplementation(async (_url, init) => {
      if (init?.method === 'PUT') {
        expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${jwt}`);
        expect(JSON.parse(String(init.body))).toEqual({
          data: { creator_preferences: preferences },
          code_challenge: null,
          code_challenge_method: null,
        });
      }
      return Response.json({ ...user, user_metadata: { creator_preferences: preferences } });
    });
    await request('complete', session);
    expect((await request('profile', { ...preferences, userId: 'another-user' })).status).toBe(400);
    expect((await request('profile', { ...preferences, admin: true })).status).toBe(400);
    expect((await request('profile', preferences)).status).toBe(200);
    const profile = await GET(new Request(`${origin}/api/auth/session`), {
      params: Promise.resolve({ action: 'session' }),
    });
    expect(await profile.json()).toEqual({ authenticated: true, userId: user.id, preferences });
  });
});

describe('anonymous access to private studio APIs', () => {
  it.each([
    ['GET', 'state'],
    ['GET', 'admin'],
    ['GET', 'assets/00000000-0000-4000-8000-000000000009'],
    ['POST', 'quotes'],
    ['POST', 'jobs'],
    ['POST', 'uploads'],
    ['POST', 'billing'],
    ['POST', 'characters'],
    ['PATCH', 'assets/00000000-0000-4000-8000-000000000009'],
    ['DELETE', 'workspaces/00000000-0000-4000-8000-000000000009'],
  ] as const)('rejects %s %s before accessing data or paid providers', async (method, path) => {
    const response = await privateApi[method](
      new Request(`${origin}/api/${path}`, {
        method,
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        ...(method !== 'GET' ? { body: '{}' } : {}),
      }),
      { params: Promise.resolve({ path: path.split('/') }) },
    );
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe('UNAUTHENTICATED');
    expect(provider).not.toHaveBeenCalled();
  });
});
