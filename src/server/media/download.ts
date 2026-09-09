import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { requireCondition } from '@/domain/validation';
export function isPublicIp(ip: string) {
  if (isIP(ip) === 4) {
    const p = ip.split('.').map(Number);
    return !(
      p[0] === 0 ||
      p[0] === 10 ||
      p[0] === 127 ||
      p[0] >= 224 ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && (p[1] === 168 || p[1] === 0)) ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
      (p[0] === 198 && (p[1] === 18 || p[1] === 19))
    );
  }
  // Use public IPv4 endpoints only. Reject IPv6/mapped/link-local rather than guessing.
  return false;
}
export function validateDownloadUrl(value: string, hosts: string[], prefixes: string[]) {
  const u = new URL(value);
  requireCondition(
    u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      (!u.port || u.port === '443') &&
      hosts.includes(u.hostname.toLowerCase()) &&
      !isIP(u.hostname),
    'DOWNLOAD_TARGET_REJECTED',
  );
  requireCondition(
    prefixes.some((p) => decodeURIComponent(u.pathname).startsWith(p)),
    'DOWNLOAD_PATH_REJECTED',
  );
  return u;
}
export async function downloadToFile(
  value: string,
  destination: string,
  maxBytes: number,
  redirects = 0,
): Promise<void> {
  const hosts = (
    process.env.MEDIA_DOWNLOAD_HOSTS ||
    'v3.fal.media,v3b.fal.media,v3c.fal.media,storage.googleapis.com'
  ).split(',');
  const prefixes = (process.env.MEDIA_DOWNLOAD_PATH_PREFIXES || '/files/,/falserverless/').split(
    ',',
  );
  const url = validateDownloadUrl(value, hosts, prefixes);
  requireCondition(redirects <= 3, 'TOO_MANY_REDIRECTS');
  const addresses = await lookup(url.hostname, { all: true, family: 4 });
  requireCondition(
    addresses.length && addresses.every((a) => isPublicIp(a.address)),
    'PRIVATE_DOWNLOAD_IP',
  );
  const pinned = addresses[0];
  const response = await new Promise<import('node:http').IncomingMessage>((resolve, reject) => {
    const request = https.get(
      url,
      {
        lookup: (_hostname, _options, callback) => callback(null, pinned.address, 4),
        timeout: 60000,
      },
      resolve,
    );
    request.on('error', reject);
    request.on('timeout', () => request.destroy(new Error('DOWNLOAD_TIMEOUT')));
  });
  if (response.statusCode && [301, 302, 303, 307, 308].includes(response.statusCode)) {
    const loc = response.headers.location;
    response.destroy();
    requireCondition(loc, 'INVALID_REDIRECT');
    return downloadToFile(new URL(loc, url).toString(), destination, maxBytes, redirects + 1);
  }
  requireCondition(response.statusCode === 200, 'DOWNLOAD_FAILED');
  if (Number(response.headers['content-length'] || 0) > maxBytes) {
    response.destroy();
    throw new Error('RESULT_TOO_LARGE');
  }
  let bytes = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      bytes += chunk.length;
      if (bytes > maxBytes) cb(new Error('RESULT_TOO_LARGE'));
      else cb(null, chunk);
    },
  });
  await pipeline(response, limiter, createWriteStream(destination, { flags: 'wx' }));
  requireCondition(bytes > 0, 'EMPTY_RESULT');
}
