import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import {
  bookingCancellationCasesTable,
  excursionBookingsTable,
  excursionsTable,
  paymentAttemptsTable,
  paymentRefundsTable,
  paymentRequestsTable,
  stripeCleanupJobsTable,
} from "@workspace/db/schema";
import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  like,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  ensurePaymentRefundInTransaction,
  processBookingRefund,
} from "./booking-refunds";
import { enqueueEmailInTransaction } from "./email-outbox";
import { getAdminNotificationEmails } from "./email.service";
import {
  dispatchBookingCancellationEmailV2,
  dispatchCancellationRequestedEmailsV2,
} from "./excursion-booking-emails-v2";
import { releaseBookingSeatsInTransaction } from "./seat-reservations";
import { enqueueStripeCleanupJobInTransaction } from "./stripe-cleanup";
import { recoverConfirmedBookingWorkflow } from "./excursion-confirmation";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Booking = typeof excursionBookingsTable.$inferSelect;
type PaymentRequest = typeof paymentRequestsTable.$inferSelect;
type CancellationCase = typeof bookingCancellationCasesTable.$inferSelect;

export const CUSTOMER_CANCELLATION_REFUND_REASON =
  "customer_cancellation_refund";
export const EXCURSION_CANCELLATION_REFUND_REASON =
  "excursion_cancellation_refund";

const OPEN_REQUEST_STATUSES = [
  "pending",
  "expired",
  "scheduled",
  "card_setup_pending",
  "action_required",
] as const;
const OPEN_ATTEMPT_STATUSES = [
  "pending",
  "processing",
  "action_required",
  "cancellation_pending",
] as const;

function openAttemptCondition() {
  return or(
    inArray(paymentAttemptsTable.status, [...OPEN_ATTEMPT_STATUSES]),
    and(
      eq(paymentAttemptsTable.status, "failed"),
      isNotNull(paymentAttemptsTable.stripePaymentIntentId),
    ),
  );
}

export type CancellationErrorCode =
  | "not_found"
  | "already_cancelled"
  | "request_not_pending"
  | "invalid_case_id"
  | "invalid_command_id"
  | "decision_reason_required"
  | "invalid_refund_amount"
  | "financial_source_conflict"
  | "excursion_closed"
  | "refund_not_manual";

export class BookingCancellationError extends Error {
  constructor(
    public readonly code: CancellationErrorCode,
    message: string,
    public readonly statusCode: 400 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = "BookingCancellationError";
  }
}

export type RefundablePaymentSource = {
  key: string;
  kind: "card" | "manual";
  amountCents: number;
  paymentRequestId: string | null;
  paymentAttemptId: string | null;
  paymentIntentId: string | null;
  method: string | null;
};

export type CancellationRefundAllocation = RefundablePaymentSource & {
  refundAmountCents: number;
};

export function cancellationRefundIdempotencyKey(
  cancellationCaseId: string,
  allocationKey: string,
): string {
  return `booking-cancellation:${cancellationCaseId}:${allocationKey}`;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function adminCancellationSourceKey(
  bookingId: string,
  clientCommandId: string,
): string {
  return `admin-cancellation:${bookingId.trim().toLowerCase()}:${clientCommandId.trim().toLowerCase()}`;
}

export type CancellationAdminActor = {
  id: string;
  name: string;
};

export function assertCancellationDecisionReason(input: {
  decision: "approve" | "reject";
  note: string | null;
  approvedRefundCents?: number;
  refundableAtDecisionCents?: number;
}): void {
  const isPenaltyApproval =
    input.decision === "approve" &&
    input.approvedRefundCents !== undefined &&
    input.refundableAtDecisionCents !== undefined &&
    input.approvedRefundCents < input.refundableAtDecisionCents;
  if (
    (input.decision === "reject" || isPenaltyApproval) &&
    !input.note?.trim()
  ) {
    throw new BookingCancellationError(
      "decision_reason_required",
      input.decision === "reject"
        ? "Indica il motivo del rifiuto della richiesta di annullamento."
        : "Indica il motivo della penale o del rimborso parziale.",
    );
  }
}

export function assertManualCompletionReference(
  existingReference: string | null,
  requestedReference: string,
): void {
  if (existingReference === requestedReference) return;
  throw new BookingCancellationError(
    "financial_source_conflict",
    existingReference === null
      ? "Il rimborso risulta già completato senza un riferimento verificabile; il dato legacy non viene sovrascritto."
      : "Il rimborso risulta già completato con un riferimento diverso.",
    409,
  );
}

/**
 * Le carte vengono usate per prime, così il sistema automatizza tutto ciò che
 * può; bonifici, ufficio e fonti legacy non identificabili diventano una voce
 * manuale esplicita. La funzione non inventa mai fondi oltre le fonti caricate.
 */
export function allocateCancellationRefund(
  sources: RefundablePaymentSource[],
  requestedAmountCents: number,
): CancellationRefundAllocation[] {
  if (!Number.isSafeInteger(requestedAmountCents) || requestedAmountCents < 0) {
    throw new BookingCancellationError(
      "invalid_refund_amount",
      "L'importo del rimborso deve essere espresso in centesimi interi e non negativi.",
    );
  }
  const normalized = sources
    .filter(
      (source) =>
        Number.isSafeInteger(source.amountCents) && source.amountCents > 0,
    )
    .sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === "card" ? -1 : 1;
      return left.key.localeCompare(right.key);
    });
  const sourceKeys = new Set<string>();
  let available = 0;
  for (const source of normalized) {
    if (sourceKeys.has(source.key)) {
      throw new BookingCancellationError(
        "financial_source_conflict",
        `La fonte economica ${source.key} è duplicata.`,
        409,
      );
    }
    sourceKeys.add(source.key);
    available += source.amountCents;
    if (!Number.isSafeInteger(available)) {
      throw new BookingCancellationError(
        "financial_source_conflict",
        "La somma degli incassi riconciliati non è rappresentabile in sicurezza.",
        409,
      );
    }
  }
  if (requestedAmountCents > available) {
    throw new BookingCancellationError(
      "financial_source_conflict",
      `Il rimborso richiesto (${requestedAmountCents}) supera gli incassi riconciliati (${available}).`,
      409,
    );
  }

  let remaining = requestedAmountCents;
  const allocations: CancellationRefundAllocation[] = [];
  for (const source of normalized) {
    if (remaining <= 0) break;
    const refundAmountCents = Math.min(source.amountCents, remaining);
    allocations.push({ ...source, refundAmountCents });
    remaining -= refundAmountCents;
  }
  return allocations;
}

export function acceptedPaymentIntentReference(
  request: Pick<
    PaymentRequest,
    "transactionReference" | "stripePaymentIntentId"
  >,
): string | null {
  // transactionReference viene scritto soltanto quando l'incasso è applicato;
  // stripePaymentIntentId è invece il puntatore all'ultimo tentativo e può già
  // riferirsi a un checkout duplicato ancora da compensare.
  if (request.transactionReference?.startsWith("pi_")) {
    return request.transactionReference;
  }
  if (request.stripePaymentIntentId?.startsWith("pi_")) {
    return request.stripePaymentIntentId;
  }
  return null;
}

