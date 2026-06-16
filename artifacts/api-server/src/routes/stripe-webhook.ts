import { type Request, type Response } from "express";
import { stripe } from "../services/stripe";
import { db } from "@workspace/db";
import { excursionBookingsTable } from "@workspace/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { logger } from "../lib/logger";

export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe) {
    res.status(503).send("Stripe not configured");
    return;
  }
  if (!webhookSecret) {
    logger.error("STRIPE_WEBHOOK_SECRET not set");
    res.status(500).send("Webhook secret not configured");
    return;
  }
  if (!sig) {
    res.status(400).send("Missing stripe-signature header");
    return;
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig, webhookSecret);
  } catch (err) {
    logger.warn({ err }, "Stripe webhook signature verification failed");
    res.status(400).send("Invalid signature");
    return;
  }

  try {
    // Fallback for setup_intent.succeeded in case the frontend card-confirmed endpoint was not reached
    if (event.type === "setup_intent.succeeded") {
      const setupIntent = event.data.object;
      const bookingId = setupIntent.metadata?.bookingId;
      if (!bookingId) {
        res.json({ received: true });
        return;
      }

      const paymentMethodId = typeof setupIntent.payment_method === "string"
        ? setupIntent.payment_method
        : setupIntent.payment_method?.id ?? null;

      if (!paymentMethodId) {
        res.json({ received: true });
        return;
      }

      const [booking] = await db
        .select({
          id: excursionBookingsTable.id,
          paymentStatus: excursionBookingsTable.paymentStatus,
        })
        .from(excursionBookingsTable)
        .where(
          and(
            eq(excursionBookingsTable.id, bookingId),
            isNull(excursionBookingsTable.cancelledAt),
          ),
        )
        .limit(1);

      // Only update if not already confirmed (card-confirmed endpoint handles the primary path)
      if (booking && booking.paymentStatus === "pending_card") {
        await db
          .update(excursionBookingsTable)
          .set({
            stripePaymentMethodId: paymentMethodId,
            paymentStatus: "card_saved",
            updatedAt: new Date(),
          })
          .where(eq(excursionBookingsTable.id, bookingId));

        logger.info({ bookingId }, "Booking updated to card_saved via webhook fallback");
      }
    }

    res.json({ received: true });
  } catch (err) {
    logger.error({ err, eventType: event.type }, "Error processing Stripe webhook event");
    res.status(500).json({ error: "Webhook processing failed" });
  }
}
