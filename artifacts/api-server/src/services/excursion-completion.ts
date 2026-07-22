import { db } from "@workspace/db";
import {
  bookingCancellationCasesTable,
  bookingParticipantsTable,
  excursionBookingsTable,
  paymentAttemptsTable,
  paymentRefundsTable,
  paymentRequestsTable,
  stripeCleanupJobsTable,
} from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type CompletionParticipantSnapshot = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  dataCompleted: boolean;
};

export type CompletionPaymentRequestSnapshot = {
  id: string;
  type: string;
  status: string;
  amountCents: number;
};

export type CompletionRefundSnapshot = {
  id: string;
  status: string;
  amountCents: number;
};

export type CompletionPaymentAttemptSnapshot = {
  id: string;
  status: string;
  stripePaymentIntentId: string | null;
};

export type CompletionCancellationCaseSnapshot = {
  id: string;
  status: string;
};

export type CompletionStripeCleanupSnapshot = {
  id: string;
  status: string;
  operation: string;
};

export type CompletionBookingSnapshot = {
  id: string;
  bookingCode: string | null;
  cancelledAt: Date | null;
  seatStatus: string;
  seats: number;
  workflowVersion: number;
  paymentStatus: string;
  totalAmountCents: number | null;
  amountPaidCents: number;
  cancellationRequestStatus: string | null;
  participants: CompletionParticipantSnapshot[];
  paymentRequests: CompletionPaymentRequestSnapshot[];
  paymentAttempts: CompletionPaymentAttemptSnapshot[];
  refunds: CompletionRefundSnapshot[];
  cancellationCases: CompletionCancellationCaseSnapshot[];
  stripeCleanupJobs: CompletionStripeCleanupSnapshot[];
};

export type ExcursionCompletionIssue = {
  code:
    | "OUTSTANDING_BALANCE"
    | "PAYMENT_STATUS_OPEN"
    | "PAYMENT_REQUEST_OPEN"
    | "PAYMENT_ATTEMPT_OPEN"
    | "CANCELLATION_PENDING"
    | "CANCELLATION_CASE_OPEN"
    | "REFUND_REQUIRED"
    | "REFUND_INCOMPLETE"
    | "STRIPE_CLEANUP_OPEN"
    | "PARTICIPANT_DETAILS_MISSING"
    | "PARTICIPANT_COUNT_MISMATCH"
    | "PARTICIPANT_DATA_INCOMPLETE";
  message: string;
  amountCents?: number;
  requestIds?: string[];
  attemptIds?: string[];
  refundIds?: string[];
  cancellationCaseIds?: string[];
  cleanupJobIds?: string[];
  participantIds?: string[];
};

export type ExcursionCompletionBlocker = {
  bookingId: string;
  bookingCode: string | null;
  issues: ExcursionCompletionIssue[];
};

const ECONOMICALLY_CLOSED_BOOKING_STATUSES = new Set(["paid", "refunded"]);
const ECONOMICALLY_CLOSED_REQUEST_STATUSES = new Set([
  "paid",
  "cancelled",
  "refunded",
]);

/**
 * Classifica esclusivamente snapshot gia caricati. La funzione e pura per
 * poter verificare il contratto di chiusura senza dipendere dal database.
 * Le prenotazioni cancellate non fanno parte dell'operativita della gita.
 */
