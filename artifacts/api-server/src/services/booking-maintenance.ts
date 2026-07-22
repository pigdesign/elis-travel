import { db } from "@workspace/db";
import {
  excursionBookingsTable,
  paymentAttemptsTable,
  paymentRequestsTable,
} from "@workspace/db/schema";
import { and, eq, inArray, isNull, lte, ne, notInArray, or } from "drizzle-orm";
import { logger } from "../lib/logger";
import { processEmailOutboxBatch } from "./email-outbox";
import {
  emptyEmailOutboxReconciliationResult,
  reconcileMissingBookingEmails,
} from "./email-outbox-reconciliation";
import { releaseBookingSeatsInTransaction } from "./seat-reservations";
import { dispatchBalanceReminderEmailV2 } from "./excursion-booking-emails-v2";
import {
  enqueueStripeCleanupJobInTransaction,
  processStripeCleanupBatch,
} from "./stripe-cleanup";
import { processDueBookingRefunds } from "./booking-refunds";
import { reconcileApprovedBookingCancellations } from "./booking-cancellations";

const DEFAULT_INTERVAL_MS = 30_000;
const EXPIRY_BATCH_SIZE = 100;

/**
 * I reminder sono automazioni operative, quindi restano fail-closed finche
 * l'amministrazione non ne approva esplicitamente l'attivazione. Recovery
 * finanziario, riconciliazione outbox e consegna delle email gia dovute non
 * dipendono da questo interruttore.
 */
export function automaticBalanceRemindersEnabled(
  configured = process.env.BOOKING_AUTOMATIC_REMINDERS_ENABLED,
): boolean {
  return configured === "true";
}

export async function expireAbandonedCardBookings(
  now: Date = new Date(),
): Promise<{ expired: number; releasedSeats: number }> {
  const outcome = await db.transaction(async (tx) => {
    const overdue = await tx
      .select({
        id: excursionBookingsTable.id,
        stripePaymentIntentId: excursionBookingsTable.stripePaymentIntentId,
        stripeSetupIntentId: excursionBookingsTable.stripeSetupIntentId,
        stripeCustomerId: excursionBookingsTable.stripeCustomerId,
      })
      .from(excursionBookingsTable)
      .where(
        and(
          inArray(excursionBookingsTable.paymentStatus, [
            "pending_card",
            "card_setup_pending",
          ]),
          eq(excursionBookingsTable.amountPaidCents, 0),
          eq(excursionBookingsTable.seatStatus, "held"),
          isNull(excursionBookingsTable.cancelledAt),
          or(
            isNull(excursionBookingsTable.cancellationRequestStatus),
            notInArray(excursionBookingsTable.cancellationRequestStatus, [
              "pending",
              "approved",
            ]),
          ),
          lte(excursionBookingsTable.seatHoldExpiresAt, now),
        ),
      )
      .limit(EXPIRY_BATCH_SIZE)
      .for("update", { skipLocked: true });

    let expired = 0;
    let releasedSeats = 0;
    for (const booking of overdue) {
      const [updated] = await tx
        .update(excursionBookingsTable)
        .set({ paymentStatus: "expired", updatedAt: now })
        .where(
          and(
            eq(excursionBookingsTable.id, booking.id),
            inArray(excursionBookingsTable.paymentStatus, [
              "pending_card",
              "card_setup_pending",
            ]),
            eq(excursionBookingsTable.amountPaidCents, 0),
            eq(excursionBookingsTable.seatStatus, "held"),
            or(
              isNull(excursionBookingsTable.cancellationRequestStatus),
              notInArray(excursionBookingsTable.cancellationRequestStatus, [
                "pending",
                "approved",
              ]),
            ),
          ),
        )
        .returning({ id: excursionBookingsTable.id });
      if (!updated) continue;

      await tx
        .update(paymentRequestsTable)
        .set({ status: "expired", updatedAt: now })
        .where(
          and(
            eq(paymentRequestsTable.bookingId, booking.id),
            inArray(paymentRequestsTable.status, [
              "pending",
              "card_setup_pending",
              "action_required",
            ]),
          ),
        );

      const activeAttempts = await tx
        .select({
          id: paymentAttemptsTable.id,
          stripePaymentIntentId: paymentAttemptsTable.stripePaymentIntentId,
        })
        .from(paymentAttemptsTable)
        .innerJoin(
          paymentRequestsTable,
          eq(paymentAttemptsTable.paymentRequestId, paymentRequestsTable.id),
        )
        .where(
          and(
            eq(paymentRequestsTable.bookingId, booking.id),
            inArray(paymentAttemptsTable.status, [
              "pending",
              "processing",
              "action_required",
              "failed",
            ]),
          ),
        );
      if (activeAttempts.length > 0) {
        for (const attempt of activeAttempts) {
          if (attempt.stripePaymentIntentId) {
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
          } else {
            // Nessuna risorsa Stripe esiste: la cancellazione tecnica e gia
            // definitiva e non richiede un job esterno.
            await tx
              .update(paymentAttemptsTable)
              .set({ status: "cancelled", completedAt: now, updatedAt: now })
              .where(eq(paymentAttemptsTable.id, attempt.id));
          }
        }
      }

      const released = await releaseBookingSeatsInTransaction(
        tx,
        booking.id,
        "card_checkout_expired",
        now,
      );
      if (released.released) releasedSeats += released.seats ?? 0;
      if (booking.stripePaymentIntentId) {
        await enqueueStripeCleanupJobInTransaction(tx, {
          bookingId: booking.id,
          operation: "cancel_payment_intent",
          stripeResourceId: booking.stripePaymentIntentId,
        });
      }
      if (booking.stripeSetupIntentId) {
        await enqueueStripeCleanupJobInTransaction(tx, {
          bookingId: booking.id,
          operation: "cancel_setup_intent",
          stripeResourceId: booking.stripeSetupIntentId,
        });
      }
      if (booking.stripeSetupIntentId && booking.stripeCustomerId) {
        await enqueueStripeCleanupJobInTransaction(tx, {
          bookingId: booking.id,
          operation: "delete_customer",
          stripeResourceId: booking.stripeCustomerId,
        });
      }
      expired += 1;
    }
    return { expired, releasedSeats };
  });

  return outcome;
}

