import type Stripe from "stripe";
import { db } from "@workspace/db";
import {
  excursionBookingsTable,
  paymentRequestsTable,
} from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

// ---------------------------------------------------------------------------
// Applicazione pagamenti Gite v2 — logica idempotente condivisa tra webhook
// Stripe e conferma in pagina: un PaymentIntent riuscito viene applicato una
// sola volta anche se arriva da entrambe le strade o l'utente ricarica.
// ---------------------------------------------------------------------------

export type AppliedPayment = {
  bookingId: string;
  requestType: string;
  alreadyApplied: boolean;
};

// Stato prenotazione dopo un pagamento riuscito, in base al tipo di richiesta
// e a quanto risulta pagato rispetto al totale.
export function paymentStatusAfterPayment(
  requestType: string,
  amountPaidCents: number,
  totalAmountCents: number | null,
): string {
  if (totalAmountCents !== null && amountPaidCents >= totalAmountCents) return "paid";
  if (requestType === "deposit") return "deposit";
  return "paid";
}

export async function applySuccessfulCardPayment(
  paymentIntent: Stripe.PaymentIntent,
): Promise<AppliedPayment | null> {
  const requestId = paymentIntent.metadata?.paymentRequestId;
  const bookingId = paymentIntent.metadata?.bookingId;

  const [request] = requestId
    ? await db
        .select()
        .from(paymentRequestsTable)
        .where(eq(paymentRequestsTable.id, requestId))
        .limit(1)
    : await db
        .select()
        .from(paymentRequestsTable)
        .where(eq(paymentRequestsTable.stripePaymentIntentId, paymentIntent.id))
        .limit(1);

  if (!request) {
    logger.warn(
      { paymentIntentId: paymentIntent.id, bookingId },
      "PaymentIntent riuscito senza payment_request corrispondente",
    );
    return null;
  }
  if (request.status === "paid") {
    return { bookingId: request.bookingId, requestType: request.type, alreadyApplied: true };
  }

  const paidAmount = paymentIntent.amount_received ?? paymentIntent.amount;

  return await db.transaction(async (tx) => {
    // Guardia idempotente: solo la transizione pending→paid applica gli importi
    const updatedRequests = await tx
      .update(paymentRequestsTable)
      .set({
        status: "paid",
        paidAt: new Date(),
        transactionReference: paymentIntent.id,
        stripePaymentIntentId: paymentIntent.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(paymentRequestsTable.id, request.id),
          eq(paymentRequestsTable.status, "pending"),
        ),
      )
      .returning();
    if (updatedRequests.length === 0) {
      return { bookingId: request.bookingId, requestType: request.type, alreadyApplied: true };
    }

    const [booking] = await tx
      .update(excursionBookingsTable)
      .set({
        amountPaidCents: sql`${excursionBookingsTable.amountPaidCents} + ${paidAmount}`,
        updatedAt: new Date(),
      })
      .where(eq(excursionBookingsTable.id, request.bookingId))
      .returning();

    if (booking) {
      await tx
        .update(excursionBookingsTable)
        .set({
          paymentStatus: paymentStatusAfterPayment(
            request.type,
            booking.amountPaidCents,
            booking.totalAmountCents,
          ),
          updatedAt: new Date(),
        })
        .where(eq(excursionBookingsTable.id, booking.id));
    }

    return { bookingId: request.bookingId, requestType: request.type, alreadyApplied: false };
  });
}

// Conferma manuale admin (bonifico ricevuto, pagamento in ufficio, ecc.).
export async function applyManualPayment(opts: {
  paymentRequestId: string;
  transactionReference?: string | null;
}): Promise<AppliedPayment | null> {
  const [request] = await db
    .select()
    .from(paymentRequestsTable)
    .where(eq(paymentRequestsTable.id, opts.paymentRequestId))
    .limit(1);
  if (!request) return null;
  if (request.status === "paid") {
    return { bookingId: request.bookingId, requestType: request.type, alreadyApplied: true };
  }

  return await db.transaction(async (tx) => {
    const updated = await tx
      .update(paymentRequestsTable)
      .set({
        status: "paid",
        paidAt: new Date(),
        transactionReference: opts.transactionReference ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(paymentRequestsTable.id, request.id),
          eq(paymentRequestsTable.status, "pending"),
        ),
      )
      .returning();
    if (updated.length === 0) {
      return { bookingId: request.bookingId, requestType: request.type, alreadyApplied: true };
    }

    const [booking] = await tx
      .update(excursionBookingsTable)
      .set({
        amountPaidCents: sql`${excursionBookingsTable.amountPaidCents} + ${request.amountCents}`,
        updatedAt: new Date(),
      })
      .where(eq(excursionBookingsTable.id, request.bookingId))
      .returning();

    if (booking) {
      await tx
        .update(excursionBookingsTable)
        .set({
          paymentStatus: paymentStatusAfterPayment(
            request.type,
            booking.amountPaidCents,
            booking.totalAmountCents,
          ),
          updatedAt: new Date(),
        })
        .where(eq(excursionBookingsTable.id, booking.id));
    }

    return { bookingId: request.bookingId, requestType: request.type, alreadyApplied: false };
  });
}