export function classifyExcursionCompletionBlockers(
  bookings: CompletionBookingSnapshot[],
): ExcursionCompletionBlocker[] {
  const blockers: ExcursionCompletionBlocker[] = [];

  for (const booking of bookings) {
    const issues: ExcursionCompletionIssue[] = [];
    const administrativelyInactive =
      Boolean(booking.cancelledAt) || booking.seatStatus === "released";

    // Le prenotazioni cancellate o i cui posti sono gia stati rilasciati non
    // appartengono piu alla lista operativa: saldo, richieste scadute e dati
    // partecipanti non devono impedire la chiusura. Restano pero vincolanti le
    // attivita di annullamento/rimborso ancora aperte.
    const openCancellationCases = booking.cancellationCases.filter(
      (cancellationCase) =>
    !["completed", "rejected", "superseded"].includes(
      cancellationCase.status,
    ),
    );
    if (openCancellationCases.length > 0) {
      issues.push({
        code: "CANCELLATION_CASE_OPEN",
        message: `${openCancellationCases.length} caso/i di annullamento non conclusi.`,
        cancellationCaseIds: openCancellationCases.map(
          (cancellationCase) => cancellationCase.id,
        ),
      });
    } else if (
      ["pending", "approved"].includes(
        booking.cancellationRequestStatus ?? "",
      )
    ) {
      issues.push({
        code: "CANCELLATION_PENDING",
        message: "L'annullamento della prenotazione non e ancora concluso.",
      });
    }

    const openCleanupJobs = booking.stripeCleanupJobs.filter(
      (job) => job.status !== "succeeded",
    );
    if (openCleanupJobs.length > 0) {
      issues.push({
        code: "STRIPE_CLEANUP_OPEN",
        message: `${openCleanupJobs.length} operazione/i di cleanup Stripe non concluse.`,
        cleanupJobIds: openCleanupJobs.map((job) => job.id),
      });
    }

    const openPaymentAttempts = booking.paymentAttempts.filter(
      (attempt) =>
        [
          "pending",
          "processing",
          "action_required",
          "cancellation_pending",
        ].includes(attempt.status) ||
        (attempt.status === "failed" &&
          Boolean(attempt.stripePaymentIntentId)),
    );
    if (openPaymentAttempts.length > 0) {
      issues.push({
        code: "PAYMENT_ATTEMPT_OPEN",
        message: `${openPaymentAttempts.length} tentativo/i di pagamento Stripe non conclusi.`,
        attemptIds: openPaymentAttempts.map((attempt) => attempt.id),
      });
    }

    const refundRequiredRequests = booking.paymentRequests.filter(
      (request) => request.status === "refund_required",
    );
    if (
      booking.paymentStatus === "refund_required" ||
      refundRequiredRequests.length > 0
    ) {
      issues.push({
        code: "REFUND_REQUIRED",
        message:
          refundRequiredRequests.length > 0
            ? `${refundRequiredRequests.length} richiesta/e di pagamento richiedono un rimborso.`
            : "La prenotazione richiede un rimborso.",
        requestIds: refundRequiredRequests.map((request) => request.id),
      });
    }

    const incompleteRefunds = booking.refunds.filter(
      (refund) => refund.status !== "succeeded",
    );
    if (incompleteRefunds.length > 0) {
      issues.push({
        code: "REFUND_INCOMPLETE",
        message: `${incompleteRefunds.length} rimborso/i non conclusi.`,
        amountCents: incompleteRefunds.reduce(
          (sum, refund) => sum + Math.max(0, refund.amountCents),
          0,
        ),
        refundIds: incompleteRefunds.map((refund) => refund.id),
      });
    }

    if (administrativelyInactive) {
      if (issues.length > 0) {
        blockers.push({
          bookingId: booking.id,
          bookingCode: booking.bookingCode,
          issues,
        });
      }
      continue;
    }

    const total = booking.totalAmountCents;
    const paid = Math.max(0, booking.amountPaidCents);

    if (total !== null && paid < total) {
      const residual = total - paid;
      issues.push({
        code: "OUTSTANDING_BALANCE",
        message: `Saldo residuo di ${(residual / 100).toFixed(2)} EUR.`,
        amountCents: residual,
      });
    }

    if (
      booking.paymentStatus !== "refund_required" &&
      !ECONOMICALLY_CLOSED_BOOKING_STATUSES.has(booking.paymentStatus)
    ) {
      issues.push({
        code: "PAYMENT_STATUS_OPEN",
        message: `Stato pagamento non chiuso: ${booking.paymentStatus}.`,
      });
    }

    const openRequests = booking.paymentRequests.filter(
      (request) =>
        !ECONOMICALLY_CLOSED_REQUEST_STATUSES.has(request.status),
    );
    if (openRequests.length > 0) {
      const ordinaryOpen = openRequests.filter(
        (request) => request.status !== "refund_required",
      );
      if (ordinaryOpen.length > 0) {
        issues.push({
          code: "PAYMENT_REQUEST_OPEN",
          message: `${ordinaryOpen.length} richiesta/e di pagamento non concluse.`,
          amountCents: ordinaryOpen.reduce(
            (sum, request) => sum + Math.max(0, request.amountCents),
            0,
          ),
          requestIds: ordinaryOpen.map((request) => request.id),
        });
      }
    }

    if (booking.participants.length === 0) {
      issues.push({
        code: "PARTICIPANT_DETAILS_MISSING",
        message:
          "Mancano le righe anagrafiche dei partecipanti (prenotazione legacy o dati non acquisiti).",
      });
    } else {
      if (booking.participants.length !== booking.seats) {
        issues.push({
          code: "PARTICIPANT_COUNT_MISMATCH",
          message: `Partecipanti dettagliati ${booking.participants.length}, posti prenotati ${booking.seats}.`,
        });
      }

      const incompleteParticipants = booking.participants.filter(
        (participant) =>
          !participant.dataCompleted ||
          !participant.firstName?.trim() ||
          !participant.lastName?.trim(),
      );
      if (incompleteParticipants.length > 0) {
        issues.push({
          code: "PARTICIPANT_DATA_INCOMPLETE",
          message: `${incompleteParticipants.length} partecipante/i hanno dati anagrafici incompleti.`,
          participantIds: incompleteParticipants.map(
            (participant) => participant.id,
          ),
        });
      }
    }

    if (issues.length > 0) {
      blockers.push({
        bookingId: booking.id,
        bookingCode: booking.bookingCode,
        issues,
      });
    }
  }

  return blockers;
}

