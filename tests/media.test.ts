import { it, expect } from 'vitest';
import sharp from 'sharp';
import { unzipSync, strFromU8 } from 'fflate';
import { randomUUID } from 'node:crypto';
import { buildTrainingArchive, normalizeMedia } from '@/server/media/files';
import { validateDownloadUrl, isPublicIp } from '@/server/media/download';
import { safeArchiveEntry, validateSafetensors } from '@/server/media/validation';
import type { Reference } from '@/domain/types';
it('rejects SSRF, credentials, confusing hosts, ports, private IPs and path escapes', () => {
  for (const url of [
    'http://v3.fal.media/files/x',
    'https://v3.fal.media.attacker.test/files/x',
    'https://user:pass@v3.fal.media/files/x',
    'https://127.0.0.1/files/x',
    'https://v3.fal.media:444/files/x',
    'https://v3.fal.media/files/../internal',
  ])
    expect(() => validateDownloadUrl(url, ['v3.fal.media'], ['/files/'])).toThrow();
  expect(
    validateDownloadUrl('https://v3.fal.media/files/result.jpg', ['v3.fal.media'], ['/files/'])
      .hostname,
  ).toBe('v3.fal.media');
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
  const n = await normalizeMedia(image);
  expect(n.mime).toBe('image/jpeg');
  expect(n.height).toBe(700);
  await expect(normalizeMedia(Buffer.from('<svg/>'))).rejects.toThrow('UNSUPPORTED_MEDIA');
  const tiny = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#abc' } })
    .png()
    .toBuffer();
  await expect(normalizeMedia(tiny)).rejects.toThrow('IMAGE_LIMITS');
});
it('creates bounded square training archives with matching captions and rejects unapproved references', async () => {
  const image = await sharp({
    create: { width: 500, height: 1000, channels: 3, background: '#aabbcc' },
  })
    .jpeg()
    .toBuffer();
  const refs: Reference[] = Array.from({ length: 8 }, (_, i) => ({
    id: randomUUID(),
    character_id: randomUUID(),
    asset_id: randomUUID(),
    kind: i === 0 ? 'body' : 'face',
    caption: `chrNova image ${i}`,
    approved: true,
    generated: true,
    crop_mode: 'contain',
    crop_confirmed: true,
  }));
  const archive = await buildTrainingArchive(refs, async () => image, 768, 'chrtest'),
    entries = unzipSync(archive);
  expect(Object.keys(entries)).toHaveLength(16);
  expect(strFromU8(entries['000.txt'])).toBe('chrtest. chrNova image 0');
  const m = await sharp(entries['000.jpg']).metadata();
  expect([m.width, m.height]).toEqual([768, 768]);
  refs[0].approved = false;
  await expect(buildTrainingArchive(refs, async () => image, 768, 'chrtest')).rejects.toThrow(
    'UNAPPROVED_REFERENCE',
  );
  expect(() => safeArchiveEntry('../weights.pkl')).toThrow('UNSAFE_ARCHIVE_ENTRY');
  expect(() => validateSafetensors(Buffer.from('pickle-not-weights'))).toThrow('INVALID_WEIGHTS');
});
