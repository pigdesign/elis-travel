import type Stripe from "stripe";
import { db } from "@workspace/db";
import {
  excursionsTable,
  excursionBookingsTable,
  paymentAttemptsTable,
  paymentRequestsTable,
} from "@workspace/db/schema";
import { eq, and, isNull, ne, or, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { dispatchPaymentReceivedEmailV2 } from "./excursion-booking-emails-v2";
import {
  confirmBookingSeatsInTransaction,
  reacquireBookingSeatsInTransaction,
} from "./seat-reservations";
import {
  BookingRefundAttemptFailedError,
  DUPLICATE_PAYMENT_REFUND_REASON,
  ensurePaymentRefundInTransaction,
  LATE_PAYMENT_WITH_EXISTING_FUNDS_REFUND_REASON,
  PAYMENT_AMOUNT_MISMATCH_REFUND_REASON,
  processBookingRefund,
  type BookingRefundResult,
} from "./booking-refunds";
import { ensureBalanceRequest } from "./booking-balance";
import { isPaymentBlockedByCancellation } from "./booking-cancellation-guard";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type PaymentAccountingStatus = "deposit" | "paid" | null;

export function paymentAccountingStatusBeforeTransition(input: {
  paymentStatus: string;
  amountPaidCents: number;
  totalAmountCents: number | null;
}): PaymentAccountingStatus {
  if (
    input.paymentStatus === "paid" ||
    (input.totalAmountCents !== null &&
      input.totalAmountCents > 0 &&
      input.amountPaidCents >= input.totalAmountCents)
  ) {
    return "paid";
  }
  if (input.paymentStatus === "deposit" || input.amountPaidCents > 0) {
    return "deposit";
  }
  return null;
}

export function isExpectedCardPaymentAmount(input: {
  paidAmountCents: number;
  currency: string;
  attemptAmountCents: number | null;
  requestAmountCents: number;
  alreadyPaidCents: number;
  totalAmountCents: number | null;
}): boolean {
  const residual =
    input.totalAmountCents === null
      ? input.requestAmountCents
      : Math.max(input.totalAmountCents - input.alreadyPaidCents, 0);
  const expectedAmount = Math.min(input.requestAmountCents, residual);
  return (
    input.paidAmountCents === expectedAmount &&
    input.currency.toLowerCase() === "eur" &&
    (input.attemptAmountCents === null ||
      input.attemptAmountCents === input.paidAmountCents)
  );
}

export function isSuccessfulCardPaymentWithinWindow(input: {
  requestStatus: string;
  requestMethod?: string | null;
  deadline: Date | null;
  graceUntil: Date | null;
  departureAt: Date | null;
  seatStatus: string;
  cancelledAt?: Date | null;
  cancellationRequestStatus?: string | null;
  now: Date;
}): boolean {
  const effectiveDeadline = input.graceUntil ?? input.deadline;
  return (
    ["pending", "action_required"].includes(input.requestStatus) &&
    (input.requestMethod === undefined || input.requestMethod === "card") &&
    !isPaymentBlockedByCancellation({
      cancelledAt: input.cancelledAt ?? null,
      cancellationRequestStatus: input.cancellationRequestStatus ?? null,
    }) &&
    input.seatStatus !== "released" &&
    Boolean(input.departureAt && input.departureAt > input.now) &&
    (!effectiveDeadline || effectiveDeadline >= input.now)
  );
}

// Applica il nuovo stato alla prenotazione e allinea i contatori della gita
// (depositsCount/balancesCount contano le PERSONE, come nel flusso legacy).
export async function setBookingStatusWithCounters(
  tx: Tx,
  booking: typeof excursionBookingsTable.$inferSelect,
  newStatus: string,
): Promise<void> {
  const seats = booking.seats;
  let depositsDelta = 0;
  let balancesDelta = 0;
  // Gli stati di workflow (es. balance_requested/expired) possono nascondere
  // il fatto che l'acconto sia gia contabilizzato. L'importo incassato resta
  // la fonte autorevole per classificare il contatore precedente.
  const previousAccountingStatus = paymentAccountingStatusBeforeTransition({
    paymentStatus: booking.paymentStatus,
    amountPaidCents: booking.amountPaidCents,
    totalAmountCents: booking.totalAmountCents,
  });
  if (previousAccountingStatus === "deposit") depositsDelta -= seats;
  if (previousAccountingStatus === "paid") balancesDelta -= seats;
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
  paymentRequestId: string;
  requestType: string;
  alreadyApplied: boolean;
  refundInitiated?: boolean;
  refundStatus?: BookingRefundResult["status"];
  balanceRequestCreated?: boolean;
};

export type CardPaymentApplicationDisposition =
  | "applied"
  | "refund_initiated"
  | "not_applied";

/**
 * Un PaymentIntent `succeeded` non equivale da solo a un pagamento applicato
 * alla prenotazione. Tutti i chiamanti HTTP/UI devono distinguere il successo
 * contabile dal rimborso e da una riconciliazione incoerente o incompleta.
 */
export function cardPaymentApplicationDisposition(
  applied: AppliedPayment | null,
): CardPaymentApplicationDisposition {
  if (!applied) return "not_applied";
  return applied.refundInitiated ? "refund_initiated" : "applied";
}

async function ensureBalanceAfterConfirmedDeposit(
  applied: Pick<AppliedPayment, "bookingId" | "requestType">,
): Promise<boolean> {
  if (applied.requestType !== "deposit") return false;
  const outcome = await ensureBalanceRequest(applied.bookingId, {
    notify: true,
  });
  return outcome.kind === "created";
}

export type ManualPaymentSeatErrorCode =
  | "full"
  | "closed"
  | "departed"
  | "cancelled"
  | "cancellation_in_progress"
  | "manual_reference_required"
  | "manual_reference_conflict"
  | "manual_method_not_allowed"
  | "invalid_request";

export class ManualPaymentSeatsUnavailableError extends Error {
  constructor(public readonly code: ManualPaymentSeatErrorCode) {
    super(
      code === "full"
        ? "I posti non sono più disponibili. Il pagamento non è stato registrato."
        : code === "closed"
          ? "La gita è chiusa. Il pagamento non è stato registrato."
          : code === "departed"
            ? "I posti erano già stati liberati e non possono essere riacquisiti dopo la partenza. Il pagamento non è stato registrato."
            : code === "cancelled"
              ? "La prenotazione è annullata. Il pagamento non è stato registrato."
              : code === "cancellation_in_progress"
                ? "La prenotazione ha un annullamento in corso. Il pagamento non è stato registrato."
                : code === "manual_reference_required"
                  ? "Inserisci un riferimento amministrativo del pagamento."
                  : code === "manual_reference_conflict"
                    ? "Il pagamento risulta già registrato con un riferimento differente."
                    : code === "manual_method_not_allowed"
                      ? "Solo bonifici, pagamenti in ufficio e incassi a bordo possono essere confermati manualmente."
                      : "La richiesta non è più pagabile.",
    );
    this.name = "ManualPaymentSeatsUnavailableError";
  }
}

export function manualPaymentSeatRecoveryDecision(input: {
  seatStatus: string;
  departureAt: Date | null;
  now: Date;
}): "not_required" | "reacquire" | "departed" {
  if (input.seatStatus !== "released") return "not_required";
  if (!input.departureAt || input.departureAt <= input.now) return "departed";
  return "reacquire";
}

export function decideManualPaymentReplay(input: {
  method: string | null;
  status: string;
  storedReference: string | null;
  requestedReference: string;
}): "apply" | "already_applied" | "reference_conflict" | "method_not_allowed" {
  // L'incasso a bordo e per definizione fuori piattaforma: come bonifico e
  // ufficio entra in contabilita solo per mano dell'amministrazione.
  if (
    !input.method ||
    !["bank_transfer", "office", "on_bus"].includes(input.method)
  ) {
    return "method_not_allowed";
  }
  if (input.status !== "paid") return "apply";
  return input.storedReference === input.requestedReference
    ? "already_applied"
    : "reference_conflict";
}

// Stato prenotazione dopo un pagamento riuscito, in base al tipo di richiesta
// e a quanto risulta pagato rispetto al totale.
export function paymentStatusAfterPayment(
  requestType: string,
  amountPaidCents: number,
  totalAmountCents: number | null,
): string {
  if (totalAmountCents !== null && amountPaidCents >= totalAmountCents)
    return "paid";
  if (requestType === "deposit") return "deposit";
  return "paid";
}

async function markPaymentAttemptSucceeded(
  tx: Tx,
  paymentIntent: Stripe.PaymentIntent,
  paymentRequestId: string,
  now: Date,
): Promise<{ id: string; amountCents: number } | null> {
  const metadataAttemptId = paymentIntent.metadata?.paymentAttemptId;
  const where = metadataAttemptId
    ? and(
        eq(paymentAttemptsTable.id, metadataAttemptId),
        eq(paymentAttemptsTable.paymentRequestId, paymentRequestId),
      )
    : and(
        eq(paymentAttemptsTable.paymentRequestId, paymentRequestId),
        eq(paymentAttemptsTable.stripePaymentIntentId, paymentIntent.id),
      );
  const [attempt] = await tx
    .update(paymentAttemptsTable)
    .set({
      status: "succeeded",
      stripePaymentIntentId: paymentIntent.id,
      lastErrorCode: null,
      lastErrorMessage: null,
      completedAt: now,
      updatedAt: now,
    })
    .where(where)
    .returning({
      id: paymentAttemptsTable.id,
      amountCents: paymentAttemptsTable.amountCents,
    });
  return attempt ?? null;
}

export async function markFailedCardPaymentAttempt(
  paymentIntent: Stripe.PaymentIntent,
): Promise<boolean> {
  const paymentRequestId = paymentIntent.metadata?.paymentRequestId;
  const metadataAttemptId = paymentIntent.metadata?.paymentAttemptId;
  if (!paymentRequestId && !metadataAttemptId) return false;

  const where = metadataAttemptId
    ? and(
        eq(paymentAttemptsTable.id, metadataAttemptId),
        paymentRequestId
          ? eq(paymentAttemptsTable.paymentRequestId, paymentRequestId)
          : undefined,
        or(
          isNull(paymentAttemptsTable.stripePaymentIntentId),
          eq(paymentAttemptsTable.stripePaymentIntentId, paymentIntent.id),
        ),
        ne(paymentAttemptsTable.status, "succeeded"),
      )
    : and(
        eq(paymentAttemptsTable.paymentRequestId, paymentRequestId!),
        eq(paymentAttemptsTable.stripePaymentIntentId, paymentIntent.id),
        ne(paymentAttemptsTable.status, "succeeded"),
      );
  const now = new Date();
  const [updated] = await db
    .update(paymentAttemptsTable)
    .set({
      status: "failed",
      stripePaymentIntentId: paymentIntent.id,
      lastErrorCode: paymentIntent.last_payment_error?.code ?? null,
      lastErrorMessage:
        paymentIntent.last_payment_error?.message?.slice(0, 2_000) ?? null,
      completedAt: now,
      updatedAt: now,
    })
    .where(where)
    .returning({ id: paymentAttemptsTable.id });
  return Boolean(updated);
}

export async function markCancelledCardPaymentAttempt(
  paymentIntent: Stripe.PaymentIntent,
): Promise<boolean> {
  const paymentRequestId = paymentIntent.metadata?.paymentRequestId;
  const metadataAttemptId = paymentIntent.metadata?.paymentAttemptId;
  if (!paymentRequestId && !metadataAttemptId) return false;

  const where = metadataAttemptId
    ? and(
        eq(paymentAttemptsTable.id, metadataAttemptId),
        paymentRequestId
          ? eq(paymentAttemptsTable.paymentRequestId, paymentRequestId)
          : undefined,
        or(
          isNull(paymentAttemptsTable.stripePaymentIntentId),
          eq(paymentAttemptsTable.stripePaymentIntentId, paymentIntent.id),
        ),
        ne(paymentAttemptsTable.status, "succeeded"),
      )
    : and(
        eq(paymentAttemptsTable.paymentRequestId, paymentRequestId!),
        eq(paymentAttemptsTable.stripePaymentIntentId, paymentIntent.id),
        ne(paymentAttemptsTable.status, "succeeded"),
      );
  const now = new Date();
  const [updated] = await db
    .update(paymentAttemptsTable)
    .set({
      status: "cancelled",
      stripePaymentIntentId: paymentIntent.id,
      lastErrorCode: paymentIntent.cancellation_reason ?? "cancelled",
      lastErrorMessage: "PaymentIntent cancellato prima dell'incasso.",
      completedAt: now,
      updatedAt: now,
    })
    .where(where)
    .returning({ id: paymentAttemptsTable.id });
  return Boolean(updated);
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
  const paidAmount = paymentIntent.amount_received ?? paymentIntent.amount;
  const decision = await db.transaction(async (tx) => {
    // Ordine di lock coerente con scadenze/cancellazioni: booking, poi request.
    const [before] = await tx
      .select()
      .from(excursionBookingsTable)
      .where(eq(excursionBookingsTable.id, request.bookingId))
      .for("update")
      .limit(1);
    if (!before) {
      throw new Error("Prenotazione del pagamento Stripe non trovata.");
    }

    const [currentRequest] = await tx
      .select()
      .from(paymentRequestsTable)
      .where(eq(paymentRequestsTable.id, request.id))
      .for("update")
      .limit(1);
    if (!currentRequest || currentRequest.bookingId !== before.id) {
      throw new Error("Richiesta del pagamento Stripe non trovata.");
    }

    const [excursion] = await tx
      .select({
        status: excursionsTable.status,
        departureAt: excursionsTable.departureAt,
      })
      .from(excursionsTable)
      .where(eq(excursionsTable.id, before.excursionId))
      .for("update")
      .limit(1);

    const now = new Date();
    const paymentAttempt = await markPaymentAttemptSucceeded(
      tx,
      paymentIntent,
      currentRequest.id,
      now,
    );

    const scheduleRefund = async (requestedReason?: string) => {
      const reason =
        requestedReason ??
        (before.amountPaidCents > 0
          ? LATE_PAYMENT_WITH_EXISTING_FUNDS_REFUND_REASON
          : undefined);
      const preservePaymentRequest =
        reason === DUPLICATE_PAYMENT_REFUND_REASON ||
        reason === PAYMENT_AMOUNT_MISMATCH_REFUND_REASON;
      const preserveBookingPayment =
        preservePaymentRequest ||
        reason === LATE_PAYMENT_WITH_EXISTING_FUNDS_REFUND_REASON;
      if (!preservePaymentRequest && currentRequest.status !== "refunded") {
        await tx
          .update(paymentRequestsTable)
          .set({
            status: "refund_required",
            paidAt: currentRequest.paidAt ?? now,
            transactionReference: paymentIntent.id,
            stripePaymentIntentId: paymentIntent.id,
            updatedAt: now,
          })
          .where(eq(paymentRequestsTable.id, currentRequest.id));
        if (!preserveBookingPayment) {
          await tx
            .update(excursionBookingsTable)
            .set({
              paymentStatus: "refund_required",
              stripePaymentIntentId: paymentIntent.id,
              updatedAt: now,
            })
            .where(eq(excursionBookingsTable.id, before.id));
        }
      }
      const refund = await ensurePaymentRefundInTransaction(tx, {
        bookingId: before.id,
        paymentRequestId: currentRequest.id,
        paymentAttemptId: paymentAttempt?.id ?? null,
        paymentIntentId: paymentIntent.id,
        amountCents: paidAmount,
        reason,
      });
      return {
        kind: "refund" as const,
        bookingId: before.id,
        paymentRequestId: currentRequest.id,
        requestType: currentRequest.type,
        refundId: refund.id,
      };
    };

    if (currentRequest.status === "paid") {
      const sameAppliedIntent =
        currentRequest.transactionReference === paymentIntent.id ||
        (!currentRequest.transactionReference &&
          currentRequest.stripePaymentIntentId === paymentIntent.id);
      if (!sameAppliedIntent) {
        // Due checkout possono produrre PI distinti sulla stessa richiesta.
        // Il secondo incasso va rimborsato senza annullare il primo.
        return scheduleRefund(DUPLICATE_PAYMENT_REFUND_REASON);
      }
      return {
        kind: "already_applied" as const,
        bookingId: before.id,
        paymentRequestId: currentRequest.id,
        requestType: currentRequest.type,
      };
    }

    if (
      !isExpectedCardPaymentAmount({
        paidAmountCents: paidAmount,
        currency: paymentIntent.currency,
        attemptAmountCents: paymentAttempt?.amountCents ?? null,
        requestAmountCents: currentRequest.amountCents,
        alreadyPaidCents: before.amountPaidCents,
        totalAmountCents: before.totalAmountCents,
      })
    ) {
      return scheduleRefund(PAYMENT_AMOUNT_MISMATCH_REFUND_REASON);
    }

    // Un retry successivo alla decisione di rimborso non deve mai tornare ad
    // applicare l'incasso, anche se nel frattempo qualcuno riapre la booking.
    if (
      currentRequest.status === "refund_required" ||
      currentRequest.status === "refunded"
    ) {
      return scheduleRefund();
    }

    if (
      !isSuccessfulCardPaymentWithinWindow({
        requestStatus: currentRequest.status,
        requestMethod: currentRequest.method,
        deadline: currentRequest.deadline,
        graceUntil: currentRequest.graceUntil,
        departureAt: excursion?.departureAt ?? null,
        seatStatus: before.seatStatus,
        cancelledAt: before.cancelledAt,
        cancellationRequestStatus: before.cancellationRequestStatus,
        now,
      }) ||
      !excursion ||
      ["completed", "cancelled", "archived"].includes(excursion.status)
    ) {
      return scheduleRefund();
    }

    const seatsConfirmed = await confirmBookingSeatsInTransaction(
      tx,
      before.id,
      now,
    );
    if (!seatsConfirmed) return scheduleRefund();

    await tx
      .update(paymentRequestsTable)
      .set({
        status: "paid",
        paidAt: now,
        transactionReference: paymentIntent.id,
        stripePaymentIntentId: paymentIntent.id,
        updatedAt: now,
      })
      .where(eq(paymentRequestsTable.id, currentRequest.id));

    const newPaid = before.amountPaidCents + paidAmount;
    await tx
      .update(excursionBookingsTable)
      .set({
        amountPaidCents: newPaid,
        stripePaymentIntentId: paymentIntent.id,
        updatedAt: now,
      })
      .where(eq(excursionBookingsTable.id, before.id));
    await setBookingStatusWithCounters(
      tx,
      before,
      paymentStatusAfterPayment(
        currentRequest.type,
        newPaid,
        before.totalAmountCents,
      ),
    );

    return {
      kind: "applied" as const,
      bookingId: before.id,
      paymentRequestId: currentRequest.id,
      requestType: currentRequest.type,
    };
  });

  if (decision.kind === "refund") {
    let refund: BookingRefundResult;
    try {
      refund = await processBookingRefund(decision.refundId);
    } catch (error) {
      if (!(error instanceof BookingRefundAttemptFailedError)) throw error;
      refund = {
        refundId: error.refundId,
        status: "failed",
        stripeRefundId: null,
      };
    }
    return {
      bookingId: decision.bookingId,
      paymentRequestId: decision.paymentRequestId,
      requestType: decision.requestType,
      alreadyApplied: true,
      refundInitiated: true,
      refundStatus: refund.status,
    };
  }
  if (decision.kind === "already_applied") {
    const balanceRequestCreated =
      await ensureBalanceAfterConfirmedDeposit(decision);
    await dispatchPaymentReceivedEmailV2(
      decision.bookingId,
      decision.requestType,
      decision.paymentRequestId,
    );
    return {
      bookingId: decision.bookingId,
      paymentRequestId: decision.paymentRequestId,
      requestType: decision.requestType,
      alreadyApplied: true,
      balanceRequestCreated,
    };
  }

  const balanceRequestCreated =
    await ensureBalanceAfterConfirmedDeposit(decision);
  await dispatchPaymentReceivedEmailV2(
    decision.bookingId,
    decision.requestType,
    decision.paymentRequestId,
  );
  return {
    bookingId: decision.bookingId,
    paymentRequestId: decision.paymentRequestId,
    requestType: decision.requestType,
    alreadyApplied: false,
    balanceRequestCreated,
  };
}

// Conferma manuale admin (bonifico ricevuto, pagamento in ufficio, ecc.).
export async function applyManualPayment(opts: {
  paymentRequestId: string;
  transactionReference?: string | null;
}): Promise<AppliedPayment | null> {
  const transactionReference = opts.transactionReference?.trim() ?? "";
  if (!transactionReference || transactionReference.length > 500) {
    throw new ManualPaymentSeatsUnavailableError("manual_reference_required");
  }
  const [request] = await db
    .select()
    .from(paymentRequestsTable)
    .where(eq(paymentRequestsTable.id, opts.paymentRequestId))
    .limit(1);
  if (!request) return null;

  const applied = await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(excursionBookingsTable)
      .where(eq(excursionBookingsTable.id, request.bookingId))
      .for("update")
      .limit(1);
    if (!before || before.cancelledAt) {
      throw new ManualPaymentSeatsUnavailableError("cancelled");
    }
    if (isPaymentBlockedByCancellation(before)) {
      throw new ManualPaymentSeatsUnavailableError("cancellation_in_progress");
    }

    const [currentRequest] = await tx
      .select()
      .from(paymentRequestsTable)
      .where(eq(paymentRequestsTable.id, request.id))
      .for("update")
      .limit(1);
    if (!currentRequest) return null;
    const replayDecision = decideManualPaymentReplay({
      method: currentRequest.method,
      status: currentRequest.status,
      storedReference: currentRequest.transactionReference,
      requestedReference: transactionReference,
    });
    if (replayDecision === "method_not_allowed") {
      throw new ManualPaymentSeatsUnavailableError("manual_method_not_allowed");
    }
    if (replayDecision === "reference_conflict") {
      throw new ManualPaymentSeatsUnavailableError("manual_reference_conflict");
    }
    if (replayDecision === "already_applied") {
      return {
        bookingId: currentRequest.bookingId,
        paymentRequestId: currentRequest.id,
        requestType: currentRequest.type,
        alreadyApplied: true,
      };
    }
    if (
      !["pending", "action_required", "expired"].includes(currentRequest.status)
    ) {
      throw new ManualPaymentSeatsUnavailableError("invalid_request");
    }

    const [excursion] = await tx
      .select({
        status: excursionsTable.status,
        departureAt: excursionsTable.departureAt,
      })
      .from(excursionsTable)
      .where(eq(excursionsTable.id, before.excursionId))
      .for("update")
      .limit(1);
    if (
      !excursion ||
      ["completed", "cancelled", "archived"].includes(excursion.status)
    ) {
      throw new ManualPaymentSeatsUnavailableError("closed");
    }

    const now = new Date();
    const seatRecovery = manualPaymentSeatRecoveryDecision({
      seatStatus: before.seatStatus,
      departureAt: excursion.departureAt,
      now,
    });
    if (seatRecovery === "departed") {
      throw new ManualPaymentSeatsUnavailableError("departed");
    }
    if (seatRecovery === "reacquire") {
      const reacquired = await reacquireBookingSeatsInTransaction(
        tx,
        before.id,
        null,
        now,
      );
      if (reacquired === "full") {
        throw new ManualPaymentSeatsUnavailableError("full");
      }
      if (reacquired === "closed") {
        throw new ManualPaymentSeatsUnavailableError("closed");
      }
      if (reacquired === "not_found") {
        throw new ManualPaymentSeatsUnavailableError("cancelled");
      }
    }

    const seatsConfirmed = await confirmBookingSeatsInTransaction(
      tx,
      before.id,
      now,
    );
    if (!seatsConfirmed) {
      throw new ManualPaymentSeatsUnavailableError("full");
    }

    await tx
      .update(paymentRequestsTable)
      .set({
        status: "paid",
        paidAt: now,
        transactionReference,
        updatedAt: now,
      })
      .where(eq(paymentRequestsTable.id, currentRequest.id));

    const newPaid = before.amountPaidCents + currentRequest.amountCents;
    await tx
      .update(excursionBookingsTable)
      .set({ amountPaidCents: newPaid, updatedAt: now })
      .where(eq(excursionBookingsTable.id, before.id));
    await setBookingStatusWithCounters(
      tx,
      before,
      paymentStatusAfterPayment(
        currentRequest.type,
        newPaid,
        before.totalAmountCents,
      ),
    );

    return {
      bookingId: currentRequest.bookingId,
      paymentRequestId: currentRequest.id,
      requestType: currentRequest.type,
      alreadyApplied: false,
    };
  });

  if (!applied) return null;
  const balanceRequestCreated =
    await ensureBalanceAfterConfirmedDeposit(applied);
  await dispatchPaymentReceivedEmailV2(
    applied.bookingId,
    applied.requestType,
    applied.paymentRequestId,
  );
  return { ...applied, balanceRequestCreated };
}
