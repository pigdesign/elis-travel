import { db } from "@workspace/db";
import {
  bookingCancellationCasesTable,
  emailOutboxTable,
  excursionBookingsTable,
  excursionsTable,
  paymentRequestsTable,
} from "@workspace/db/schema";
import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import { logger } from "../lib/logger";
import { getAdminNotificationEmails } from "./email.service";
import {
  dispatchBalanceRequestEmailV2,
  dispatchBookingCancellationEmailV2,
  dispatchBookingInstructionsEmailsV2,
  dispatchCancellationRequestedEmailsV2,
  dispatchCardSavedEmailV2,
  dispatchExcursionConfirmedEmailV2,
  dispatchNewBookingAdminEmailV2,
  dispatchPaymentActionRequiredEmailV2,
  dispatchPaymentReceivedEmailV2,
  type BookingCancellationEmailPhase,
} from "./excursion-booking-emails-v2";

const DEFAULT_RECONCILIATION_BATCH_SIZE = 100;

export type EmailOutboxReconciliationResult = {
  bookingCreated: number;
  instructions: number;
  cardSaved: number;
  excursionConfirmed: number;
  paymentReceived: number;
  balanceRequested: number;
  actionRequired: number;
  cancellations: number;
};

export function emptyEmailOutboxReconciliationResult(): EmailOutboxReconciliationResult {
  return {
    bookingCreated: 0,
    instructions: 0,
    cardSaved: 0,
    excursionConfirmed: 0,
    paymentReceived: 0,
    balanceRequested: 0,
    actionRequired: 0,
    cancellations: 0,
  };
}

function missingOutboxEntry(dedupeKey: ReturnType<typeof sql<string>>) {
  return notExists(
    db
      .select({ id: emailOutboxTable.id })
      .from(emailOutboxTable)
      .where(eq(emailOutboxTable.dedupeKey, dedupeKey)),
  );
}

function bookingKey(suffix: string): ReturnType<typeof sql<string>> {
  return sql<string>`'booking:' || ${excursionBookingsTable.id}::text || ${`:${suffix}`}`;
}

function requestKey(suffix: string): ReturnType<typeof sql<string>> {
  return sql<string>`'payment-request:' || ${paymentRequestsTable.id}::text || ${`:${suffix}`}`;
}

function cancellationKey(suffix: string): ReturnType<typeof sql<string>> {
  return sql<string>`'cancellation-case:' || ${bookingCancellationCasesTable.id}::text || ${`:${suffix}`}`;
}

function isLatestCancellationCase() {
  return sql<boolean>`not exists (
    select 1
    from booking_cancellation_cases newer_case
    where newer_case.booking_id = ${bookingCancellationCasesTable.bookingId}
      and (
        newer_case.created_at > ${bookingCancellationCasesTable.createdAt}
        or (
          newer_case.created_at = ${bookingCancellationCasesTable.createdAt}
          and newer_case.id > ${bookingCancellationCasesTable.id}
        )
      )
  )`;
}

function activeBookingConditions() {
  return [
    inArray(excursionBookingsTable.seatStatus, ["held", "confirmed"]),
    isNull(excursionBookingsTable.cancelledAt),
    or(
      isNull(excursionBookingsTable.cancellationRequestStatus),
      inArray(excursionBookingsTable.cancellationRequestStatus, [
        "rejected",
        "completed",
      ]),
    ),
  ] as const;
}

/**
 * Converte esclusivamente lo stato corrente, osservabile nel ledger, nella
 * comunicazione recuperabile. Non ricostruisce una cronologia intermedia: un
 * caso gia completato genera la comunicazione finale, non anche quella di
 * approvazione ormai superata.
 */
export function cancellationEmailPhaseForReconciliation(input: {
  status: string;
  source: string;
}): BookingCancellationEmailPhase | "requested" | null {
  if (input.status === "pending" && input.source === "customer") {
    return "requested";
  }
  if (input.status === "rejected") return "rejected";
  if (input.status === "completed") return "completed";
  if (["approved", "refunding", "manual_required"].includes(input.status)) {
    return input.source === "excursion" ? "excursion_cancelled" : "approved";
  }
  return null;
}

/**
 * Ripara il solo gap DB -> outbox. Ogni ricerca seleziona righe prive della
 * dedupe key canonica, quindi i batch progrediscono anche su archivi grandi e
 * un secondo passaggio non duplica gli eventi gia accodati.
 */
