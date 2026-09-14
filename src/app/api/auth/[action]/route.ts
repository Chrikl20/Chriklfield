import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { authCompletionSchema, authMessages } from '@/domain/auth-link';
import { userClient } from '@/lib/supabase/server';
import { authFailure } from '@/server/auth-errors';
import { appUrl, mode, required } from '@/server/config';
import { json, jsonBody, log, route, sameOrigin } from '@/server/http';

export const dynamic = 'force-dynamic';
export function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  return route(async () => {
    sameOrigin(request);
    const { action } = await context.params;
    if (!['login', 'complete', 'logout'].includes(action)) throw new Error('NOT_FOUND');
    if (mode() === 'demo') return json({ ok: true });
    if (action === 'login') {
      const body = z
        .object({ email: z.email() })
        .strict()
        .parse(await jsonBody(request));
      // E-mail links are bearer credentials. A stateless sender avoids binding them
      // to the requesting browser. OAuth and existing PKCE links remain PKCE.
      const sender = createClient(
        required('NEXT_PUBLIC_SUPABASE_URL'),
        required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
        {
          auth: {
            flowType: 'implicit',
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        },
      );
      try {
        const { error } = await sender.auth.signInWithOtp({
          email: body.email,
          options: { emailRedirectTo: `${appUrl()}/auth/callback` },
        });
        if (error) return authFailure(error, 'send');
        return json({ ok: true });
      } catch (error) {
        return authFailure(error, 'send');
      }
    }
    const client = await userClient();
    if (action === 'logout') {
      const { error } = await client.auth.signOut();
      if (error) throw new Error('LOGOUT_FAILED');
      return json({ ok: true });
    }
    const parsed = authCompletionSchema.safeParse(await jsonBody(request));
    if (!parsed.success)
      return json({ error: 'AUTH_LINK_INVALID', message: authMessages.AUTH_LINK_INVALID }, 400);
    try {
      const credentials = parsed.data;
      const { data, error } =
        'code' in credentials
          ? await client.auth.exchangeCodeForSession(
              credentials.code,
              credentials.flowId ? { flowId: credentials.flowId } : undefined,
            )
          : await client.auth.setSession(credentials);
      if (error || !data.session || !data.user) return authFailure(error, 'complete');
      // setSession validates with Supabase (or refreshes); the SSR client awaits
      // Set-Cookie before this response. Never return tokens or a client-provided user.
      log('auth_completed');
      return json({ ok: true });
    } catch (error) {
      return authFailure(error, 'complete');
    }
  });
}
