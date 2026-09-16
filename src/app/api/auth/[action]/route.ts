import { z } from 'zod';
import { authCompletionSchema, authMessages } from '@/domain/auth-link';
import {
  emailSchema,
  loginSchema,
  signupSchema,
  passwordSchema,
  preferencesSchema,
  readPreferences,
  defaultPreferences,
} from '@/domain/account';
import { userClient } from '@/lib/supabase/server';
import { authFailure } from '@/server/auth-errors';
import { emailClient } from '@/server/email-client';
import { appUrl, mode } from '@/server/config';
import { json, jsonBody, log, route, sameOrigin } from '@/server/http';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ action: string }> };

export function GET(_request: Request, context: Context) {
  return route(async () => {
    if ((await context.params).action !== 'session') throw new Error('NOT_FOUND');
    if (mode() === 'demo')
      return json({
        authenticated: true,
        userId: '00000000-0000-4000-8000-000000000001',
        preferences: defaultPreferences,
        demo: true,
      });
    // Public browsing never requires a workspace, a service key, or anonymous users.
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
      return json({ authenticated: false });
    const client = await userClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return json({ authenticated: false });
    return json({
      authenticated: true,
      userId: data.user.id,
      preferences: readPreferences(data.user.user_metadata?.creator_preferences),
    });
  });
}

export function POST(request: Request, context: Context) {
  return route(async () => {
    sameOrigin(request);
    const { action } = await context.params;
    if (
      ![
        'login',
        'signup',
        'forgot',
        'password',
        'profile',
        'magic-link',
        'complete',
        'logout',
      ].includes(action)
    )
      throw new Error('NOT_FOUND');
    if (mode() === 'demo') return json({ ok: true, demo: true, authenticated: true });

    if (action === 'signup' || action === 'forgot' || action === 'magic-link') {
      const raw = await jsonBody(request);
      const body =
        action === 'signup'
          ? signupSchema.parse(raw)
          : z.object({ email: emailSchema }).strict().parse(raw);
      const sender = emailClient();
      try {
        if ('password' in body && typeof body.password === 'string') {
          const { data, error } = await sender.auth.signUp({
            email: body.email,
            password: body.password,
            options: { emailRedirectTo: `${appUrl()}/auth/callback` },
          });
          // Existing users receive the same generic confirmation response.
          if (error?.code === 'user_already_exists' || error?.code === 'email_exists')
            return json({ ok: true, confirmationRequired: true });
          if (error) return authFailure(error, 'send');
          if (data.session) {
            const client = await userClient();
            const result = await client.auth.setSession(data.session);
            if (result.error) return authFailure(result.error, 'complete');
            return json({ ok: true, authenticated: true });
          }
          return json({ ok: true, confirmationRequired: true });
        }
        const { error } =
          action === 'forgot'
            ? await sender.auth.resetPasswordForEmail(body.email, {
                redirectTo: `${appUrl()}/auth/callback`,
              })
            : await sender.auth.signInWithOtp({
                email: body.email,
                options: { emailRedirectTo: `${appUrl()}/auth/callback`, shouldCreateUser: false },
              });
        if (error) return authFailure(error, 'send');
        return json({ ok: true });
      } catch (error) {
        return authFailure(error, 'send');
      }
    }
    const client = await userClient();
    if (action === 'login') {
      const body = loginSchema.parse(await jsonBody(request));
      try {
        const { data, error } = await client.auth.signInWithPassword(body);
        if (error || !data.session || !data.user) return authFailure(error, 'complete');
        return json({ ok: true, authenticated: true });
      } catch (error) {
        return authFailure(error, 'complete');
      }
    }
    if (action === 'logout') {
      const { error } = await client.auth.signOut();
      if (error) return authFailure(error, 'complete');
      return json({ ok: true });
    }
    if (action === 'profile' || action === 'password') {
      const body =
        action === 'profile'
          ? preferencesSchema.parse(await jsonBody(request))
          : z
              .object({ password: passwordSchema })
              .strict()
              .parse(await jsonBody(request));
      const { data: current, error: invalid } = await client.auth.getUser();
      if (invalid || !current.user) throw new Error('UNAUTHENTICATED');
      // Editable preferences affect presentation only, never roles, credits or ownership.
      const { error } = await client.auth.updateUser(
        'password' in body ? { password: body.password } : { data: { creator_preferences: body } },
      );
      if (error) return authFailure(error, 'complete');
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
      log('auth_completed');
      return json({ ok: true });
    } catch (error) {
      return authFailure(error, 'complete');
    }
  });
}