async function loadRefundableSourcesInTransaction(
  tx: Tx,
  booking: Booking,
): Promise<{
  requests: PaymentRequest[];
  sources: RefundablePaymentSource[];
  refundableCents: number;
  acceptedPaymentIntents: Set<string>;
}> {
  const requests = await tx
    .select()
    .from(paymentRequestsTable)
    .where(eq(paymentRequestsTable.bookingId, booking.id))
    .orderBy(asc(paymentRequestsTable.createdAt))
    .for("update");
  const requestIds = requests.map((request) => request.id);
  const attempts =
    requestIds.length > 0
      ? await tx
          .select()
          .from(paymentAttemptsTable)
          .where(inArray(paymentAttemptsTable.paymentRequestId, requestIds))
          .orderBy(asc(paymentAttemptsTable.createdAt))
          .for("update")
      : [];
  const existingRefunds = await tx
    .select()
    .from(paymentRefundsTable)
    .where(eq(paymentRefundsTable.bookingId, booking.id))
    .for("update");

  const acceptedRequests = requests.filter(
    (request) => request.status === "paid",
  );
  const sources: RefundablePaymentSource[] = [];
  const seenPaymentIntents = new Set<string>();
  let remainingPaid = Math.max(booking.amountPaidCents, 0);

  for (const request of acceptedRequests) {
    if (remainingPaid <= 0) break;
    const amountCents = Math.min(
      Math.max(request.amountCents, 0),
      remainingPaid,
    );
    if (amountCents <= 0) continue;
    const paymentIntentId = acceptedPaymentIntentReference(request);
    const isCard = request.method === "card" && Boolean(paymentIntentId);
    if (isCard && paymentIntentId) {
      if (seenPaymentIntents.has(paymentIntentId)) {
        throw new BookingCancellationError(
          "financial_source_conflict",
          `Il PaymentIntent ${paymentIntentId} risulta applicato a più richieste di pagamento.`,
          409,
        );
      }
      const committedCents = existingRefunds
        .filter((refund) => refund.stripePaymentIntentId === paymentIntentId)
        .reduce((sum, refund) => sum + Math.max(refund.amountCents, 0), 0);
      const availableCents = Math.max(amountCents - committedCents, 0);
      const attempt = attempts.find(
        (candidate) =>
          candidate.paymentRequestId === request.id &&
          candidate.status === "succeeded" &&
          candidate.stripePaymentIntentId === paymentIntentId,
      );
      if (availableCents > 0) {
        sources.push({
          key: `card:${paymentIntentId}`,
          kind: "card",
          amountCents: availableCents,
          paymentRequestId: request.id,
          paymentAttemptId: attempt?.id ?? null,
          paymentIntentId,
          method: "card",
        });
      }
      seenPaymentIntents.add(paymentIntentId);
    } else {
      const committedCents = existingRefunds
        .filter(
          (refund) =>
            refund.paymentRequestId === request.id &&
            refund.provider === "manual",
        )
        .reduce((sum, refund) => sum + Math.max(refund.amountCents, 0), 0);
      const availableCents = Math.max(amountCents - committedCents, 0);
      if (availableCents > 0) {
        sources.push({
          key: `manual:${request.id}`,
          kind: "manual",
          amountCents: availableCents,
          paymentRequestId: request.id,
          paymentAttemptId: null,
          paymentIntentId: null,
          method: request.method,
        });
      }
    }
    remainingPaid -= amountCents;
  }

  if (
    remainingPaid > 0 &&
    booking.stripePaymentIntentId?.startsWith("pi_") &&
    !seenPaymentIntents.has(booking.stripePaymentIntentId)
  ) {
    const committedCents = existingRefunds
      .filter(
        (refund) =>
          refund.stripePaymentIntentId === booking.stripePaymentIntentId,
      )
      .reduce((sum, refund) => sum + Math.max(refund.amountCents, 0), 0);
    const availableCents = Math.max(remainingPaid - committedCents, 0);
    if (availableCents > 0) {
      sources.push({
        key: `card:${booking.stripePaymentIntentId}`,
        kind: "card",
        amountCents: availableCents,
        paymentRequestId: null,
        paymentAttemptId: null,
        paymentIntentId: booking.stripePaymentIntentId,
        method: "card",
      });
    }
    seenPaymentIntents.add(booking.stripePaymentIntentId);
    remainingPaid = 0;
  }

  if (remainingPaid > 0) {
    sources.push({
      key: `manual:unreconciled:${booking.id}`,
      kind: "manual",
      amountCents: remainingPaid,
      paymentRequestId: null,
      paymentAttemptId: null,
      paymentIntentId: null,
      method: booking.paymentMethod,
    });
  }
  return {
    requests,
    sources,
    refundableCents: sources.reduce(
      (sum, source) => sum + source.amountCents,
      0,
    ),
    acceptedPaymentIntents: seenPaymentIntents,
  };
}

export type CancellationReconciliationInput = {
  expectedRefundCents: number;
  caseRefunds: Array<{ amountCents: number; status: string }>;
  unresolvedBookingRefunds: Array<{ status: string }>;
  activeAttemptsCount: number;
  cleanupJobs: Array<{ status: string }>;
};

export function classifyCancellationReconciliation(
  input: CancellationReconciliationInput,
): "manual_required" | "refunding" | "completed" {
  let registered = 0;
  let structurallyInvalid =
    !Number.isSafeInteger(input.expectedRefundCents) ||
    input.expectedRefundCents < 0;
  for (const refund of input.caseRefunds) {
    if (!Number.isSafeInteger(refund.amountCents) || refund.amountCents <= 0) {
      structurallyInvalid = true;
      continue;
    }
    registered += refund.amountCents;
    if (!Number.isSafeInteger(registered)) structurallyInvalid = true;
  }
  structurallyInvalid ||= registered !== input.expectedRefundCents;
  const manualRequired =
    structurallyInvalid ||
    input.caseRefunds.some((refund) => refund.status === "manual_required") ||
    input.unresolvedBookingRefunds.some(
      (refund) => refund.status === "manual_required",
    ) ||
    input.cleanupJobs.some((job) => job.status === "manual_required");
  if (manualRequired) return "manual_required";

  const stillProcessing =
    input.caseRefunds.some((refund) => refund.status !== "succeeded") ||
    input.unresolvedBookingRefunds.length > 0 ||
    input.activeAttemptsCount > 0 ||
    input.cleanupJobs.length > 0;
  return stillProcessing ? "refunding" : "completed";
}

export function isTerminalCancellationCaseWithoutRefund(
  status: string,
): boolean {
  return status === "rejected" || status === "superseded";
}

function bookingAccountingStatus(booking: Booking): "deposit" | "paid" | null {
  if (
    booking.paymentStatus === "paid" ||
    (booking.totalAmountCents !== null &&
      booking.totalAmountCents > 0 &&
      booking.amountPaidCents >= booking.totalAmountCents)
  ) {
    return "paid";
  }
  if (booking.paymentStatus === "deposit" || booking.amountPaidCents > 0) {
    return "deposit";
  }
  return null;
}

async function decrementPaymentCountersInTransaction(
  tx: Tx,
  booking: Booking,
  now: Date,
): Promise<void> {
  const accountingStatus = bookingAccountingStatus(booking);
  if (!accountingStatus) return;
  await tx
    .update(excursionsTable)
    .set({
      ...(accountingStatus === "deposit"
        ? {
            depositsCount: sql`GREATEST(0, ${excursionsTable.depositsCount} - ${booking.seats})`,
          }
        : {
            balancesCount: sql`GREATEST(0, ${excursionsTable.balancesCount} - ${booking.seats})`,
          }),
      updatedAt: now,
    })
    .where(eq(excursionsTable.id, booking.excursionId));
}

