import Stripe from 'stripe';
import { it, expect } from 'vitest';
it('accepts only correctly signed Stripe payloads with a recent timestamp', () => {
  const stripe = new Stripe('sk_test_local_fixture'),
    secret = 'whsec_local_fixture';
  const payload = JSON.stringify({
    id: 'evt_fixture',
    object: 'event',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_fixture' } },
  });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  expect(stripe.webhooks.constructEvent(payload, header, secret).id).toBe('evt_fixture');
  expect(() =>
    stripe.webhooks.constructEvent(payload.replace('cs_fixture', 'cs_tampered'), header, secret),
  ).toThrow();
  expect(() => stripe.webhooks.constructEvent(payload, header, 'whsec_wrong')).toThrow();
  const old = stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
    timestamp: Math.floor(Date.now() / 1000) - 600,
  });
  expect(() => stripe.webhooks.constructEvent(payload, old, secret)).toThrow();
});
