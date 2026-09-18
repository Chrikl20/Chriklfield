import { it, expect } from 'vitest';
import sharp from 'sharp';
import { normalizeMedia } from '@/server/media/files';
import { validateDownloadUrl, isPublicIp } from '@/server/media/download';

it('rejects SSRF, credentials, confusing hosts, ports, private IPs and path escapes', () => {
  const host = 'storage.googleapis.com';
  for (const url of [
    'http://storage.googleapis.com/results/x',
    'https://storage.googleapis.com.attacker.test/results/x',
    'https://user:pass@storage.googleapis.com/results/x',
    'https://127.0.0.1/results/x',
    'https://storage.googleapis.com:444/results/x',
  ])
    expect(() => validateDownloadUrl(url, [host], ['/results/'])).toThrow();

  expect(
    validateDownloadUrl(
      'https://storage.googleapis.com/results/output.jpg',
      [host],
      ['/results/'],
    ).hostname,
  ).toBe(host);

  for (const ip of [
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '100.64.0.1',
    '::1',
    '::ffff:127.0.0.1',
  ])
    expect(isPublicIp(ip)).toBe(false);
});

it('decodes and re-encodes valid images; rejects SVG and tiny image uploads', async () => {
  const image = await sharp({
    create: { width: 512, height: 700, channels: 3, background: '#abc' },
  })
    .png()
    .toBuffer();

  const normalized = await normalizeMedia(image);
  expect(normalized.mime).toBe('image/jpeg');
  expect(normalized.height).toBe(700);

  await expect(normalizeMedia(Buffer.from('<svg/>'))).rejects.toThrow('UNSUPPORTED_MEDIA');

  const tiny = await sharp({
    create: { width: 2, height: 2, channels: 3, background: '#abc' },
  })
    .png()
    .toBuffer();
  await expect(normalizeMedia(tiny)).rejects.toThrow('IMAGE_LIMITS');
});
