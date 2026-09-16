import { z } from 'zod';

export const authCompletionSchema = z.union([
  z
    .object({
      code: z.string().min(1).max(2048),
      flowId: z
        .string()
        .regex(/^[a-zA-Z0-9_-]{1,128}$/)
        .optional(),
    })
    .strict(),
  z
    .object({
      access_token: z.string().min(1).max(16384),
      refresh_token: z.string().min(1).max(4096),
    })
    .strict(),
]);
export type AuthCompletion = z.infer<typeof authCompletionSchema>;

export const authMessages = {
  AUTH_CREDENTIALS: 'E-Mail-Adresse oder Passwort stimmen nicht überein.',
  AUTH_EMAIL_UNCONFIRMED: 'Bestätige zuerst deine E-Mail-Adresse über den Link in deinem Postfach.',
  AUTH_PASSWORD_WEAK: 'Dieses Passwort ist zu schwach. Wähle ein längeres, einzigartiges Passwort.',
  AUTH_PASSWORD_SAME: 'Wähle ein anderes Passwort als dein bisheriges.',
  AUTH_SIGNUP_DISABLED: 'Neue Registrierungen sind derzeit nicht freigeschaltet.',
  AUTH_LINK_INVALID:
    'Der Anmeldelink ist unvollständig oder ungültig. Fordere einen neuen Link an.',
  AUTH_LINK_EXPIRED:
    'Dieser Anmeldelink ist abgelaufen oder wurde bereits verwendet. Fordere einen neuen Link an und öffne nur die neueste E-Mail.',
  AUTH_BROWSER_MISMATCH:
    'Dieser ältere Anmeldelink gehört zu einem anderen Browser oder Anmeldeversuch. Öffne ihn im ursprünglichen Browser oder fordere hier einen neuen Link an.',
  AUTH_UNAVAILABLE:
    'Die Anmeldung konnte gerade nicht abgeschlossen werden. Bitte versuche es später erneut.',
  AUTH_EMAIL_LIMIT:
    'Es wurden zu viele Anmelde-E-Mails angefordert. Bitte warte, bevor du einen weiteren Link anforderst.',
  AUTH_REQUEST_LIMIT: 'Zu viele Anmeldeversuche. Bitte warte und versuche es später erneut.',
  AUTH_EMAIL_UNAVAILABLE:
    'Der E-Mail-Versand ist für diese Anmeldung noch nicht freigeschaltet. Bitte kontaktiere das Chriklfield-Team.',
  AUTH_EMAIL_INVALID:
    'Diese E-Mail-Adresse wird vom Anmeldedienst nicht akzeptiert. Bitte prüfe die Adresse.',
} as const;
export type AuthFailureCode = keyof typeof authMessages;

// Never display error_description or other untrusted URL contents.
export function readAuthReturn(href: string): AuthCompletion | AuthFailureCode {
  const url = new URL(href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  if (url.searchParams.has('error') || fragment.has('error')) {
    const code = fragment.get('error_code') || url.searchParams.get('error_code');
    return code === 'otp_expired' ? 'AUTH_LINK_EXPIRED' : 'AUTH_LINK_INVALID';
  }
  const code = url.searchParams.get('code');
  const access_token = fragment.get('access_token');
  const refresh_token = fragment.get('refresh_token');
  if (code && (access_token || refresh_token)) return 'AUTH_LINK_INVALID';
  const parsed = authCompletionSchema.safeParse(
    code
      ? {
          code,
          ...(url.searchParams.has('sb_flow_id')
            ? { flowId: url.searchParams.get('sb_flow_id') }
            : {}),
        }
      : { access_token, refresh_token },
  );
  return parsed.success ? parsed.data : 'AUTH_LINK_INVALID';
}

export function isPublicPage(pathname: string) {
  return ['/login', '/signup', '/forgot-password', '/reset-password', '/onboarding', '/credits', '/auth/callback', '/', '/explore', '/image', '/video'].includes(pathname);
}
