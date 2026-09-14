import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { appOrigins } from './config';
export function sameOrigin(request: Request) {
  if (!appOrigins().includes(request.headers.get('origin') || ''))
    throw new Error('ORIGIN_REJECTED');
}
export async function boundedBody(request: Request, max = 64000) {
  if (Number(request.headers.get('content-length') || 0) > max) throw new Error('BODY_TOO_LARGE');
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) throw new Error('BODY_TOO_LARGE');
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    await reader.cancel().catch(() => {});
  }
}
export async function jsonBody(request: Request) {
  return JSON.parse((await boundedBody(request)).toString('utf8')) as unknown;
}
export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
}
export function log(
  event: string,
  fields: {
    jobId?: string;
    attemptId?: string;
    code?: string;
    count?: number;
    authStage?: 'send' | 'complete';
    status?: number;
  } = {},
) {
  console.info(JSON.stringify({ event, ...fields, at: new Date().toISOString() }));
}
export function errorResponse(e: unknown) {
  if (e instanceof ZodError)
    return json({ error: 'VALIDATION', message: e.issues.map((i) => i.message).join(' ') }, 400);
  const code = e instanceof Error ? e.message : 'INTERNAL_ERROR';
  const safe = /^[A-Z_]+$/.test(code) ? code : 'INTERNAL_ERROR';
  const status =
    safe === 'RATE_LIMIT'
      ? 429
      : safe === 'UNAUTHENTICATED'
        ? 401
        : ['FORBIDDEN', 'ORIGIN_REJECTED'].includes(safe)
          ? 403
          : safe.includes('NOT_FOUND')
            ? 404
            : code.startsWith('CONFIG_MISSING')
              ? 503
              : safe === 'INTERNAL_ERROR'
                ? 500
                : 409;
  log('request_failed', { code: code.startsWith('CONFIG_MISSING') ? 'CONFIG_MISSING' : safe });
  return json({ error: code.startsWith('CONFIG_MISSING') ? 'CONFIG_MISSING' : safe }, status);
}
export async function route(fn: () => Promise<Response>) {
  try {
    return await fn();
  } catch (e) {
    return errorResponse(e);
  }
}
