import type {
  Actor,
  Asset,
  CharacterVersion,
  JobInput,
  ModelPrice,
  Quote,
  Reference,
} from '@/domain/types';
import { assertLoraCompatible } from '@/domain/models';
import { calculateQuote, inputHash } from '@/domain/pricing';
import { requireCondition } from '@/domain/validation';
import { adminClient } from '@/server/database';
import { assertActor } from './access';
import { check, ownedAsset, ownedCharacter } from './repository';
import { assertGenerationEnabled } from './config';
import { assembledPrompt } from './providers/fal';
import { validateKlingImage, validateVideoMetadata } from './media/validation';
export interface JobContext {
  identity: string;
  body: string;
  references: Reference[];
  assets: Asset[];
  triggerWord?: string;
  weightsAssetId?: string;
}
export async function createQuote(actor: Actor, input: JobInput): Promise<Quote> {
  await assertActor(actor);
  assertGenerationEnabled();
  const db = adminClient();
  const context: JobContext = { identity: '', body: '', references: [], assets: [] };
  const assets = new Map<string, Asset>();
  const add = async (id: string) => {
    const a = await ownedAsset(actor, id);
    assets.set(id, a);
    return a;
  };
  if (input.characterId) {
    const c = await ownedCharacter(actor, input.characterId);
    context.identity = c.identity;
    context.body = c.body;
    if (['train', 'image', 'edit'].includes(input.model))
      requireCondition(c.confirmed, 'IDENTITY_NOT_CONFIRMED');
    if (input.model === 'train' || input.model === 'edit') {
      const refs = check(
        await db
          .from('character_references')
          .select('*')
          .eq('workspace_id', actor.workspaceId)
          .eq('character_id', c.id)
          .eq('approved', true),
      ) as Reference[];
      if (input.model === 'train') {
        requireCondition(
          refs.length >= 8 && refs.length <= 80 && refs.every((r) => r.crop_confirmed),
          'NEED_EIGHT_APPROVED_REFERENCES',
        );
        requireCondition(
          ['face', 'profile', 'body', 'expression'].every((kind) =>
            refs.some((r) => r.kind === kind),
          ),
          'REFERENCE_VIEWS_MISSING',
        );
        context.references = refs;
      } else {
        context.references = refs
          .filter((r) => !input.referenceAssetIds || input.referenceAssetIds.includes(r.asset_id))
          .slice(0, 10);
        requireCondition(context.references.length > 0, 'APPROVED_REFERENCES_REQUIRED');
      }
      for (const ref of context.references) {
        const a = await add(ref.asset_id);
        requireCondition(a.kind === 'image', 'REFERENCE_MUST_BE_IMAGE');
      }
    }
    if (input.model === 'image') {
      let query = db
        .from('character_versions')
        .select('*')
        .eq('workspace_id', actor.workspaceId)
        .eq('character_id', c.id)
        .eq('status', 'ready');
      if (input.versionId) query = query.eq('id', input.versionId);
      const v = check(
        await query.order('version', { ascending: false }).limit(1).maybeSingle(),
      ) as CharacterVersion | null;
      requireCondition(v?.weights_asset_id, 'TRAINING_REQUIRED');
      assertLoraCompatible(input.model, v.base_model);
      input = { ...input, versionId: v.id };
      context.weightsAssetId = v.weights_asset_id;
      context.triggerWord = v.trigger_word;
      // Inference uses the trained identity snapshot rather than mutable character fields.
      context.identity = v.identity_snapshot;
      context.body = v.body_snapshot;
      await add(v.weights_asset_id);
    }
  }
  if (input.sourceAssetId) {
    const a = await add(input.sourceAssetId);
    requireCondition(a.kind === 'image', 'SOURCE_MUST_BE_IMAGE');
    if (['video', 'motion'].includes(input.model)) validateKlingImage(a, input.model === 'motion');
  }
  let motionSeconds: number | undefined;
  if (input.model === 'motion') {
    const video = await add(input.motionAssetId!);
    requireCondition(
      video.kind === 'video' && video.width && video.height && video.duration,
      'MOTION_MUST_BE_VIDEO',
    );
    validateVideoMetadata({ width: video.width, height: video.height, duration: video.duration });
    requireCondition(
      video.duration <= (input.orientation === 'image' ? 10.05 : 30.05),
      'MOTION_DURATION_LIMIT',
    );
    motionSeconds = Math.ceil(video.duration);
  }
  context.assets = [...assets.values()];
  if (['draft', 'image', 'edit'].includes(input.model))
    requireCondition(assembledPrompt(input, context).length <= 5000, 'PROMPT_TOO_LONG');
  const price = check(
    await db.from('model_prices').select('*').eq('model', input.model).single(),
  ) as ModelPrice;
  const p = calculateQuote(input, price, { motionSeconds });
  const q = check(
    await db
      .from('quotes')
      .insert({
        workspace_id: actor.workspaceId,
        user_id: actor.userId,
        input,
        context,
        input_hash: inputHash(input),
        credits: p.credits,
        estimated_microusd: p.estimatedMicrousd,
        pricing_version: p.pricingVersion,
        model: input.model,
        expires_at: new Date(Date.now() + 600000).toISOString(),
      })
      .select('*')
      .single(),
  );
  const { context: _, ...safe } = q;
  void _;
  return safe as Quote;
}
