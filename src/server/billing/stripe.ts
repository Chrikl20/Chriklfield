import Stripe from 'stripe';
import { z } from 'zod';
import { appUrl, required } from '../config';
import { adminClient } from '../database';
import { check } from '../repository';
import { assertActor } from '../access';
import type { Actor } from '@/domain/types';
export function stripe() {
  const key = required('STRIPE_SECRET_KEY');
  if (key.startsWith('sk_live_') && process.env.ALLOW_STRIPE_LIVE !== 'true')
    throw new Error('STRIPE_LIVE_DISABLED');
  return new Stripe(key, { maxNetworkRetries: 2, timeout: 15000 });
}
export function products() {
  return {
    credits: { id: process.env.STRIPE_PRICE_CREDITS_1000, credits: 1000, mode: 'payment' as const },
    creator: {
      id: process.env.STRIPE_PRICE_CREATOR_MONTHLY,
      credits: 3000,
      mode: 'subscription' as const,
    },
  };
}
export async function customer(actor: Actor) {
  await assertActor(actor);
  const db = adminClient();
  let w = check(
    await db
      .from('workspaces')
      .select('stripe_customer_id,owner_id')
      .eq('id', actor.workspaceId)
      .single(),
  );
  if (w.owner_id !== actor.userId) throw new Error('FORBIDDEN');
  if (!w.stripe_customer_id) {
    const c = await stripe().customers.create(
      { metadata: { workspace_id: actor.workspaceId } },
      { idempotencyKey: `customer:${actor.workspaceId}` },
    );
    check(
      await db
        .from('workspaces')
        .update({ stripe_customer_id: c.id })
        .eq('id', actor.workspaceId)
        .is('stripe_customer_id', null),
    );
    w = check(
      await db.from('workspaces').select('stripe_customer_id').eq('id', actor.workspaceId).single(),
    );
  }
  return w.stripe_customer_id as string;
}
export async function checkout(actor: Actor, product: 'credits' | 'creator', key: string) {
  if (process.env.ENABLE_STRIPE_CHECKOUT !== 'true') throw new Error('CHECKOUT_DISABLED');
  const p = products()[product];
  if (!p.id) throw new Error('PRICE_NOT_CONFIGURED');
  const client = stripe();
  const price = await client.prices.retrieve(p.id);
  if (!price.active || !price.unit_amount) throw new Error('PRICE_NOT_CONFIGURED');
  const session = await client.checkout.sessions.create(
    {
      mode: p.mode,
      customer: await customer(actor),
      line_items: [{ price: p.id, quantity: 1 }],
      success_url: `${appUrl()}/billing?checkout=returned`,
      cancel_url: `${appUrl()}/billing`,
      client_reference_id: actor.workspaceId,
      metadata: { workspace_id: actor.workspaceId },
      ...(p.mode === 'subscription'
        ? { subscription_data: { metadata: { workspace_id: actor.workspaceId } } }
        : { payment_intent_data: { metadata: { workspace_id: actor.workspaceId } } }),
    },
    { idempotencyKey: `checkout:${actor.workspaceId}:${product}:${key}` },
  );
  return { url: session.url };
}
export async function portal(actor: Actor) {
  return stripe().billingPortal.sessions.create({
    customer: await customer(actor),
    return_url: `${appUrl()}/billing`,
  });
}
const stripeId = z
  .union([z.string(), z.object({ id: z.string() })])
  .transform((v) => (typeof v === 'string' ? v : v.id));
