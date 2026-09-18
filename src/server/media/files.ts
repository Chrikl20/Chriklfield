import sharp from 'sharp';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { detectMedia, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, validateVideoMetadata } from './validation';
import { requireCondition } from '@/domain/validation';
const exec = promisify(execFile);
export async function normalizeMedia(bytes: Buffer) {
  const kind = detectMedia(bytes);
  requireCondition(
    bytes.length <= (kind === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES),
    'FILE_TOO_LARGE',
  );
  if (kind === 'image') {
    const pipeline = sharp(bytes, { limitInputPixels: 40_000_000, animated: false }).rotate();
    const meta = await pipeline.metadata();
    requireCondition(
      meta.width && meta.height && meta.width >= 300 && meta.height >= 300 && !meta.pages,
      'IMAGE_LIMITS',
    );
    const { data, info } = await pipeline
      .jpeg({ quality: 93 })
      .toBuffer({ resolveWithObject: true });
    return {
      bytes: data,
      mime: 'image/jpeg',
      kind,
      extension: 'jpg',
      width: info.width,
      height: info.height,
      duration: null,
    };
  }
  const dir = await mkdtemp(path.join(tmpdir(), 'chriklfield-'));
  try {
    const input = path.join(dir, 'input.mp4'),
      output = path.join(dir, 'output.mp4');
    await writeFile(input, bytes);
    const { stdout } = await exec(
      process.env.FFPROBE_PATH || 'ffprobe',
      [
        '-v',
        'error',
        '-protocol_whitelist',
        'file,pipe',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height:format=duration',
        '-of',
        'json',
        input,
      ],
      { timeout: 20000, maxBuffer: 100000 },
    );
    const m = z
      .object({
        streams: z.array(z.object({ width: z.number(), height: z.number() })).min(1),
        format: z.object({ duration: z.string() }),
      })
      .parse(JSON.parse(stdout));
    const metadata = { ...m.streams[0], duration: Number(m.format.duration) };
    validateVideoMetadata(metadata);
    await exec(
      process.env.FFMPEG_PATH || 'ffmpeg',
      [
        '-nostdin',
        '-v',
        'error',
        '-protocol_whitelist',
        'file,pipe',
        '-i',
        input,
        '-map',
        '0:v:0',
        '-map',
        '0:a:0?',
        '-c',
        'copy',
        '-map_metadata',
        '-1',
        '-movflags',
        '+faststart',
        '-y',
        output,
      ],
      { timeout: 30000, maxBuffer: 100000 },
    );
    return {
      bytes: await readFile(output),
      kind,
      mime: 'video/mp4',
      extension: 'mp4',
      ...metadata,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