export async function queueBalanceReminders(
  now: Date = new Date(),
): Promise<number> {
  const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const requests = await db
    .select({
      id: paymentRequestsTable.id,
      bookingId: paymentRequestsTable.bookingId,
      deadline: paymentRequestsTable.deadline,
      graceUntil: paymentRequestsTable.graceUntil,
    })
    .from(paymentRequestsTable)
    .innerJoin(
      excursionBookingsTable,
      eq(paymentRequestsTable.bookingId, excursionBookingsTable.id),
    )
    .where(
      and(
        eq(paymentRequestsTable.type, "balance"),
        inArray(paymentRequestsTable.status, ["pending", "action_required"]),
        isNull(excursionBookingsTable.cancelledAt),
        ne(excursionBookingsTable.seatStatus, "released"),
        or(
          isNull(excursionBookingsTable.cancellationRequestStatus),
          notInArray(excursionBookingsTable.cancellationRequestStatus, [
            "pending",
            "approved",
          ]),
        ),
        lte(paymentRequestsTable.deadline, horizon),
      ),
    )
    .limit(200);

  let queued = 0;
  for (const request of requests) {
    if (!request.deadline) continue;
    if (now < request.deadline) {
      await dispatchBalanceReminderEmailV2(
        request.bookingId,
        request.id,
        "before_due",
      );
      queued += 1;
      continue;
    }
    if (!request.graceUntil || now <= request.graceUntil) {
      await dispatchBalanceReminderEmailV2(
        request.bookingId,
        request.id,
        "due",
      );
      queued += 1;
    }
    if (
      request.graceUntil &&
      request.graceUntil.getTime() - request.deadline.getTime() >=
        6 * 60 * 60 * 1000 &&
      now >= new Date(request.graceUntil.getTime() - 2 * 60 * 60 * 1000) &&
      now <= request.graceUntil
    ) {
      await dispatchBalanceReminderEmailV2(
        request.bookingId,
        request.id,
        "grace_ending",
      );
      queued += 1;
    }
  }
  return queued;
}

