if (typeof window !== 'undefined') throw new Error('SERVER_MODULE_IN_BROWSER');
export function mode(): 'demo' | 'live' {
  if (process.env.APP_MODE === 'demo') {
    if (process.env.NODE_ENV === 'production') throw new Error('DEMO_DISABLED_IN_PRODUCTION');
    return 'demo';
  }
  return 'live';
}
export function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`CONFIG_MISSING:${name}`);
  return value;
}
export function appUrl() {
  const preview =
    process.env.VERCEL_ENV === 'preview'
      ? process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL
      : undefined;
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const url = new URL(
    process.env.APP_URL ||
      (preview
        ? `https://${preview}`
        : production
          ? `https://${production}`
          : 'http://localhost:3000'),
  );
  return url.origin;
}
export function appOrigins() {
  const origins = [appUrl()];
  if (process.env.VERCEL_ENV === 'preview')
    for (const host of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL])
      if (host) origins.push(new URL(`https://${host}`).origin);
  return origins;
}
export function assertGenerationEnabled() {
  if (mode() !== 'live' || process.env.ENABLE_PAID_GENERATION !== 'true')
    throw new Error('PAID_GENERATION_DISABLED');
  const credentials = required('HF_CREDENTIALS');
  const separator = credentials.indexOf(':');
  if (separator <= 0 || separator === credentials.length - 1)
    throw new Error('HF_CREDENTIALS_INVALID');
}
export function isAdmin(id: string) {
  return (process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(id);
}
