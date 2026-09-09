import { createHash } from 'node:crypto';
import { dimensions, requireCondition } from './validation';
import type { JobInput, ModelPrice } from './types';
export const CREDIT_MICROUSD = 10000; // Accounting conversion only; Stripe products define actual sale price.
export const PRICING_POLICY = '2026-09-05.v1';
export function inputHash(input: JobInput) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}
export function calculateQuote(
  input: JobInput,
  price: ModelPrice,
  options: { demo?: boolean; motionSeconds?: number; now?: number } = {},
) {
  requireCondition(price.model === input.model && price.enabled, 'MODEL_DISABLED');
  if (!options.demo)
    requireCondition(
      price.verified_at &&
        Math.abs((options.now ?? Date.now()) - Date.parse(price.verified_at)) < 7 * 86400000,
      'PRICE_REVIEW_REQUIRED',
    );
  const size = dimensions[input.format];
  const units =
    price.unit === 'step'
      ? input.steps
      : price.unit === 'second'
        ? input.model === 'motion'
          ? options.motionSeconds
          : input.duration
        : price.unit === 'megapixel'
          ? Math.ceil((size.width * size.height) / 1e6) * input.count
          : price.unit === 'image'
            ? input.count
            : 1;
  requireCondition(units && Number.isFinite(units) && units > 0, 'INVALID_BILLABLE_UNITS');
  const estimate = Math.ceil(
    units *
      price.unit_microusd *
      (input.audio ? price.audio_multiplier : 1) *
      (input.model === 'train' && input.resolution === 1024 ? price.resolution_multiplier : 1),
  );
  requireCondition(Number.isSafeInteger(estimate) && estimate > 0, 'INVALID_PRICE');
  // Reserve conservative provider allowance; do not describe it as an invoiced cost.
  const estimatedMicrousd = Math.ceil(estimate * 1.15);
  return {
    credits: Math.max(1, Math.ceil((estimatedMicrousd * 1.6) / CREDIT_MICROUSD)),
    estimatedMicrousd,
    pricingVersion: `${PRICING_POLICY}:${price.version}`,
    units,
  };
}