async function workspaceForCustomer(id: string) {
  const w = check(
    await adminClient().from('workspaces').select('id').eq('stripe_customer_id', id).maybeSingle(),
  );
  if (!w) throw new Error('PAYMENT_WORKSPACE_NOT_FOUND');
  return w.id as string;
}
export async function processStripeEvent(event: Stripe.Event) {
  const db = adminClient(),
    client = stripe();
  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded'
  ) {
    const session = await client.checkout.sessions.retrieve(event.data.object.id, {
      expand: ['line_items'],
    });
    // Subscription credits ONLY come from invoice.paid, never from Checkout as well.
    if (session.mode !== 'payment' || session.payment_status !== 'paid') return;
    const sku = products().credits;
    const items = session.line_items?.data || [];
    if (
      items.length !== 1 ||
      items[0].price?.id !== sku.id ||
      items[0].quantity !== 1 ||
      !session.amount_total ||
      session.amount_total <= 0
    )
      throw new Error('PAYMENT_PRODUCT_MISMATCH');
    const intent = await client.paymentIntents.retrieve(stripeId.parse(session.payment_intent));
    if (intent.status !== 'succeeded') throw new Error('PAYMENT_NOT_SETTLED');
    if (
      stripeId.parse(intent.customer) !== stripeId.parse(session.customer) ||
      intent.amount_received !== session.amount_total ||
      intent.currency !== session.currency
    )
      throw new Error('PAYMENT_AMOUNT_MISMATCH');
    const w = await workspaceForCustomer(stripeId.parse(session.customer));
    if (session.client_reference_id !== w) throw new Error('PAYMENT_WORKSPACE_MISMATCH');
    const charge = stripeId.parse(intent.latest_charge);
    check(
      await db.rpc('apply_payment', {
        p_event: event.id,
        p_source: session.id,
        p_workspace: w,
        p_intent: intent.id,
        p_charge: charge,
        p_amount: session.amount_total,
        p_currency: session.currency,
        p_credits: sku.credits,
      }),
    );
    return;
  }
  if (event.type === 'invoice.paid') {
    const invoice = await client.invoices.retrieve(event.data.object.id);
    if (
      invoice.status !== 'paid' ||
      invoice.amount_paid <= 0 ||
      !['subscription_create', 'subscription_cycle'].includes(invoice.billing_reason || '')
    )
      return;
    const sku = products().creator;
    const line = invoice.lines.data.find((l) => l.pricing?.price_details?.price === sku.id);
    if (invoice.lines.has_more || invoice.lines.data.length !== 1 || !line || line.quantity !== 1)
      throw new Error('PAYMENT_PRODUCT_MISMATCH');
    const w = await workspaceForCustomer(stripeId.parse(invoice.customer));
    // New Stripe API exposes invoice payments separately from the old invoice.payment_intent.
    const payments = await client.invoicePayments.list({
      invoice: invoice.id,
      status: 'paid',
      limit: 10,
    });
    const payment = payments.data[0];
    if (
      payments.has_more ||
      payments.data.length !== 1 ||
      payment.amount_paid !== invoice.amount_paid
    )
      throw new Error('INVOICE_PAYMENT_REVIEW_REQUIRED');
    if (!payment?.payment.payment_intent) throw new Error('INVOICE_PAYMENT_NOT_RESOLVED');
    const intent = await client.paymentIntents.retrieve(
      stripeId.parse(payment.payment.payment_intent),
    );
    if (intent.status !== 'succeeded') throw new Error('PAYMENT_NOT_SETTLED');
    if (
      stripeId.parse(intent.customer) !== stripeId.parse(invoice.customer) ||
      intent.amount_received !== invoice.amount_paid ||
      intent.currency !== invoice.currency
    )
      throw new Error('PAYMENT_AMOUNT_MISMATCH');
    check(
      await db.rpc('apply_payment', {
        p_event: event.id,
        p_source: invoice.id,
        p_workspace: w,
        p_intent: intent.id,
        p_charge: stripeId.parse(intent.latest_charge),
        p_amount: invoice.amount_paid,
        p_currency: invoice.currency,
        p_credits: sku.credits,
      }),
    );
    check(await db.from('workspaces').update({ plan: 'Creator' }).eq('id', w));
    return;
  }
  if (event.type === 'charge.refunded') {
    // Fetch authoritative cumulative total so out-of-order partial refunds cannot double debit.
    const charge = await client.charges.retrieve(event.data.object.id);
    check(
      await db.rpc('apply_refund', {
        p_event: event.id,
        p_charge: charge.id,
        p_cumulative: charge.amount_refunded,
      }),
    );
    return;
  }
  if (
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    const sub = await client.subscriptions.retrieve(event.data.object.id);
    const w = await workspaceForCustomer(stripeId.parse(sub.customer));
    check(
      await db
        .from('workspaces')
        .update({ plan: ['active', 'trialing'].includes(sub.status) ? 'Creator' : 'Free' })
        .eq('id', w),
    );
  }
}