/**
 * Carica un'istantanea coerente delle prenotazioni attive mentre la route
 * mantiene il lock sulla gita. Non considera l'email outbox: un problema di
 * consegna non e un vincolo amministrativo alla chiusura.
 */
export async function getExcursionCompletionBlockersInTransaction(
  tx: Tx,
  excursionId: string,
): Promise<ExcursionCompletionBlocker[]> {
  const bookings = await tx
    .select({
      id: excursionBookingsTable.id,
      bookingCode: excursionBookingsTable.bookingCode,
      cancelledAt: excursionBookingsTable.cancelledAt,
      seatStatus: excursionBookingsTable.seatStatus,
      seats: excursionBookingsTable.seats,
      workflowVersion: excursionBookingsTable.workflowVersion,
      paymentStatus: excursionBookingsTable.paymentStatus,
      totalAmountCents: excursionBookingsTable.totalAmountCents,
      amountPaidCents: excursionBookingsTable.amountPaidCents,
      cancellationRequestStatus:
        excursionBookingsTable.cancellationRequestStatus,
    })
    .from(excursionBookingsTable)
    .where(
      eq(excursionBookingsTable.excursionId, excursionId),
    );

  if (bookings.length === 0) return [];

  const bookingIds = bookings.map((booking) => booking.id);
  const participants = await tx
    .select({
      id: bookingParticipantsTable.id,
      bookingId: bookingParticipantsTable.bookingId,
      firstName: bookingParticipantsTable.firstName,
      lastName: bookingParticipantsTable.lastName,
      dataCompleted: bookingParticipantsTable.dataCompleted,
    })
    .from(bookingParticipantsTable)
    .where(inArray(bookingParticipantsTable.bookingId, bookingIds));
  const requests = await tx
    .select({
      id: paymentRequestsTable.id,
      bookingId: paymentRequestsTable.bookingId,
      type: paymentRequestsTable.type,
      status: paymentRequestsTable.status,
      amountCents: paymentRequestsTable.amountCents,
    })
    .from(paymentRequestsTable)
    .where(inArray(paymentRequestsTable.bookingId, bookingIds));
  const attempts = await tx
    .select({
      id: paymentAttemptsTable.id,
      status: paymentAttemptsTable.status,
      stripePaymentIntentId: paymentAttemptsTable.stripePaymentIntentId,
      bookingId: paymentRequestsTable.bookingId,
    })
    .from(paymentAttemptsTable)
    .innerJoin(
      paymentRequestsTable,
      eq(paymentAttemptsTable.paymentRequestId, paymentRequestsTable.id),
    )
    .where(inArray(paymentRequestsTable.bookingId, bookingIds));
  const refunds = await tx
    .select({
      id: paymentRefundsTable.id,
      bookingId: paymentRefundsTable.bookingId,
      status: paymentRefundsTable.status,
      amountCents: paymentRefundsTable.amountCents,
    })
    .from(paymentRefundsTable)
    .where(inArray(paymentRefundsTable.bookingId, bookingIds));
  const cancellationCases = await tx
    .select({
      id: bookingCancellationCasesTable.id,
      bookingId: bookingCancellationCasesTable.bookingId,
      status: bookingCancellationCasesTable.status,
    })
    .from(bookingCancellationCasesTable)
    .where(inArray(bookingCancellationCasesTable.bookingId, bookingIds));
  const stripeCleanupJobs = await tx
    .select({
      id: stripeCleanupJobsTable.id,
      bookingId: stripeCleanupJobsTable.bookingId,
      status: stripeCleanupJobsTable.status,
      operation: stripeCleanupJobsTable.operation,
    })
    .from(stripeCleanupJobsTable)
    .where(inArray(stripeCleanupJobsTable.bookingId, bookingIds));

  return classifyExcursionCompletionBlockers(
    bookings.map((booking) => ({
      ...booking,
      participants: participants
        .filter((participant) => participant.bookingId === booking.id)
        .map(({ bookingId: _bookingId, ...participant }) => participant),
      paymentRequests: requests
        .filter((request) => request.bookingId === booking.id)
        .map(({ bookingId: _bookingId, ...request }) => request),
      paymentAttempts: attempts
        .filter((attempt) => attempt.bookingId === booking.id)
        .map(({ bookingId: _bookingId, ...attempt }) => attempt),
      refunds: refunds
        .filter((refund) => refund.bookingId === booking.id)
        .map(({ bookingId: _bookingId, ...refund }) => refund),
      cancellationCases: cancellationCases
        .filter(
          (cancellationCase) => cancellationCase.bookingId === booking.id,
        )
        .map(({ bookingId: _bookingId, ...cancellationCase }) =>
          cancellationCase,
        ),
      stripeCleanupJobs: stripeCleanupJobs
        .filter((job) => job.bookingId === booking.id)
        .map(({ bookingId: _bookingId, ...job }) => job),
    })),
  );
}
