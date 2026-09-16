import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .email('Bitte gib eine gültige E-Mail-Adresse ein.')
  .max(254);
export const passwordSchema = z
  .string()
  .min(10, 'Verwende mindestens 10 Zeichen.')
  .max(128, 'Verwende höchstens 128 Zeichen.');
export const loginSchema = z
  .object({ email: emailSchema, password: z.string().min(1).max(128) })
  .strict();
export const signupSchema = z.object({ email: emailSchema, password: passwordSchema }).strict();
export const preferencesSchema = z
  .object({
    version: z.literal(1),
    goal: z.enum(['influencer', 'images', 'video']),
    vibe: z.enum(['Fashion', 'Lifestyle', 'Beauty']),
    platform: z.enum(['instagram', 'tiktok', 'youtube']),
    completed: z.literal(true),
  })
  .strict();
export type CreatorPreferences = z.infer<typeof preferencesSchema>;
export interface AccountSession {
  authenticated: boolean;
  userId?: string;
  preferences?: CreatorPreferences | null;
  demo?: boolean;
}
export const defaultPreferences: CreatorPreferences = {
  version: 1,
  goal: 'influencer',
  vibe: 'Lifestyle',
  platform: 'instagram',
  completed: true,
};
export function readPreferences(value: unknown): CreatorPreferences | null {
  const parsed = preferencesSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
export function preferredFormat(
  preferences: CreatorPreferences | null | undefined,
): '4:5' | '9:16' | '16:9' {
  return preferences?.platform === 'tiktok'
    ? '9:16'
    : preferences?.platform === 'youtube'
      ? '16:9'
      : '4:5';
}
export function preferredStudio(preferences: CreatorPreferences | null | undefined) {
  return preferences?.goal === 'video'
    ? '/video'
    : preferences?.goal === 'images'
      ? '/image'
      : '/characters';
}
// Only known local routes and harmless studio identifiers can survive authentication.
export function safeDestination(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\s]/.test(value))
    return '/explore';
  try {
    const url = new URL(value, 'https://local.invalid');
    if (
      url.origin !== 'https://local.invalid' ||
      !['/explore', '/image', '/video', '/characters', '/library', '/billing'].includes(
        url.pathname,
      )
    )
      return '/explore';
    const params = new URLSearchParams();
    for (const key of ['preset', 'template', 'source', 'version', 'mode']) {
      const item = url.searchParams.get(key);
      if (item && /^[a-zA-Z0-9_-]{1,100}$/.test(item)) params.set(key, item);
    }
    return url.pathname + (params.size ? `?${params}` : '');
  } catch {
    return '/explore';
  }
}
export function accountHref(kind: 'login' | 'signup', next: string) {
  return `/${kind}?next=${encodeURIComponent(safeDestination(next))}`;
}
export function standalonePage(path: string) {
  return [
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/onboarding',
    '/credits',
    '/auth/callback',
  ].includes(path);
}
export function publicStudioPage(path: string) {
  return ['/', '/explore', '/image', '/video'].includes(path);
}
