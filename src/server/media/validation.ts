import { requireCondition } from '@/domain/validation';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

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

export function validateGenerationImage(
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
    'GENERATION_IMAGE_LIMITS',
  );
  if (motion)
    requireCondition(m.width <= 3850 && m.height <= 3850, 'GENERATION_IMAGE_LIMITS');
}