async function closeOpenPaymentWorkInTransaction(
  tx: Tx,
  booking: Booking,
  requests: PaymentRequest[],
  acceptedPaymentIntents: Set<string>,
  now: Date,
): Promise<{ cleanupScheduled: boolean }> {
  let cleanupScheduled = false;
  const requestIds = requests.map((request) => request.id);
  const activeAttempts =
    requestIds.length > 0
      ? await tx
          .select()
          .from(paymentAttemptsTable)
          .where(
            and(
              inArray(paymentAttemptsTable.paymentRequestId, requestIds),
              openAttemptCondition(),
            ),
          )
          .for("update")
      : [];

  for (const attempt of activeAttempts) {
    if (attempt.stripePaymentIntentId) {
      if (acceptedPaymentIntents.has(attempt.stripePaymentIntentId)) continue;
      await tx
        .update(paymentAttemptsTable)
        .set({
          status: "cancellation_pending",
          completedAt: null,
          updatedAt: now,
        })
        .where(eq(paymentAttemptsTable.id, attempt.id));
      await enqueueStripeCleanupJobInTransaction(tx, {
        bookingId: booking.id,
        operation: "cancel_payment_intent",
        stripeResourceId: attempt.stripePaymentIntentId,
      });
      cleanupScheduled = true;
    } else {
      await tx
        .update(paymentAttemptsTable)
        .set({ status: "cancelled", completedAt: now, updatedAt: now })
        .where(eq(paymentAttemptsTable.id, attempt.id));
    }
  }

  if (requestIds.length > 0) {
    await tx
      .update(paymentRequestsTable)
      .set({ status: "cancelled", updatedAt: now })
      .where(
        and(
          inArray(paymentRequestsTable.id, requestIds),
          inArray(paymentRequestsTable.status, [...OPEN_REQUEST_STATUSES]),
        ),
      );
  }

  if (
    booking.stripePaymentIntentId &&
    !acceptedPaymentIntents.has(booking.stripePaymentIntentId)
  ) {
    await enqueueStripeCleanupJobInTransaction(tx, {
      bookingId: booking.id,
      operation: "cancel_payment_intent",
      stripeResourceId: booking.stripePaymentIntentId,
    });
    cleanupScheduled = true;
  }
  if (booking.stripeSetupIntentId) {
    await enqueueStripeCleanupJobInTransaction(tx, {
      bookingId: booking.id,
      operation: "cancel_setup_intent",
      stripeResourceId: booking.stripeSetupIntentId,
    });
    cleanupScheduled = true;
  }
  if (booking.stripeCustomerId) {
    await enqueueStripeCleanupJobInTransaction(tx, {
      bookingId: booking.id,
      operation: "delete_customer",
      stripeResourceId: booking.stripeCustomerId,
    });
    cleanupScheduled = true;
  }
  return { cleanupScheduled };
}

async function enqueueManualRefundNotice(
  tx: Tx,
  booking: Booking,
  refundId: string,
  amountCents: number,
): Promise<void> {
  const admins = getAdminNotificationEmails();
  if (admins.length === 0) return;
  const amount = (amountCents / 100).toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
  });
  await enqueueEmailInTransaction(tx, {
    bookingId: booking.id,
    eventType: "booking.refund.manual-required.admin",
    dedupeKey: `refund:${refundId}:manual-required:admin:v1`,
    message: {
      to: admins,
      subject: "[ElisTravel] Rimborso offline da completare",
      text: `Prenotazione ${booking.bookingCode ?? booking.id}\nCliente: ${booking.customerName}\nImporto: ${amount}\nRegistra il rimborso effettuato nel dettaglio prenotazione.`,
      html: `<h2>Rimborso offline da completare</h2><p><strong>Prenotazione:</strong> ${booking.bookingCode ?? booking.id}<br/><strong>Cliente:</strong> ${booking.customerName}<br/><strong>Importo:</strong> ${amount}</p><p>Registra il rimborso effettuato nel dettaglio prenotazione.</p>`,
    },
  });
}

type CancellationOrigin = "customer" | "admin" | "excursion";

