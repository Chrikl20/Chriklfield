import { createHash, createHmac, createPublicKey, timingSafeEqual, verify } from 'node:crypto';
import { z } from 'zod';
import { required } from '../config';
const keySchema = z.object({
  keys: z.array(z.object({ kty: z.literal('OKP'), crv: z.literal('Ed25519'), x: z.string() })),
});
type Key = z.infer<typeof keySchema>['keys'][number];
let cache: { at: number; keys: Key[] } | undefined;
export function webhookBinding(attemptId: string) {
  return createHmac('sha256', required('FAL_WEBHOOK_BINDING_SECRET'))
    .update(attemptId)
    .digest('hex');
}
export function verifyBinding(attemptId: string, binding: string) {
  const expected = Buffer.from(webhookBinding(attemptId));
  const actual = Buffer.from(binding);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function verifyFalSignature(
  headers: Headers,
  body: Buffer,
  keys: Key[],
  userId: string,
  now = Date.now(),
) {
  const request = headers.get('x-fal-webhook-request-id'),
    user = headers.get('x-fal-webhook-user-id'),
    stamp = headers.get('x-fal-webhook-timestamp'),
    signature = headers.get('x-fal-webhook-signature');
  if (
    !request ||
    user !== userId ||
    !stamp ||
    !/^\d+$/.test(stamp) ||
    Math.abs(now / 1000 - Number(stamp)) > 300 ||
    !signature ||
    !/^[0-9a-f]{128}$/i.test(signature)
  )
    return false;
  const message = Buffer.from(
    [request, user, stamp, createHash('sha256').update(body).digest('hex')].join('\n'),
  );
  return keys.some((key) => {
    try {
      return verify(
        null,
        message,
        createPublicKey({ key, format: 'jwk' }),
        Buffer.from(signature, 'hex'),
      );
    } catch {
      return false;
    }
  });
}
export async function falKeys(force = false) {
  if (force || !cache || Date.now() - cache.at > 3600000) {
    const res = await fetch('https://rest.fal.ai/.well-known/jwks.json', {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error('WEBHOOK_KEYS_UNAVAILABLE');
    cache = { at: Date.now(), keys: keySchema.parse(await res.json()).keys };
  }
  return cache.keys;
}
export async function verifyWebhook(headers: Headers, body: Buffer) {
  const user = required('FAL_WEBHOOK_USER_ID');
  if (verifyFalSignature(headers, body, await falKeys(), user)) return true;
  return verifyFalSignature(headers, body, await falKeys(true), user);
}
export const falEventSchema = z.object({
  request_id: z.string().min(1),
  status: z.enum(['OK', 'ERROR']),
  payload: z.unknown().optional(),
  error: z.string().optional(),
});
