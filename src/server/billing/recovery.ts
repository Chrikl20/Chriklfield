import { adminClient } from '../database';
import { check } from '../repository';
import { processStripeEvent, stripe } from './stripe';
export async function recoverPayments() {
  const db = adminClient();
  const events = check(
    await db
      .from('webhook_inbox')
      .select('event_id,recovery_attempts')
      .eq('provider', 'stripe')
      .is('processed_at', null)
      .lt('created_at', new Date(Date.now() - 60000).toISOString())
      .lt('recovery_attempts', 10)
      .order('created_at')
      .limit(20),
  );
  for (const row of events) {
    check(
      await db
        .from('webhook_inbox')
        .update({ recovery_attempts: row.recovery_attempts + 1 })
        .eq('provider', 'stripe')
        .eq('event_id', row.event_id),
    );
    try {
      // Only previously signature-verified inbox IDs are replayed. Re-fetch from Stripe.
      const event = await stripe().events.retrieve(row.event_id);
      if (event.livemode && process.env.ALLOW_STRIPE_LIVE !== 'true')
        throw new Error('STRIPE_LIVE_DISABLED');
      await processStripeEvent(event);
      check(
        await db
          .from('webhook_inbox')
          .update({ processed_at: new Date().toISOString() })
          .eq('provider', 'stripe')
          .eq('event_id', row.event_id),
      );
    } catch {
      check(
        await db.from('alerts').upsert(
          {
            code: 'PAYMENT_RECONCILIATION_REQUIRED',
            event_key: `payment:${row.event_id}`,
            details: { eventId: row.event_id },
          },
          { onConflict: 'event_key' },
        ),
      );
    }
  }
  return { checked: events.length };
}
