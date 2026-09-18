import { z } from 'zod';

export const studioDraftSchema = z.object({
  model: z.enum(['image', 'draft', 'edit', 'video', 'motion']),
  scene: z.string().max(400),
  outfit: z.string().max(250),
  pose: z.string().max(250),
  prompt: z.string().max(1800),
  format: z.enum(['4:5', '1:1', '9:16', '16:9']),
  count: z.number().int().min(1).max(4),
  duration: z.number().int().min(3).max(15),
  audio: z.boolean(),
});

export function readStudioDraft(value: string | null, now = Date.now()) {
  try {
    const envelope = z
      .object({
        expires: z
          .number()
          .min(now)
          .max(now + 60 * 60 * 1000),
        value: studioDraftSchema,
      })
      .parse(JSON.parse(value || 'null'));
    return envelope.value;
  } catch {
    return null;
  }
}