export type FinancialRecoveryPipelineResult = {
  refunds: { leased: number };
  stripeCleanup: { leased: number };
  cancellations: { checked: number; completed: number };
};

/**
 * La riconciliazione dei casi e deliberatamente ultima: refund e cleanup
 * conclusi in questo stesso ciclo diventano subito osservabili dal ledger di
 * annullamento, senza attendere il tick successivo.
 */
export async function runFinancialRecoveryPipeline(
  deps: {
    processRefunds: () => Promise<{ leased: number }>;
    processCleanup: () => Promise<{ leased: number }>;
    reconcileCancellations: () => Promise<{
      checked: number;
      completed: number;
    }>;
  } = {
    processRefunds: () => processDueBookingRefunds({ batchSize: 20 }),
    processCleanup: () => processStripeCleanupBatch({ batchSize: 20 }),
    reconcileCancellations: () =>
      reconcileApprovedBookingCancellations({ batchSize: 100 }),
  },
): Promise<FinancialRecoveryPipelineResult> {
  const refunds = await deps.processRefunds();
  const stripeCleanup = await deps.processCleanup();
  const cancellations = await deps.reconcileCancellations();
  return { refunds, stripeCleanup, cancellations };
}

export async function runBookingMaintenanceOnce(): Promise<void> {
  const expiry = await expireAbandonedCardBookings();
  const { refunds, stripeCleanup, cancellations } =
    await runFinancialRecoveryPipeline();
  const remindersQueued = automaticBalanceRemindersEnabled()
    ? await queueBalanceReminders()
    : 0;
  const outboxReconciliation = await reconcileMissingBookingEmails({
    batchSize: 100,
  }).catch((error) => {
    logger.error(
      { err: error },
      "Riconciliazione outbox email fallita; consegna ordinaria ancora attiva",
    );
    return emptyEmailOutboxReconciliationResult();
  });
  const emails = await processEmailOutboxBatch({ batchSize: 20 });
  const reconciledEmails = Object.values(outboxReconciliation).reduce(
    (sum, value) => sum + value,
    0,
  );
  if (
    expiry.expired > 0 ||
    refunds.leased > 0 ||
    cancellations.completed > 0 ||
    stripeCleanup.leased > 0 ||
    remindersQueued > 0 ||
    reconciledEmails > 0 ||
    emails.leased > 0
  ) {
    logger.info(
      {
        expiry,
        refunds,
        cancellations,
        stripeCleanup,
        remindersQueued,
        outboxReconciliation,
        emails,
      },
      "Manutenzione prenotazioni completata",
    );
  }
}

let maintenanceTimer: NodeJS.Timeout | null = null;
let maintenanceRunning = false;

export function startBookingMaintenanceScheduler(): () => void {
  if (maintenanceTimer) return () => undefined;

  const configured = Number(process.env.BOOKING_MAINTENANCE_INTERVAL_MS);
  const intervalMs =
    Number.isFinite(configured) && configured >= 10_000
      ? configured
      : DEFAULT_INTERVAL_MS;

  logger.info(
    {
      automaticBalanceRemindersEnabled: automaticBalanceRemindersEnabled(),
      automaticBalanceRemindersConfig: "BOOKING_AUTOMATIC_REMINDERS_ENABLED",
    },
    "Configurazione automazioni manutenzione prenotazioni",
  );

  const run = () => {
    if (maintenanceRunning) return;
    maintenanceRunning = true;
    void runBookingMaintenanceOnce()
      .catch((error) =>
        logger.error({ err: error }, "Manutenzione prenotazioni fallita"),
      )
      .finally(() => {
        maintenanceRunning = false;
      });
  };

  run();
  maintenanceTimer = setInterval(run, intervalMs);
  maintenanceTimer.unref();

  return () => {
    if (maintenanceTimer) clearInterval(maintenanceTimer);
    maintenanceTimer = null;
  };
}
