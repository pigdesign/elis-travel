import { type Request, type Response } from "express";
import { stripe } from "../services/stripe";
import { logger } from "../lib/logger";
import {
  applySuccessfulCardPayment,
  markCancelledCardPaymentAttempt,
  markFailedCardPaymentAttempt,
} from "../services/excursion-payments";
import { reconcileStripeRefund } from "../services/booking-refunds";
import {
  reconcileBookingCancellation,
  reconcileCancellationForRefund,
} from "../services/booking-cancellations";
import {
  applySuccessfulCardSetup,
  CardSetupVerificationError,
} from "../services/excursion-card-setup";
import { dispatchCardSavedEmailV2 } from "../services/excursion-booking-emails-v2";
import { minimizeSavedCardDataForBooking } from "../services/excursion-confirmation";

export async function stripeWebhookHandler(
  req: Request,
  res: Response,
): Promise<void> {
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
    event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      sig,
      webhookSecret,
    );
  } catch (err) {
    logger.warn({ err }, "Stripe webhook signature verification failed");
    res.status(400).send("Invalid signature");
    return;
  }

  try {
    // Gite v2: addebito immediato — il webhook è la fonte primaria di verità.
    // applySuccessfulCardPayment è idempotente rispetto alla conferma in pagina.
    if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object;
      if (
        intent.metadata?.source === "elis-travel" ||
        intent.metadata?.bookingId
      ) {
        const applied = await applySuccessfulCardPayment(intent);
        if (applied) {
          await reconcileBookingCancellation(applied.bookingId);
          if (!applied.refundInitiated) {
            await minimizeSavedCardDataForBooking(applied.bookingId);
          }
        }
        if (applied?.refundInitiated) {
          logger.warn(
            {
              bookingId: applied.bookingId,
              type: applied.requestType,
              refundStatus: applied.refundStatus,
            },
            "Pagamento arrivato dopo il rilascio posti: rimborso avviato",
          );
        } else if (applied && !applied.alreadyApplied) {
          logger.info(
            { bookingId: applied.bookingId, type: applied.requestType },
            "Pagamento carta applicato via webhook",
          );
        }
      }
      res.json({ received: true });
      return;
    }

    if (event.type === "payment_intent.payment_failed") {
      const intent = event.data.object;
      const bookingId = intent.metadata?.bookingId;
      await markFailedCardPaymentAttempt(intent);
      if (bookingId) await reconcileBookingCancellation(bookingId);
      if (bookingId) {
        logger.warn(
          {
            bookingId,
            paymentIntentId: intent.id,
            lastError: intent.last_payment_error?.code,
          },
          "Pagamento carta fallito (l'utente può riprovare in pagina)",
        );
      }
      res.json({ received: true });
      return;
    }

    if (event.type === "payment_intent.canceled") {
      const intent = event.data.object;
      await markCancelledCardPaymentAttempt(intent);
      if (intent.metadata?.bookingId) {
        await reconcileBookingCancellation(intent.metadata.bookingId);
      }
      logger.info(
        {
          bookingId: intent.metadata?.bookingId,
          paymentIntentId: intent.id,
          reason: intent.cancellation_reason,
        },
        "Tentativo carta cancellato",
      );
      res.json({ received: true });
      return;
    }

    if (
      event.type === "refund.created" ||
      event.type === "refund.updated" ||
      event.type === "refund.failed"
    ) {
      const refund = event.data.object;
      const reconciled = await reconcileStripeRefund(refund);
      if (reconciled) {
        await reconcileCancellationForRefund(reconciled.refundId);
        logger.info(
          {
            refundId: reconciled.refundId,
            stripeRefundId: reconciled.stripeRefundId,
            status: reconciled.status,
          },
          "Stato rimborso Stripe riconciliato",
        );
      }
      res.json({ received: true });
      return;
    }

    // SetupIntent: stesso percorso verificato dell'endpoint browser. Il webhook
    // non si fida del solo bookingId nei metadata.
    if (event.type === "setup_intent.succeeded") {
      const setupIntent = event.data.object;
      if (
        setupIntent.metadata?.source === "elis-travel" &&
        setupIntent.metadata?.flow === "save_for_confirmation"
      ) {
        try {
          const applied = await applySuccessfulCardSetup(setupIntent);
          await dispatchCardSavedEmailV2(applied.bookingId);
          if (!applied.alreadyApplied) {
            logger.info(
              { bookingId: applied.bookingId },
              "Carta salvata applicata via webhook SetupIntent",
            );
          }
        } catch (error) {
          if (!(error instanceof CardSetupVerificationError)) throw error;
          logger.warn(
            {
              err: error,
              setupIntentId: setupIntent.id,
              verificationCode: error.code,
            },
            "SetupIntent ignorato: verifiche di associazione fallite",
          );
        }
      }
      res.json({ received: true });
      return;
    }

    res.json({ received: true });
  } catch (err) {
    logger.error(
      { err, eventType: event.type },
      "Error processing Stripe webhook event",
    );
    res.status(500).json({ error: "Webhook processing failed" });
  }
}