export async function reconcileMissingBookingEmails(opts?: {
  batchSize?: number;
}): Promise<EmailOutboxReconciliationResult> {
  const batchSize = Math.max(
    1,
    Math.min(opts?.batchSize ?? DEFAULT_RECONCILIATION_BATCH_SIZE, 500),
  );
  const result = emptyEmailOutboxReconciliationResult();

  const hasAdminRecipients = getAdminNotificationEmails().length > 0;
  const newBookings = hasAdminRecipients
    ? await db
        .select({ id: excursionBookingsTable.id })
        .from(excursionBookingsTable)
        .where(
          and(
            eq(excursionBookingsTable.workflowVersion, 3),
            ...activeBookingConditions(),
            missingOutboxEntry(bookingKey("created-admin:v2")),
          ),
        )
        .orderBy(asc(excursionBookingsTable.createdAt))
        .limit(batchSize)
    : [];
  for (const booking of newBookings) {
    await dispatchNewBookingAdminEmailV2(booking.id);
    result.bookingCreated += 1;
  }

  const instructionBookings = await db
    .select({ id: excursionBookingsTable.id })
    .from(excursionBookingsTable)
    .where(
      and(
        eq(excursionBookingsTable.workflowVersion, 3),
        eq(excursionBookingsTable.customerNotificationsEnabled, true),
        isNotNull(excursionBookingsTable.email),
        inArray(excursionBookingsTable.paymentStatus, [
          "deposit_requested",
          "full_requested",
        ]),
        inArray(excursionBookingsTable.paymentMethod, [
          "bank_transfer",
          "office",
        ]),
        ...activeBookingConditions(),
        missingOutboxEntry(bookingKey("instructions:v2")),
      ),
    )
    .orderBy(asc(excursionBookingsTable.createdAt))
    .limit(batchSize);
  for (const booking of instructionBookings) {
    await dispatchBookingInstructionsEmailsV2(booking.id);
    result.instructions += 1;
  }

  const savedCards = await db
    .select({ id: excursionBookingsTable.id })
    .from(excursionBookingsTable)
    .where(
      and(
        eq(excursionBookingsTable.workflowVersion, 3),
        eq(excursionBookingsTable.customerNotificationsEnabled, true),
        isNotNull(excursionBookingsTable.email),
        eq(excursionBookingsTable.paymentStatus, "card_saved"),
        eq(excursionBookingsTable.paymentMethod, "card"),
        ...activeBookingConditions(),
        missingOutboxEntry(bookingKey("card-saved:v2")),
      ),
    )
    .orderBy(asc(excursionBookingsTable.createdAt))
    .limit(batchSize);
  for (const booking of savedCards) {
    await dispatchCardSavedEmailV2(booking.id);
    result.cardSaved += 1;
  }

  const confirmedBookings = await db
    .select({ id: excursionBookingsTable.id })
    .from(excursionBookingsTable)
    .innerJoin(
      excursionsTable,
      eq(excursionBookingsTable.excursionId, excursionsTable.id),
    )
    .where(
      and(
        eq(excursionBookingsTable.workflowVersion, 3),
        eq(excursionBookingsTable.customerNotificationsEnabled, true),
        isNotNull(excursionBookingsTable.email),
        eq(excursionsTable.status, "confirmed"),
        isNotNull(excursionsTable.confirmedAt),
        lte(excursionBookingsTable.bookedAt, excursionsTable.confirmedAt),
        ...activeBookingConditions(),
        missingOutboxEntry(bookingKey("excursion-confirmed:v2")),
      ),
    )
    .orderBy(asc(excursionBookingsTable.createdAt))
    .limit(batchSize);
  for (const booking of confirmedBookings) {
    await dispatchExcursionConfirmedEmailV2(booking.id);
    result.excursionConfirmed += 1;
  }

  const missingCustomerReceipt = and(
    eq(excursionBookingsTable.customerNotificationsEnabled, true),
    isNotNull(excursionBookingsTable.email),
    missingOutboxEntry(requestKey("payment-received-customer:v2")),
  );
  const missingReceipt = hasAdminRecipients
    ? or(
        missingCustomerReceipt,
        and(
          eq(paymentRequestsTable.method, "card"),
          missingOutboxEntry(requestKey("payment-received-admin:v2")),
        ),
      )
    : missingCustomerReceipt;

  const paidRequests = await db
    .select({
      id: paymentRequestsTable.id,
      bookingId: paymentRequestsTable.bookingId,
      type: paymentRequestsTable.type,
      method: paymentRequestsTable.method,
      customerNotificationsEnabled:
        excursionBookingsTable.customerNotificationsEnabled,
    })
    .from(paymentRequestsTable)
    .innerJoin(
      excursionBookingsTable,
      eq(paymentRequestsTable.bookingId, excursionBookingsTable.id),
    )
    .where(
      and(
        eq(excursionBookingsTable.workflowVersion, 3),
        eq(paymentRequestsTable.status, "paid"),
        missingReceipt,
      ),
    )
    .orderBy(asc(paymentRequestsTable.createdAt))
    .limit(batchSize);
  for (const request of paidRequests) {
    // Il dispatcher usa la request esplicita quando disponibile (il terzo
    // argomento e retrocompatibile durante il rollout del refactor).
    await dispatchPaymentReceivedEmailV2(
      request.bookingId,
      request.type,
      request.id,
    );
    result.paymentReceived += 1;
  }

  const balanceRequests = await db
    .select({
      id: paymentRequestsTable.id,
      bookingId: paymentRequestsTable.bookingId,
    })
    .from(paymentRequestsTable)
    .innerJoin(
      excursionBookingsTable,
      eq(paymentRequestsTable.bookingId, excursionBookingsTable.id),
    )
    .where(
      and(
        eq(excursionBookingsTable.workflowVersion, 3),
        eq(excursionBookingsTable.customerNotificationsEnabled, true),
        isNotNull(excursionBookingsTable.email),
        eq(paymentRequestsTable.type, "balance"),
        eq(paymentRequestsTable.status, "pending"),
        ...activeBookingConditions(),
        missingOutboxEntry(
          requestKey("balance-requested-customer:v2"),
        ),
        missingOutboxEntry(bookingKey("balance-requested:v2")),
      ),
    )
    .orderBy(asc(paymentRequestsTable.createdAt))
    .limit(batchSize);
  for (const request of balanceRequests) {
    await dispatchBalanceRequestEmailV2(request.bookingId, request.id);
    result.balanceRequested += 1;
  }

  const missingCustomerActionRequired = and(
    eq(excursionBookingsTable.customerNotificationsEnabled, true),
    isNotNull(excursionBookingsTable.email),
    missingOutboxEntry(requestKey("payment-action-required-customer:v2")),
  );
  const missingActionRequired = hasAdminRecipients
    ? or(
        missingCustomerActionRequired,
        missingOutboxEntry(requestKey("payment-action-required-admin:v2")),
      )
    : missingCustomerActionRequired;

  const actionRequiredRequests = await db
    .select({
      id: paymentRequestsTable.id,
      bookingId: paymentRequestsTable.bookingId,
      type: paymentRequestsTable.type,
    })
    .from(paymentRequestsTable)
    .innerJoin(
      excursionBookingsTable,
      eq(paymentRequestsTable.bookingId, excursionBookingsTable.id),
    )
    .where(
      and(
        eq(excursionBookingsTable.workflowVersion, 3),
        eq(paymentRequestsTable.status, "action_required"),
        ...activeBookingConditions(),
        missingActionRequired,
      ),
    )
    .orderBy(asc(paymentRequestsTable.createdAt))
    .limit(batchSize);
  for (const request of actionRequiredRequests) {
    await dispatchPaymentActionRequiredEmailV2(
      request.bookingId,
      request.type,
      request.id,
    );
    result.actionRequired += 1;
  }

  const requestedCancellationCases = await db
    .select({
      id: bookingCancellationCasesTable.id,
      bookingId: bookingCancellationCasesTable.bookingId,
      source: bookingCancellationCasesTable.source,
      status: bookingCancellationCasesTable.status,
    })
    .from(bookingCancellationCasesTable)
    .innerJoin(
      excursionBookingsTable,
      eq(bookingCancellationCasesTable.bookingId, excursionBookingsTable.id),
    )
    .where(
      and(
        eq(excursionBookingsTable.workflowVersion, 3),
        eq(excursionBookingsTable.customerNotificationsEnabled, true),
        isNotNull(excursionBookingsTable.email),
        eq(bookingCancellationCasesTable.source, "customer"),
        eq(bookingCancellationCasesTable.status, "pending"),
        isLatestCancellationCase(),
        hasAdminRecipients
          ? or(
              missingOutboxEntry(cancellationKey("requested-customer:v2")),
              missingOutboxEntry(cancellationKey("requested-admin:v2")),
            )
          : missingOutboxEntry(cancellationKey("requested-customer:v2")),
      ),
    )
    .orderBy(asc(bookingCancellationCasesTable.createdAt))
    .limit(batchSize);
  for (const cancellationCase of requestedCancellationCases) {
    await dispatchCancellationRequestedEmailsV2(
      cancellationCase.bookingId,
      cancellationCase.id,
    );
    result.cancellations += 1;
  }

  const rejectedCancellationCases = await db
    .select({
      id: bookingCancellationCasesTable.id,
      bookingId: bookingCancellationCasesTable.bookingId,
    })
    .from(bookingCancellationCasesTable)
    .innerJoin(
      excursionBookingsTable,
      eq(bookingCancellationCasesTable.bookingId, excursionBookingsTable.id),
    )
    .where(
      and(
        eq(excursionBookingsTable.workflowVersion, 3),
        eq(excursionBookingsTable.customerNotificationsEnabled, true),
        isNotNull(excursionBookingsTable.email),
        eq(bookingCancellationCasesTable.status, "rejected"),
        isLatestCancellationCase(),
        missingOutboxEntry(cancellationKey("rejected:customer:v2")),
      ),
    )
    .orderBy(asc(bookingCancellationCasesTable.createdAt))
    .limit(batchSize);
  for (const cancellationCase of rejectedCancellationCases) {
    await dispatchBookingCancellationEmailV2(
      cancellationCase.bookingId,
      "rejected",
      cancellationCase.id,
    );
    result.cancellations += 1;
  }

  const approvedCustomerCancellationCases = await db
    .select({
      id: bookingCancellationCasesTable.id,
      bookingId: bookingCancellationCasesTable.bookingId,
    })
    .from(bookingCancellationCasesTable)
    .innerJoin(
      excursionBookingsTable,
      eq(bookingCancellationCasesTable.bookingId, excursionBookingsTable.id),
    )
    .where(
      and(
        eq(excursionBookingsTable.workflowVersion, 3),
        eq(excursionBookingsTable.customerNotificationsEnabled, true),
        isNotNull(excursionBookingsTable.email),
        ne(bookingCancellationCasesTable.source, "excursion"),
        inArray(bookingCancellationCasesTable.status, [
          "approved",
          "refunding",
          "manual_required",
        ]),
        isLatestCancellationCase(),
        missingOutboxEntry(cancellationKey("approved:customer:v2")),
      ),
    )
    .orderBy(asc(bookingCancellationCasesTable.createdAt))
    .limit(batchSize);
  for (const cancellationCase of approvedCustomerCancellationCases) {
    await dispatchBookingCancellationEmailV2(
      cancellationCase.bookingId,
      "approved",
      cancellationCase.id,
    );
    result.cancellations += 1;
  }

  const approvedExcursionCancellationCases = await db
    .select({
      id: bookingCancellationCasesTable.id,
      bookingId: bookingCancellationCasesTable.bookingId,
    })
    .from(bookingCancellationCasesTable)
    .innerJoin(
      excursionBookingsTable,
      eq(bookingCancellationCasesTable.bookingId, excursionBookingsTable.id),
    )
    .where(
      and(
        eq(excursionBookingsTable.workflowVersion, 3),
        eq(excursionBookingsTable.customerNotificationsEnabled, true),
        isNotNull(excursionBookingsTable.email),
        eq(bookingCancellationCasesTable.source, "excursion"),
        inArray(bookingCancellationCasesTable.status, [
          "approved",
          "refunding",
          "manual_required",
        ]),
        isLatestCancellationCase(),
        missingOutboxEntry(cancellationKey("excursion_cancelled:customer:v2")),
      ),
    )
    .orderBy(asc(bookingCancellationCasesTable.createdAt))
    .limit(batchSize);
  for (const cancellationCase of approvedExcursionCancellationCases) {
    await dispatchBookingCancellationEmailV2(
      cancellationCase.bookingId,
      "excursion_cancelled",
      cancellationCase.id,
    );
    result.cancellations += 1;
  }

  const completedCancellationCases = await db
    .select({
      id: bookingCancellationCasesTable.id,
      bookingId: bookingCancellationCasesTable.bookingId,
    })
    .from(bookingCancellationCasesTable)
    .innerJoin(
      excursionBookingsTable,
      eq(bookingCancellationCasesTable.bookingId, excursionBookingsTable.id),
    )
    .where(
      and(
        eq(excursionBookingsTable.workflowVersion, 3),
        eq(excursionBookingsTable.customerNotificationsEnabled, true),
        isNotNull(excursionBookingsTable.email),
        eq(bookingCancellationCasesTable.status, "completed"),
        isLatestCancellationCase(),
        missingOutboxEntry(cancellationKey("completed:customer:v2")),
      ),
    )
    .orderBy(asc(bookingCancellationCasesTable.createdAt))
    .limit(batchSize);
  for (const cancellationCase of completedCancellationCases) {
    await dispatchBookingCancellationEmailV2(
      cancellationCase.bookingId,
      "completed",
      cancellationCase.id,
    );
    result.cancellations += 1;
  }

  const recovered = Object.values(result).reduce(
    (sum, value) => sum + value,
    0,
  );
  if (recovered > 0) {
    logger.info(
      { emailOutboxReconciliation: result },
      "Outbox email riconciliata",
    );
  }
  return result;
}
