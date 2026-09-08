import { requireCondition } from '@/domain/validation';
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024,
  MAX_VIDEO_BYTES = 100 * 1024 * 1024,
  MAX_WEIGHT_BYTES = 512 * 1024 * 1024;
export function detectMedia(bytes: Uint8Array): 'image' | 'video' {
  const b = Buffer.from(bytes);
  if (
    b.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ||
    b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP')
  )
    return 'image';
  if (b.toString('ascii', 4, 8) === 'ftyp') return 'video';
  throw new Error('UNSUPPORTED_MEDIA');
}
export function validateVideoMetadata(m: { width: number; height: number; duration: number }) {
  requireCondition(
    m.width >= 340 &&
      m.height >= 340 &&
      m.width <= 3850 &&
      m.height <= 3850 &&
      Number.isFinite(m.duration) &&
      m.duration >= 3 &&
      m.duration <= 30.05,
    'VIDEO_LIMITS',
  );
}
export function validateKlingImage(
  m: { width: number | null; height: number | null; bytes: number },
  motion = false,
) {
  const min = motion ? 340 : 300;
  requireCondition(
    m.width &&
      m.height &&
      m.width >= min &&
      m.height >= min &&
      m.width / m.height >= 0.4 &&
      m.width / m.height <= 2.5 &&
      m.bytes <= MAX_IMAGE_BYTES,
    'KLING_IMAGE_LIMITS',
  );
  if (motion) requireCondition(m.width <= 3850 && m.height <= 3850, 'KLING_IMAGE_LIMITS');
}
// Training archives are generated internally. No arbitrary ZIP, path, symlink or user filename is accepted.
export function safeArchiveEntry(name: string) {
  requireCondition(/^[0-9]{3}\.(jpg|txt)$/.test(name), 'UNSAFE_ARCHIVE_ENTRY');
  return name;
}
export function validateSafetensors(b: Buffer) {
  requireCondition(b.length > 8, 'INVALID_WEIGHTS');
  const n = Number(b.readBigUInt64LE(0));
  requireCondition(
    Number.isSafeInteger(n) && n > 0 && n < 16 * 1024 * 1024 && n < b.length - 8,
    'INVALID_WEIGHTS',
  );
  const header = JSON.parse(b.subarray(8, 8 + n).toString('utf8')) as Record<string, unknown>;
  requireCondition(
    Object.keys(header).some((k) => k !== '__metadata__'),
    'INVALID_WEIGHTS',
  );
}
