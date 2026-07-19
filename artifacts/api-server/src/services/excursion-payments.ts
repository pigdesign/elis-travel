import type Stripe from "stripe";
import { db } from "@workspace/db";
import {
  excursionsTable,
  excursionBookingsTable,
  paymentRequestsTable,
} from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { dispatchPaymentReceivedEmailV2 } from "./excursion-booking-emails-v2";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Applica il nuovo stato alla prenotazione e allinea i contatori della gita
// (depositsCount/balancesCount contano le PERSONE, come nel flusso legacy).
async function setBookingStatusWithCounters(
  tx: Tx,
  booking: typeof excursionBookingsTable.$inferSelect,
  newStatus: string,
): Promise<void> {
  const seats = booking.seats;
  let depositsDelta = 0;
  let balancesDelta = 0;
  if (booking.paymentStatus === "deposit") depositsDelta -= seats;
  if (booking.paymentStatus === "paid") balancesDelta -= seats;
  if (newStatus === "deposit") depositsDelta += seats;
  if (newStatus === "paid") balancesDelta += seats;

  await tx
    .update(excursionBookingsTable)
    .set({ paymentStatus: newStatus, updatedAt: new Date() })
    .where(eq(excursionBookingsTable.id, booking.id));

  if (depositsDelta !== 0 || balancesDelta !== 0) {
    await tx
      .update(excursionsTable)
      .set({
        depositsCount: sql`GREATEST(0, ${excursionsTable.depositsCount} + ${depositsDelta})`,
        balancesCount: sql`GREATEST(0, ${excursionsTable.balancesCount} + ${balancesDelta})`,
        updatedAt: new Date(),
      })
      .where(eq(excursionsTable.id, booking.excursionId));
  }
}

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

  const applied = await db.transaction(async (tx) => {
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

    const [before] = await tx
      .select()
      .from(excursionBookingsTable)
      .where(eq(excursionBookingsTable.id, request.bookingId))
      .for("update")
      .limit(1);

    if (before) {
      const newPaid = before.amountPaidCents + paidAmount;
      await tx
        .update(excursionBookingsTable)
        .set({ amountPaidCents: newPaid, updatedAt: new Date() })
        .where(eq(excursionBookingsTable.id, before.id));
      await setBookingStatusWithCounters(
        tx,
        before,
        paymentStatusAfterPayment(request.type, newPaid, before.totalAmountCents),
      );
    }

    return { bookingId: request.bookingId, requestType: request.type, alreadyApplied: false };
  });

  if (!applied.alreadyApplied) {
    dispatchPaymentReceivedEmailV2(applied.bookingId, applied.requestType);
  }
  return applied;
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

  const applied = await db.transaction(async (tx) => {
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

    const [before] = await tx
      .select()
      .from(excursionBookingsTable)
      .where(eq(excursionBookingsTable.id, request.bookingId))
      .for("update")
      .limit(1);

    if (before) {
      const newPaid = before.amountPaidCents + request.amountCents;
      await tx
        .update(excursionBookingsTable)
        .set({ amountPaidCents: newPaid, updatedAt: new Date() })
        .where(eq(excursionBookingsTable.id, before.id));
      await setBookingStatusWithCounters(
        tx,
        before,
        paymentStatusAfterPayment(request.type, newPaid, before.totalAmountCents),
      );
    }

    return { bookingId: request.bookingId, requestType: request.type, alreadyApplied: false };
  });

  if (!applied.alreadyApplied) {
    dispatchPaymentReceivedEmailV2(applied.bookingId, applied.requestType);
  }
  return applied;
}
