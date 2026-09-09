import { z } from 'zod';
export const jobInputSchema = z
  .object({
    model: z.enum(['draft', 'train', 'image', 'edit', 'video', 'motion']),
    characterId: z.uuid().optional(),
    versionId: z.uuid().optional(),
    sourceAssetId: z.uuid().optional(),
    motionAssetId: z.uuid().optional(),
    referenceAssetIds: z.array(z.uuid()).max(10).optional(),
    prompt: z.string().trim().max(1800).default(''),
    scene: z.string().max(400).default(''),
    outfit: z.string().max(250).default(''),
    pose: z.string().max(250).default(''),
    format: z.enum(['4:5', '1:1', '9:16', '16:9']).default('4:5'),
    count: z.number().int().min(1).max(4).default(1),
    duration: z.number().int().min(3).max(15).default(5),
    audio: z.boolean().default(false),
    orientation: z.enum(['image', 'video']).default('image'),
    steps: z.number().int().min(50).max(2000).default(100),
    resolution: z.union([z.literal(768), z.literal(1024)]).default(768),
    learningRate: z.number().min(0.000001).max(0.01).default(0.0005),
    loraScale: z.number().min(0).max(4).default(1),
    seed: z.number().int().min(0).max(2147483647).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.model !== 'train' && !v.prompt.trim())
      ctx.addIssue({ code: 'custom', message: 'Bitte einen Prompt eingeben.', path: ['prompt'] });
    if (['train', 'image', 'edit'].includes(v.model) && !v.characterId)
      ctx.addIssue({ code: 'custom', message: 'Charakter erforderlich.', path: ['characterId'] });
    if (['video', 'motion'].includes(v.model) && !v.sourceAssetId)
      ctx.addIssue({ code: 'custom', message: 'Startbild erforderlich.', path: ['sourceAssetId'] });
    if (v.model === 'motion' && !v.motionAssetId)
      ctx.addIssue({
        code: 'custom',
        message: 'Bewegungsreferenz erforderlich.',
        path: ['motionAssetId'],
      });
  });
export const characterSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    identity: z.string().max(1500),
    body: z.string().max(1000),
    confirmed: z.boolean(),
  })
  .strict();
export const referenceSchema = z
  .object({
    characterId: z.uuid(),
    assetId: z.uuid(),
    kind: z.enum(['face', 'profile', 'body', 'expression']),
    caption: z.string().trim().min(1).max(1500),
    approved: z.boolean(),
    cropMode: z.enum(['contain', 'cover']),
    cropConfirmed: z.boolean(),
  })
  .strict();
export function requireCondition(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}
export const dimensions = {
  '4:5': { width: 1024, height: 1280 },
  '1:1': { width: 1024, height: 1024 },
  '9:16': { width: 720, height: 1280 },
  '16:9': { width: 1280, height: 720 },
} as const;