async function ensureCancellationCaseInTransaction(
  tx: Tx,
  input: {
    booking: Booking;
    source: CancellationOrigin;
    sourceKey: string;
    requestReason: string;
    now: Date;
    initialStatus?: string;
    openedBy?: CancellationAdminActor | null;
  },
): Promise<CancellationCase> {
  let [cancellationCase] = await tx
    .insert(bookingCancellationCasesTable)
    .values({
      bookingId: input.booking.id,
      excursionId: input.booking.excursionId,
      source: input.source,
      sourceKey: input.sourceKey,
      status: input.initialStatus ?? "pending",
      requestReason: input.requestReason,
      openedByAdminUserId: input.openedBy?.id ?? null,
      openedByAdminName: input.openedBy?.name ?? null,
      requestedAt: input.now,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoNothing({ target: bookingCancellationCasesTable.sourceKey })
    .returning();
  if (!cancellationCase) {
    [cancellationCase] = await tx
      .select()
      .from(bookingCancellationCasesTable)
      .where(eq(bookingCancellationCasesTable.sourceKey, input.sourceKey))
      .for("update")
      .limit(1);
  }
  if (
    !cancellationCase ||
    cancellationCase.bookingId !== input.booking.id ||
    cancellationCase.source !== input.source
  ) {
    throw new BookingCancellationError(
      "financial_source_conflict",
      "Conflitto sulla chiave idempotente del caso di annullamento.",
      409,
    );
  }
  return cancellationCase;
}

async function latestPendingCancellationCaseInTransaction(
  tx: Tx,
  bookingId: string,
): Promise<CancellationCase | null> {
  const [cancellationCase] = await tx
    .select()
    .from(bookingCancellationCasesTable)
    .where(
      and(
        eq(bookingCancellationCasesTable.bookingId, bookingId),
        eq(bookingCancellationCasesTable.status, "pending"),
      ),
    )
    .orderBy(sql`${bookingCancellationCasesTable.createdAt} DESC`)
    .for("update")
    .limit(1);
  return cancellationCase ?? null;
}

async function cancellationCaseByIdInTransaction(
  tx: Tx,
  bookingId: string,
  cancellationCaseId: string,
): Promise<CancellationCase | null> {
  const [cancellationCase] = await tx
    .select()
    .from(bookingCancellationCasesTable)
    .where(
      and(
        eq(bookingCancellationCasesTable.id, cancellationCaseId),
        eq(bookingCancellationCasesTable.bookingId, bookingId),
      ),
    )
    .for("update")
    .limit(1);
  return cancellationCase ?? null;
}

async function approveCancellationInTransaction(
  tx: Tx,
  booking: Booking,
  input: {
    refundAmountCents?: number;
    note: string | null;
    origin: CancellationOrigin;
    cancellationCase: CancellationCase;
    now: Date;
    decidedBy?: CancellationAdminActor | null;
  },
): Promise<{
  cancellationCaseId: string;
  refundIds: string[];
  manualRefundIds: string[];
  completedImmediately: boolean;
  refundableAtDecisionCents: number;
}> {
  if (
    input.cancellationCase.bookingId !== booking.id ||
    input.cancellationCase.status !== "pending"
  ) {
    throw new BookingCancellationError(
      "request_not_pending",
      "Il caso di annullamento non è più in attesa.",
      409,
    );
  }

  const { requests, sources, refundableCents, acceptedPaymentIntents } =
    await loadRefundableSourcesInTransaction(tx, booking);
  const approvedRefundCents = input.refundAmountCents ?? refundableCents;
  if (
    !Number.isSafeInteger(approvedRefundCents) ||
    approvedRefundCents < 0 ||
    approvedRefundCents > refundableCents
  ) {
    throw new BookingCancellationError(
      "invalid_refund_amount",
      `Il rimborso deve essere compreso tra 0 e ${refundableCents} centesimi disponibili.`,
    );
  }
  const allocations = allocateCancellationRefund(sources, approvedRefundCents);
  assertCancellationDecisionReason({
    decision: "approve",
    note: input.note,
    approvedRefundCents,
    refundableAtDecisionCents: refundableCents,
  });
  const reason =
    input.origin === "excursion"
      ? EXCURSION_CANCELLATION_REFUND_REASON
      : CUSTOMER_CANCELLATION_REFUND_REASON;
  const refundIds: string[] = [];
  const manualRefundIds: string[] = [];

  for (const allocation of allocations) {
    if (allocation.kind === "card" && allocation.paymentIntentId) {
      const refund = await ensurePaymentRefundInTransaction(tx, {
        bookingId: booking.id,
        paymentRequestId: allocation.paymentRequestId,
        paymentAttemptId: allocation.paymentAttemptId,
        paymentIntentId: allocation.paymentIntentId,
        amountCents: allocation.refundAmountCents,
        reason,
        idempotencyKey: cancellationRefundIdempotencyKey(
          input.cancellationCase.id,
          allocation.paymentIntentId,
        ),
      });
      const linkedRefund = await tx
        .update(paymentRefundsTable)
        .set({ cancellationCaseId: input.cancellationCase.id })
        .where(
          and(
            eq(paymentRefundsTable.id, refund.id),
            or(
              isNull(paymentRefundsTable.cancellationCaseId),
              eq(
                paymentRefundsTable.cancellationCaseId,
                input.cancellationCase.id,
              ),
            ),
          ),
        )
        .returning({ id: paymentRefundsTable.id });
      if (linkedRefund.length !== 1) {
        throw new BookingCancellationError(
          "financial_source_conflict",
          "Il rimborso Stripe appartiene già a un altro caso di annullamento.",
          409,
        );
      }
      refundIds.push(refund.id);
      continue;
    }

    const manualKey = cancellationRefundIdempotencyKey(
      input.cancellationCase.id,
      `manual:${allocation.key}`,
    );
    let [manualRefund] = await tx
      .insert(paymentRefundsTable)
      .values({
        bookingId: booking.id,
        paymentRequestId: allocation.paymentRequestId,
        paymentAttemptId: null,
        cancellationCaseId: input.cancellationCase.id,
        amountCents: allocation.refundAmountCents,
        reason,
        status: "manual_required",
        provider: "manual",
        stripePaymentIntentId: null,
        idempotencyKey: manualKey,
        maxAttempts: 0,
      })
      .onConflictDoNothing({ target: paymentRefundsTable.idempotencyKey })
      .returning();
    if (!manualRefund) {
      [manualRefund] = await tx
        .select()
        .from(paymentRefundsTable)
        .where(eq(paymentRefundsTable.idempotencyKey, manualKey))
        .limit(1);
    }
    if (
      !manualRefund ||
      manualRefund.bookingId !== booking.id ||
      manualRefund.amountCents !== allocation.refundAmountCents ||
      manualRefund.provider !== "manual" ||
      manualRefund.reason !== reason ||
      manualRefund.cancellationCaseId !== input.cancellationCase.id
    ) {
      throw new BookingCancellationError(
        "financial_source_conflict",
        "Conflitto nella registrazione del rimborso offline.",
        409,
      );
    }
    refundIds.push(manualRefund.id);
    manualRefundIds.push(manualRefund.id);
    await enqueueManualRefundNotice(
      tx,
      booking,
      manualRefund.id,
      manualRefund.amountCents,
    );
  }

  const cleanup = await closeOpenPaymentWorkInTransaction(
    tx,
    booking,
    requests,
    acceptedPaymentIntents,
    input.now,
  );
  await releaseBookingSeatsInTransaction(
    tx,
    booking.id,
    input.origin === "excursion" ? "excursion_cancelled" : "admin_cancelled",
    input.now,
  );
  await decrementPaymentCountersInTransaction(tx, booking, input.now);

  const completedImmediately =
    approvedRefundCents === 0 && !cleanup.cleanupScheduled;
  await tx
    .update(excursionBookingsTable)
    .set({
      cancelledAt: input.now,
      cancellationRequestedAt: booking.cancellationRequestedAt ?? input.now,
      cancellationRequestStatus: completedImmediately
        ? "completed"
        : "approved",
      cancellationRequestReason:
        input.origin === "excursion"
          ? "Annullamento della gita da parte dell'agenzia"
          : (booking.cancellationRequestReason ??
            "Annullamento amministrativo"),
      cancellationDecisionAt: input.now,
      cancellationCompletedAt: completedImmediately ? input.now : null,
      cancellationResolutionNote: input.note,
      cancellationRefundAmountCents: approvedRefundCents,
      cancellationPenaltyAmountCents: refundableCents - approvedRefundCents,
      updatedAt: input.now,
    })
    .where(eq(excursionBookingsTable.id, booking.id));

  await tx
    .update(bookingCancellationCasesTable)
    .set({
      status: completedImmediately
        ? "completed"
        : manualRefundIds.length > 0
          ? "manual_required"
          : "refunding",
      decisionReason: input.note,
      decidedByAdminUserId: input.decidedBy?.id ?? null,
      decidedByAdminName: input.decidedBy?.name ?? null,
      refundableAtDecisionCents: refundableCents,
      approvedRefundCents,
      decidedAt: input.now,
      completedAt: completedImmediately ? input.now : null,
      updatedAt: input.now,
    })
    .where(eq(bookingCancellationCasesTable.id, input.cancellationCase.id));

  return {
    cancellationCaseId: input.cancellationCase.id,
    refundIds,
    manualRefundIds,
    completedImmediately,
    refundableAtDecisionCents: refundableCents,
  };
}

export type CancellationRequestResult =
  | {
      kind: "requested";
      bookingId: string;
      cancellationCaseId: string;
      alreadyRequested: boolean;
    }
  | {
      kind: "cancelled";
      bookingId: string;
      cancellationCaseId: string | null;
      alreadyCancelled: boolean;
      completed: boolean;
    };

export async function requestBookingCancellation(
  bookingId: string,
  reason?: string | null,
): Promise<CancellationRequestResult> {
  const normalizedReason =
    reason?.trim().slice(0, 1_000) || "Richiesta dal cliente";
  const result = await db.transaction(async (tx) => {
    const [booking] = await tx
      .select()
      .from(excursionBookingsTable)
      .where(eq(excursionBookingsTable.id, bookingId))
      .for("update")
      .limit(1);
    if (!booking) {
      throw new BookingCancellationError(
        "not_found",
        "Prenotazione non trovata.",
        404,
      );
    }
    if (booking.cancelledAt) {
      const [latestCase] = await tx
        .select({
          id: bookingCancellationCasesTable.id,
          status: bookingCancellationCasesTable.status,
        })
        .from(bookingCancellationCasesTable)
        .where(eq(bookingCancellationCasesTable.bookingId, booking.id))
        .orderBy(sql`${bookingCancellationCasesTable.createdAt} DESC`)
        .limit(1);
      return {
        kind: "cancelled" as const,
        bookingId: booking.id,
        cancellationCaseId: latestCase?.id ?? null,
        alreadyCancelled: true,
        completed:
          latestCase?.status === "completed" ||
          booking.cancellationRequestStatus === "completed",
      };
    }
    if (booking.cancellationRequestStatus === "pending") {
      const pendingCase = await latestPendingCancellationCaseInTransaction(
        tx,
        booking.id,
      );
      if (!pendingCase) {
        throw new BookingCancellationError(
          "financial_source_conflict",
          "La prenotazione indica una richiesta pendente senza il relativo caso amministrativo.",
          409,
        );
      }
      return {
        kind: "requested" as const,
        bookingId: booking.id,
        cancellationCaseId: pendingCase.id,
        alreadyRequested: true,
      };
    }

    const now = new Date();
    const cancellationCase = await ensureCancellationCaseInTransaction(tx, {
      booking,
      source: "customer",
      sourceKey: `customer-cancellation:${booking.id}:${randomUUID()}`,
      requestReason: normalizedReason,
      now,
      initialStatus: booking.amountPaidCents > 0 ? "pending" : "completed",
    });
    if (booking.amountPaidCents > 0) {
      await tx
        .update(excursionBookingsTable)
        .set({
          cancellationRequestedAt: now,
          cancellationRequestStatus: "pending",
          cancellationRequestReason: normalizedReason,
          cancellationDecisionAt: null,
          cancellationCompletedAt: null,
          cancellationResolutionNote: null,
          cancellationRefundAmountCents: null,
          cancellationPenaltyAmountCents: null,
          updatedAt: now,
        })
        .where(eq(excursionBookingsTable.id, booking.id));
      return {
        kind: "requested" as const,
        bookingId: booking.id,
        cancellationCaseId: cancellationCase.id,
        alreadyRequested: false,
      };
    }

    const { requests } = await loadRefundableSourcesInTransaction(tx, booking);
    const cleanup = await closeOpenPaymentWorkInTransaction(
      tx,
      booking,
      requests,
      new Set(),
      now,
    );
    await releaseBookingSeatsInTransaction(
      tx,
      booking.id,
      "customer_cancelled",
      now,
    );
    await tx
      .update(excursionBookingsTable)
      .set({
        cancelledAt: now,
        cancellationRequestedAt: now,
        cancellationRequestStatus: cleanup.cleanupScheduled
          ? "approved"
          : "completed",
        cancellationRequestReason: normalizedReason,
        cancellationDecisionAt: now,
        cancellationCompletedAt: cleanup.cleanupScheduled ? null : now,
        cancellationResolutionNote: null,
        cancellationRefundAmountCents: 0,
        cancellationPenaltyAmountCents: 0,
        updatedAt: now,
      })
      .where(eq(excursionBookingsTable.id, booking.id));
    await tx
      .update(bookingCancellationCasesTable)
      .set({
        status: cleanup.cleanupScheduled ? "refunding" : "completed",
        refundableAtDecisionCents: 0,
        approvedRefundCents: 0,
        decidedAt: now,
        completedAt: cleanup.cleanupScheduled ? null : now,
        updatedAt: now,
      })
      .where(eq(bookingCancellationCasesTable.id, cancellationCase.id));
    return {
      kind: "cancelled" as const,
      bookingId: booking.id,
      cancellationCaseId: cancellationCase.id,
      alreadyCancelled: false,
      completed: !cleanup.cleanupScheduled,
    };
  });

  // Ogni retry riprova l'enqueue: la dedupe key include il case e rende questa
  // operazione sicura anche dopo un crash tra commit e accodamento email.
  if (result.kind === "requested") {
    await dispatchCancellationRequestedEmailsV2(
      result.bookingId,
      result.cancellationCaseId,
    );
  }
  if (result.kind === "cancelled" && result.cancellationCaseId) {
    await dispatchBookingCancellationEmailV2(
      result.bookingId,
      result.completed ? "completed" : "approved",
      result.cancellationCaseId ?? undefined,
    );
  }
  return result;
}

export async function openAdminBookingCancellation(input: {
  bookingId: string;
  clientCommandId: string;
  reason?: string | null;
  actor: CancellationAdminActor;
}): Promise<{
  cancellationCaseId: string;
  status: string;
  alreadyOpen: boolean;
}> {
  const clientCommandId = input.clientCommandId.trim().toLowerCase();
  if (!UUID_PATTERN.test(clientCommandId)) {
    throw new BookingCancellationError(
      "invalid_command_id",
      "clientCommandId deve essere un UUID valido e stabile per il comando.",
    );
  }
  const reason =
    input.reason?.trim().slice(0, 1_000) || "Annullamento amministrativo";
  return db.transaction(async (tx) => {
    const [booking] = await tx
      .select()
      .from(excursionBookingsTable)
      .where(eq(excursionBookingsTable.id, input.bookingId))
      .for("update")
      .limit(1);
    if (!booking) {
      throw new BookingCancellationError(
        "not_found",
        "Prenotazione non trovata.",
        404,
      );
    }
    const sourceKey = adminCancellationSourceKey(booking.id, clientCommandId);

    const [existingCommand] = await tx
      .select()
      .from(bookingCancellationCasesTable)
      .where(eq(bookingCancellationCasesTable.sourceKey, sourceKey))
      .for("update")
      .limit(1);
    if (existingCommand) {
      if (
        existingCommand.bookingId !== booking.id ||
        existingCommand.source !== "admin"
      ) {
        throw new BookingCancellationError(
          "financial_source_conflict",
          "Il comando idempotente appartiene a un altro caso di annullamento.",
          409,
        );
      }
      return {
        cancellationCaseId: existingCommand.id,
        status: existingCommand.status,
        alreadyOpen: true,
      };
    }
    if (booking.cancelledAt) {
      throw new BookingCancellationError(
        "already_cancelled",
        "La prenotazione è già annullata.",
        409,
      );
    }
    const pendingCase = await latestPendingCancellationCaseInTransaction(
      tx,
      booking.id,
    );
    if (pendingCase) {
      throw new BookingCancellationError(
        "request_not_pending",
        `Esiste già un caso di annullamento in attesa (${pendingCase.id}).`,
        409,
      );
    }

    const now = new Date();
    const cancellationCase = await ensureCancellationCaseInTransaction(tx, {
      booking,
      source: "admin",
      sourceKey,
      requestReason: reason,
      now,
      openedBy: input.actor,
    });
    await tx
      .update(excursionBookingsTable)
      .set({
        cancellationRequestedAt: now,
        cancellationRequestStatus: "pending",
        cancellationRequestReason: reason,
        cancellationDecisionAt: null,
        cancellationCompletedAt: null,
        cancellationResolutionNote: null,
        cancellationRefundAmountCents: null,
        cancellationPenaltyAmountCents: null,
        updatedAt: now,
      })
      .where(eq(excursionBookingsTable.id, booking.id));
    return {
      cancellationCaseId: cancellationCase.id,
      status: cancellationCase.status,
      alreadyOpen: false,
    };
  });
}

async function catchUpConfirmationAfterCancellationRejection(
  bookingId: string,
): Promise<void> {
  // Fuori dalla transazione di decisione: il workflow può chiamare Stripe, ma
  // tutte le sue business key rendono sicuro il catch-up su retry del reject.
  // Il recovery granulare evita di rilanciare effetti su tutte le altre booking.
  await recoverConfirmedBookingWorkflow(bookingId);
}

export function cancellationResolutionResponseStatus(
  reconciliationCompleted: boolean,
): "approved" | "completed" {
  return reconciliationCompleted ? "completed" : "approved";
}

export async function resolveBookingCancellation(input: {
  bookingId: string;
  cancellationCaseId: string;
  decision: "approve" | "reject";
  refundAmountCents?: number;
  note?: string | null;
  actor: CancellationAdminActor;
}): Promise<{
  cancellationCaseId: string;
  status: "approved" | "rejected" | "completed";
  refundIds: string[];
  manualRefundIds: string[];
}> {
  const cancellationCaseId = input.cancellationCaseId.trim();
  if (!UUID_PATTERN.test(cancellationCaseId)) {
    throw new BookingCancellationError(
      "invalid_case_id",
      "Identificativo del caso di annullamento obbligatorio.",
    );
  }
  const note = input.note?.trim().slice(0, 2_000) || null;
  if (input.decision === "reject") {
    assertCancellationDecisionReason({ decision: "reject", note });
    const outcome = await db.transaction(async (tx) => {
      const [booking] = await tx
        .select()
        .from(excursionBookingsTable)
        .where(eq(excursionBookingsTable.id, input.bookingId))
        .for("update")
        .limit(1);
      if (!booking) {
        throw new BookingCancellationError(
          "not_found",
          "Prenotazione non trovata.",
          404,
        );
      }
      const cancellationCase = await cancellationCaseByIdInTransaction(
        tx,
        booking.id,
        cancellationCaseId,
      );
      if (!cancellationCase) {
        throw new BookingCancellationError(
          "not_found",
          "Caso di annullamento non trovato per la prenotazione.",
          404,
        );
      }
      if (cancellationCase.status === "rejected") {
        return {
          bookingId: booking.id,
          excursionId: booking.excursionId,
          cancellationCaseId: cancellationCase.id,
          alreadyResolved: true,
        };
      }
      if (booking.cancelledAt) {
        throw new BookingCancellationError(
          "already_cancelled",
          "La prenotazione è già annullata.",
          409,
        );
      }
      if (booking.cancellationRequestStatus !== "pending") {
        throw new BookingCancellationError(
          "request_not_pending",
          "Non esiste una richiesta di annullamento in attesa.",
          409,
        );
      }
      if (cancellationCase.status !== "pending") {
        throw new BookingCancellationError(
          "request_not_pending",
          "Il caso di annullamento indicato non è più in attesa.",
          409,
        );
      }
      const { refundableCents } = await loadRefundableSourcesInTransaction(
        tx,
        booking,
      );
      const now = new Date();
      await tx
        .update(excursionBookingsTable)
        .set({
          cancellationRequestStatus: "rejected",
          cancellationDecisionAt: now,
          cancellationCompletedAt: null,
          cancellationResolutionNote: note,
          cancellationRefundAmountCents: 0,
          cancellationPenaltyAmountCents: 0,
          updatedAt: now,
        })
        .where(eq(excursionBookingsTable.id, booking.id));
      await tx
        .update(bookingCancellationCasesTable)
        .set({
          status: "rejected",
          decisionReason: note,
          decidedByAdminUserId: input.actor.id,
          decidedByAdminName: input.actor.name,
          refundableAtDecisionCents: refundableCents,
          approvedRefundCents: 0,
          decidedAt: now,
          updatedAt: now,
        })
        .where(eq(bookingCancellationCasesTable.id, cancellationCase.id));
      return {
        bookingId: booking.id,
        excursionId: booking.excursionId,
        cancellationCaseId: cancellationCase.id,
        alreadyResolved: false,
      };
    });
    await catchUpConfirmationAfterCancellationRejection(outcome.bookingId);
    await dispatchBookingCancellationEmailV2(
      outcome.bookingId,
      "rejected",
      outcome.cancellationCaseId,
    );
    return {
      cancellationCaseId: outcome.cancellationCaseId,
      status: "rejected",
      refundIds: [],
      manualRefundIds: [],
    };
  }

  const approved = await db.transaction(async (tx) => {
    const [booking] = await tx
      .select()
      .from(excursionBookingsTable)
      .where(eq(excursionBookingsTable.id, input.bookingId))
      .for("update")
      .limit(1);
    if (!booking) {
      throw new BookingCancellationError(
        "not_found",
        "Prenotazione non trovata.",
        404,
      );
    }
    const cancellationCase = await cancellationCaseByIdInTransaction(
      tx,
      booking.id,
      cancellationCaseId,
    );
    if (!cancellationCase) {
      throw new BookingCancellationError(
        "not_found",
        "Caso di annullamento non trovato per la prenotazione.",
        404,
      );
    }
    if (booking.cancelledAt) {
      if (
        ["approved", "refunding", "manual_required", "completed"].includes(
          cancellationCase.status,
        )
      ) {
        if (
          input.refundAmountCents !== undefined &&
          cancellationCase.approvedRefundCents !== input.refundAmountCents
        ) {
          throw new BookingCancellationError(
            "financial_source_conflict",
            "Il caso è già stato approvato con un importo di rimborso diverso.",
            409,
          );
        }
        const refunds = await tx
          .select({
            id: paymentRefundsTable.id,
            provider: paymentRefundsTable.provider,
          })
          .from(paymentRefundsTable)
          .where(
            eq(paymentRefundsTable.cancellationCaseId, cancellationCase.id),
          )
          .orderBy(asc(paymentRefundsTable.createdAt));
        return {
          bookingId: booking.id,
          cancellationCaseId: cancellationCase.id,
          refundIds: refunds.map((refund) => refund.id),
          manualRefundIds: refunds
            .filter((refund) => refund.provider === "manual")
            .map((refund) => refund.id),
          completedImmediately: cancellationCase.status === "completed",
          alreadyApproved: true,
        };
      }
      throw new BookingCancellationError(
        "already_cancelled",
        "La prenotazione è già annullata.",
        409,
      );
    }
    if (
      booking.cancellationRequestStatus !== "pending" ||
      cancellationCase.status !== "pending"
    ) {
      throw new BookingCancellationError(
        "request_not_pending",
        "Il caso di annullamento indicato non è più in attesa.",
        409,
      );
    }
    const result = await approveCancellationInTransaction(tx, booking, {
      refundAmountCents: input.refundAmountCents,
      note,
      origin: cancellationCase.source as CancellationOrigin,
      cancellationCase,
      now: new Date(),
      decidedBy: input.actor,
    });
    return {
      bookingId: booking.id,
      ...result,
      alreadyApproved: false,
    };
  });

  await dispatchBookingCancellationEmailV2(
    approved.bookingId,
    "approved",
    approved.cancellationCaseId,
  );
  for (const refundId of approved.refundIds) {
    if (approved.manualRefundIds.includes(refundId)) continue;
    try {
      await processBookingRefund(refundId);
    } catch (error) {
      logger.warn(
        { err: error, refundId, bookingId: approved.bookingId },
        "Rimborso annullamento pianificato per retry",
      );
    }
  }
  const reconciled = await reconcileBookingCancellation(approved.bookingId);
  return {
    cancellationCaseId: approved.cancellationCaseId,
    // La riconciliazione rilegge refund, attempt e cleanup dopo l'esecuzione:
    // e l'unico stato autorevole. Il flag iniziale può essere superato da un PI
    // che vince la corsa e apre un rimborso compensativo.
    status: cancellationResolutionResponseStatus(reconciled.completed),
    refundIds: approved.refundIds,
    manualRefundIds: approved.manualRefundIds,
  };
}

export async function cancelExcursionWorkflow(excursionId: string): Promise<{
  alreadyCancelled: boolean;
  bookingsCancelled: number;
  refundsQueued: number;
  manualRefundsRequired: number;
}> {
  const outcome = await db.transaction(async (tx) => {
    // Primo giro: rispetta l'ordine globale booking -> excursion usato dai
    // pagamenti, evitando deadlock con una prenotazione già in corso.
    await tx
      .select({ id: excursionBookingsTable.id })
      .from(excursionBookingsTable)
      .where(
        and(
          eq(excursionBookingsTable.excursionId, excursionId),
          isNull(excursionBookingsTable.cancelledAt),
        ),
      )
      .orderBy(asc(excursionBookingsTable.id))
      .for("update");
    const [excursion] = await tx
      .select()
      .from(excursionsTable)
      .where(eq(excursionsTable.id, excursionId))
      .for("update")
      .limit(1);
    if (!excursion) {
      throw new BookingCancellationError("not_found", "Gita non trovata.", 404);
    }
    // Una creazione può aver inserito la booking mentre attendevamo il lock
    // sulla gita. Ora che la gita è bloccata nessuna nuova prenotazione può
    // superare il guard di capacità/stato: rileggiamo lo snapshot autorevole.
    const bookings = await tx
      .select()
      .from(excursionBookingsTable)
      .where(
        and(
          eq(excursionBookingsTable.excursionId, excursionId),
          isNull(excursionBookingsTable.cancelledAt),
        ),
      )
      .orderBy(asc(excursionBookingsTable.id))
      .for("update");
    const alreadyCancelled = excursion.status === "cancelled";
    if (alreadyCancelled && bookings.length === 0) {
      const existingCases = await tx
        .select({
          bookingId: bookingCancellationCasesTable.bookingId,
          cancellationCaseId: bookingCancellationCasesTable.id,
        })
        .from(bookingCancellationCasesTable)
        .where(
          and(
            eq(bookingCancellationCasesTable.excursionId, excursion.id),
            eq(bookingCancellationCasesTable.source, "excursion"),
          ),
        )
        .orderBy(asc(bookingCancellationCasesTable.createdAt));
      return {
        alreadyCancelled: true,
        bookingsProcessed: 0,
        bookingCases: existingCases,
        refundIds: [] as string[],
        manualRefundIds: [] as string[],
      };
    }
    if (["completed", "archived"].includes(excursion.status)) {
      throw new BookingCancellationError(
        "excursion_closed",
        "Una gita completata o archiviata non può essere annullata.",
        409,
      );
    }

    const bookingCases: Array<{
      bookingId: string;
      cancellationCaseId: string;
    }> = [];
    const refundIds: string[] = [];
    const manualRefundIds: string[] = [];
    const now = new Date();
    for (const booking of bookings) {
      // Una richiesta cliente ancora pendente viene superata dal comando
      // autorevole di annullamento della gita. Lasciarla pending bloccherebbe la
      // riconciliazione pur avendo già creato il caso a rimborso integrale.
      await tx
        .update(bookingCancellationCasesTable)
        .set({
          status: "superseded",
          decisionReason: "Superata dall'annullamento della gita.",
          approvedRefundCents: 0,
          decidedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(bookingCancellationCasesTable.bookingId, booking.id),
            eq(bookingCancellationCasesTable.status, "pending"),
            ne(bookingCancellationCasesTable.source, "excursion"),
          ),
        );
      const cancellationCase = await ensureCancellationCaseInTransaction(tx, {
        booking,
        source: "excursion",
        sourceKey: `excursion-cancellation:${excursion.id}:${booking.id}`,
        requestReason: "Annullamento della gita da parte dell'agenzia",
        now,
      });
      const result = await approveCancellationInTransaction(tx, booking, {
        note: "Gita annullata dall'agenzia: rimborso integrale degli importi incassati.",
        origin: "excursion",
        cancellationCase,
        now,
      });
      bookingCases.push({
        bookingId: booking.id,
        cancellationCaseId: result.cancellationCaseId,
      });
      refundIds.push(...result.refundIds);
      manualRefundIds.push(...result.manualRefundIds);
    }

    await tx
      .update(excursionsTable)
      .set({ status: "cancelled", updatedAt: now })
      .where(eq(excursionsTable.id, excursion.id));
    return {
      alreadyCancelled,
      bookingsProcessed: bookings.length,
      bookingCases,
      refundIds,
      manualRefundIds,
    };
  });

  if (outcome.bookingCases.length > 0) {
    await Promise.all(
      outcome.bookingCases.map(({ bookingId, cancellationCaseId }) =>
        dispatchBookingCancellationEmailV2(
          bookingId,
          "excursion_cancelled",
          cancellationCaseId,
        ),
      ),
    );
  }
  return {
    alreadyCancelled: outcome.alreadyCancelled,
    bookingsCancelled: outcome.bookingsProcessed,
    refundsQueued: outcome.refundIds.length,
    manualRefundsRequired: outcome.manualRefundIds.length,
  };
}

export async function reconcileCancellationCase(
  cancellationCaseId: string,
): Promise<{
  bookingId: string | null;
  completed: boolean;
  justCompleted: boolean;
  status: string | null;
}> {
  const snapshot = await db
    .select({ bookingId: bookingCancellationCasesTable.bookingId })
    .from(bookingCancellationCasesTable)
    .where(eq(bookingCancellationCasesTable.id, cancellationCaseId))
    .limit(1);
  const bookingId = snapshot[0]?.bookingId;
  if (!bookingId) {
    return {
      bookingId: null,
      completed: false,
      justCompleted: false,
      status: null,
    };
  }

  const outcome = await db.transaction(async (tx) => {
    // Ordine condiviso con pagamenti e cancellazioni: booking, poi record
    // finanziari/tecnici, infine la proiezione del caso.
    const [booking] = await tx
      .select()
      .from(excursionBookingsTable)
      .where(eq(excursionBookingsTable.id, bookingId))
      .for("update")
      .limit(1);
    if (!booking) {
      return {
        bookingId: null,
        completed: false,
        justCompleted: false,
        status: null,
      };
    }
    const [cancellationCase] = await tx
      .select()
      .from(bookingCancellationCasesTable)
      .where(
        and(
          eq(bookingCancellationCasesTable.id, cancellationCaseId),
          eq(bookingCancellationCasesTable.bookingId, booking.id),
        ),
      )
      .for("update")
      .limit(1);
    if (!cancellationCase) {
      return {
        bookingId: booking.id,
        completed: false,
        justCompleted: false,
        status: null,
      };
    }
    const wasCompleted = cancellationCase.status === "completed";
    if (
      cancellationCase.status === "pending" ||
      isTerminalCancellationCaseWithoutRefund(cancellationCase.status)
    ) {
      return {
        bookingId: booking.id,
        completed: false,
        justCompleted: false,
        status: cancellationCase.status,
      };
    }

    const refunds = await tx
      .select()
      .from(paymentRefundsTable)
      .where(eq(paymentRefundsTable.cancellationCaseId, cancellationCase.id))
      .for("update");
    const expected = Math.max(cancellationCase.approvedRefundCents ?? 0, 0);
    // Un refund compensativo nato da un PI che ha vinto la corsa col cleanup
    // può non appartenere al case, ma deve comunque concludersi prima di
    // dichiarare completato l'annullamento al cliente.
    const unresolvedBookingRefunds = await tx
      .select({ status: paymentRefundsTable.status })
      .from(paymentRefundsTable)
      .where(
        and(
          eq(paymentRefundsTable.bookingId, booking.id),
          ne(paymentRefundsTable.status, "succeeded"),
        ),
      )
      .for("update");
    const activeAttempts = await tx
      .select({ id: paymentAttemptsTable.id })
      .from(paymentAttemptsTable)
      .innerJoin(
        paymentRequestsTable,
        eq(paymentAttemptsTable.paymentRequestId, paymentRequestsTable.id),
      )
      .where(
        and(
          eq(paymentRequestsTable.bookingId, booking.id),
          openAttemptCondition(),
        ),
      )
      .for("update");
    const cleanupJobs = await tx
      .select({ status: stripeCleanupJobsTable.status })
      .from(stripeCleanupJobsTable)
      .where(
        and(
          eq(stripeCleanupJobsTable.bookingId, booking.id),
          inArray(stripeCleanupJobsTable.status, [
            "pending",
            "processing",
            "failed",
            "manual_required",
          ]),
        ),
      )
      .for("update");

    const reconciliationStatus = classifyCancellationReconciliation({
      expectedRefundCents: expected,
      caseRefunds: refunds,
      unresolvedBookingRefunds,
      activeAttemptsCount: activeAttempts.length,
      cleanupJobs,
    });
    if (reconciliationStatus !== "completed") {
      await tx
        .update(bookingCancellationCasesTable)
        .set({
          status: reconciliationStatus,
          completedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(bookingCancellationCasesTable.id, cancellationCase.id));
      if (wasCompleted) {
        await tx
          .update(excursionBookingsTable)
          .set({
            cancellationRequestStatus: "approved",
            cancellationCompletedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(excursionBookingsTable.id, booking.id));
      }
      return {
        bookingId: booking.id,
        completed: false,
        justCompleted: false,
        status: reconciliationStatus,
      };
    }

    if (wasCompleted) {
      return {
        bookingId: booking.id,
        completed: true,
        justCompleted: false,
        status: "completed",
      };
    }

    const refundedByRequest = new Map<string, number>();
    for (const refund of refunds) {
      if (!refund.paymentRequestId) continue;
      refundedByRequest.set(
        refund.paymentRequestId,
        (refundedByRequest.get(refund.paymentRequestId) ?? 0) +
          refund.amountCents,
      );
    }
    for (const [requestId, amountCents] of refundedByRequest) {
      const [request] = await tx
        .select()
        .from(paymentRequestsTable)
        .where(eq(paymentRequestsTable.id, requestId))
        .for("update")
        .limit(1);
      if (!request) continue;
      await tx
        .update(paymentRequestsTable)
        .set({
          status:
            amountCents >= request.amountCents
              ? "refunded"
              : "partially_refunded",
          updatedAt: new Date(),
        })
        .where(eq(paymentRequestsTable.id, request.id));
    }

    const allSucceededCancellationRefunds = await tx
      .select({ amountCents: paymentRefundsTable.amountCents })
      .from(paymentRefundsTable)
      .where(
        and(
          eq(paymentRefundsTable.bookingId, booking.id),
          eq(paymentRefundsTable.status, "succeeded"),
          or(
            like(paymentRefundsTable.reason, "customer_cancellation%"),
            like(paymentRefundsTable.reason, "excursion_cancellation%"),
          ),
        ),
      );
    const totalRefundedCents = allSucceededCancellationRefunds.reduce(
      (sum, refund) => sum + Math.max(refund.amountCents, 0),
      0,
    );
    const now = new Date();
    await tx
      .update(bookingCancellationCasesTable)
      .set({ status: "completed", completedAt: now, updatedAt: now })
      .where(eq(bookingCancellationCasesTable.id, cancellationCase.id));
    await tx
      .update(excursionBookingsTable)
      .set({
        cancellationRequestStatus: "completed",
        cancellationCompletedAt: now,
        paymentStatus:
          totalRefundedCents <= 0
            ? booking.paymentStatus
            : totalRefundedCents >= booking.amountPaidCents
              ? "refunded"
              : "partially_refunded",
        updatedAt: now,
      })
      .where(eq(excursionBookingsTable.id, booking.id));
    return {
      bookingId: booking.id,
      completed: true,
      justCompleted: !wasCompleted,
      status: "completed",
    };
  });
  if (outcome.completed && outcome.bookingId) {
    await dispatchBookingCancellationEmailV2(
      outcome.bookingId,
      "completed",
      cancellationCaseId,
    );
  }
  return outcome;
}

export async function reconcileBookingCancellation(
  bookingId: string,
): Promise<{ completed: boolean; justCompleted: boolean }> {
  const [cancellationCase] = await db
    .select({ id: bookingCancellationCasesTable.id })
    .from(bookingCancellationCasesTable)
    .where(
      and(
        eq(bookingCancellationCasesTable.bookingId, bookingId),
        inArray(bookingCancellationCasesTable.status, [
          "approved",
          "refunding",
          "manual_required",
          "completed",
        ]),
      ),
    )
    .orderBy(sql`${bookingCancellationCasesTable.createdAt} DESC`)
    .limit(1);
  if (!cancellationCase) return { completed: false, justCompleted: false };
  const result = await reconcileCancellationCase(cancellationCase.id);
  return {
    completed: result.completed,
    justCompleted: result.justCompleted,
  };
}

export async function reconcileCancellationForRefund(
  refundId: string,
): Promise<{ completed: boolean; justCompleted: boolean }> {
  const [refund] = await db
    .select({
      bookingId: paymentRefundsTable.bookingId,
      cancellationCaseId: paymentRefundsTable.cancellationCaseId,
    })
    .from(paymentRefundsTable)
    .where(eq(paymentRefundsTable.id, refundId))
    .limit(1);
  if (!refund) return { completed: false, justCompleted: false };
  if (refund.cancellationCaseId) {
    const result = await reconcileCancellationCase(refund.cancellationCaseId);
    return {
      completed: result.completed,
      justCompleted: result.justCompleted,
    };
  }
  return reconcileBookingCancellation(refund.bookingId);
}

export async function reconcileApprovedBookingCancellations(options?: {
  batchSize?: number;
}): Promise<{ checked: number; completed: number }> {
  const rows = await db
    .select({ id: bookingCancellationCasesTable.id })
    .from(bookingCancellationCasesTable)
    .where(
      inArray(bookingCancellationCasesTable.status, [
        "approved",
        "refunding",
        "manual_required",
      ]),
    )
    .orderBy(asc(bookingCancellationCasesTable.updatedAt))
    .limit(options?.batchSize ?? 100);
  let completed = 0;
  for (const row of rows) {
    const result = await reconcileCancellationCase(row.id);
    if (result.justCompleted) completed += 1;
  }
  return { checked: rows.length, completed };
}

export async function completeCancellationRefundManually(input: {
  refundId: string;
  reference: string;
}): Promise<{
  bookingId: string;
  cancellationCaseId: string;
  alreadyCompleted: boolean;
}> {
  const reference = input.reference.trim().slice(0, 500);
  if (!reference) {
    throw new BookingCancellationError(
      "refund_not_manual",
      "Inserisci il riferimento del rimborso effettuato.",
    );
  }
  const [snapshot] = await db
    .select({
      bookingId: paymentRefundsTable.bookingId,
    })
    .from(paymentRefundsTable)
    .where(eq(paymentRefundsTable.id, input.refundId))
    .limit(1);
  if (!snapshot) {
    throw new BookingCancellationError(
      "not_found",
      "Rimborso non trovato.",
      404,
    );
  }
  const outcome = await db.transaction(async (tx) => {
    // Ordine condiviso col worker e col riconciliatore: booking, case, refund.
    await tx
      .select({ id: excursionBookingsTable.id })
      .from(excursionBookingsTable)
      .where(eq(excursionBookingsTable.id, snapshot.bookingId))
      .for("update")
      .limit(1);
    const [currentRefundReference] = await tx
      .select({
        bookingId: paymentRefundsTable.bookingId,
        cancellationCaseId: paymentRefundsTable.cancellationCaseId,
      })
      .from(paymentRefundsTable)
      .where(eq(paymentRefundsTable.id, input.refundId))
      .limit(1);
    if (
      !currentRefundReference ||
      currentRefundReference.bookingId !== snapshot.bookingId
    ) {
      throw new BookingCancellationError(
        "not_found",
        "Rimborso non trovato.",
        404,
      );
    }
    if (currentRefundReference.cancellationCaseId) {
      await tx
        .select({ id: bookingCancellationCasesTable.id })
        .from(bookingCancellationCasesTable)
        .where(
          eq(
            bookingCancellationCasesTable.id,
            currentRefundReference.cancellationCaseId,
          ),
        )
        .for("update")
        .limit(1);
    }
    const [refund] = await tx
      .select()
      .from(paymentRefundsTable)
      .where(eq(paymentRefundsTable.id, input.refundId))
      .for("update")
      .limit(1);
    if (!refund) {
      throw new BookingCancellationError(
        "not_found",
        "Rimborso non trovato.",
        404,
      );
    }
    if (
      !refund.cancellationCaseId ||
      (!refund.reason.startsWith("customer_cancellation") &&
        !refund.reason.startsWith("excursion_cancellation"))
    ) {
      throw new BookingCancellationError(
        "refund_not_manual",
        "Il rimborso non appartiene a un annullamento amministrativo.",
        409,
      );
    }
    if (refund.status === "succeeded") {
      assertManualCompletionReference(refund.providerReference, reference);
      return {
        bookingId: refund.bookingId,
        cancellationCaseId: refund.cancellationCaseId,
        alreadyCompleted: true,
      };
    }
    if (refund.status !== "manual_required") {
      throw new BookingCancellationError(
        "refund_not_manual",
        "Il rimborso è ancora gestito automaticamente o non può essere chiuso manualmente.",
        409,
      );
    }
    await tx
      .update(paymentRefundsTable)
      .set({
        status: "succeeded",
        providerReference: reference,
        completedAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(paymentRefundsTable.id, refund.id));
    return {
      bookingId: refund.bookingId,
      cancellationCaseId: refund.cancellationCaseId,
      alreadyCompleted: false,
    };
  });
  await reconcileCancellationCase(outcome.cancellationCaseId);
  return outcome;
}
