import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import {
  excursionBookingsTable,
  paymentAttemptsTable,
  paymentRequestsTable,
  stripeCleanupJobsTable,
} from "@workspace/db/schema";
import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { logger } from "../lib/logger";
import { enqueueEmailInTransaction } from "./email-outbox";
import { getAdminNotificationEmails } from "./email.service";
import {
  applySuccessfulCardPayment,
  markCancelledCardPaymentAttempt,
} from "./excursion-payments";
import { stripe } from "./stripe";
import { classifyStripeFailure, stripeRetryAt } from "./stripe-retry";
import { decideManualCleanupCompletion } from "./stripe-cleanup-policy";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type StripeCleanupOperation =
  | "cancel_payment_intent"
  | "cancel_setup_intent"
  | "delete_customer";

export type EnqueueStripeCleanupInput = {
  bookingId?: string | null;
  operation: StripeCleanupOperation;
  stripeResourceId: string;
};

type CleanupReferenceInput = {
  bookingId?: string | null;
  operation: string;
  stripeResourceId: string;
};

async function alignCompletedCleanupReferencesInTransaction(
  tx: Tx,
  input: CleanupReferenceInput,
  now: Date = new Date(),
): Promise<void> {
  if (input.operation === "cancel_payment_intent") {
    await tx
      .update(paymentAttemptsTable)
      .set({
        status: "cancelled",
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(
            paymentAttemptsTable.stripePaymentIntentId,
            input.stripeResourceId,
          ),
          inArray(paymentAttemptsTable.status, [
            "pending",
            "processing",
            "action_required",
            "failed",
            "cancellation_pending",
          ]),
        ),
      );
    if (input.bookingId) {
      await tx
        .update(paymentRequestsTable)
        .set({ stripePaymentIntentId: null, updatedAt: now })
        .where(
          and(
            eq(paymentRequestsTable.bookingId, input.bookingId),
            eq(
              paymentRequestsTable.stripePaymentIntentId,
              input.stripeResourceId,
            ),
          ),
        );
      await tx
        .update(excursionBookingsTable)
        .set({ stripePaymentIntentId: null, updatedAt: now })
        .where(
          and(
            eq(excursionBookingsTable.id, input.bookingId),
            eq(
              excursionBookingsTable.stripePaymentIntentId,
              input.stripeResourceId,
            ),
          ),
        );
    }
    return;
  }

  if (!input.bookingId) return;
  if (input.operation === "cancel_setup_intent") {
    await tx
      .update(excursionBookingsTable)
      .set({ stripeSetupIntentId: null, updatedAt: now })
      .where(
        and(
          eq(excursionBookingsTable.id, input.bookingId),
          eq(
            excursionBookingsTable.stripeSetupIntentId,
            input.stripeResourceId,
          ),
        ),
      );
    return;
  }

  if (input.operation !== "delete_customer") return;
  await tx
    .update(excursionBookingsTable)
    .set({
      stripeCustomerId: null,
      stripePaymentMethodId: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(excursionBookingsTable.id, input.bookingId),
        eq(excursionBookingsTable.stripeCustomerId, input.stripeResourceId),
      ),
    );
}

function alignCompletedCleanupReferences(
  input: CleanupReferenceInput,
): Promise<void> {
  return db.transaction((tx) =>
    alignCompletedCleanupReferencesInTransaction(tx, input),
  );
}

export type StripeCleanupManualCompletionErrorCode =
  | "not_found"
  | "invalid_reference"
  | "completion_reference_conflict"
  | "not_manual_required";

export class StripeCleanupManualCompletionError extends Error {
  constructor(
    public readonly code: StripeCleanupManualCompletionErrorCode,
    message: string,
    public readonly statusCode: 400 | 404 | 409,
  ) {
    super(message);
    this.name = "StripeCleanupManualCompletionError";
  }
}

const DEFAULT_BATCH_SIZE = 25;
const LEASE_MS = 2 * 60 * 1_000;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function queueCleanupManualNotice(
  tx: Tx,
  job: typeof stripeCleanupJobsTable.$inferSelect,
): Promise<void> {
  const title = "Cleanup Stripe da gestire manualmente";
  const detail = job.lastErrorMessage ?? "Tentativi automatici esauriti.";
  const text = `${title}\n\nOperazione: ${job.operation}\nRisorsa Stripe: ${job.stripeResourceId}\nPrenotazione: ${job.bookingId ?? "non associata"}\nDettaglio: ${detail}`;
  await enqueueEmailInTransaction(tx, {
    bookingId: job.bookingId,
    eventType: "stripe.cleanup.manual_required.admin",
    dedupeKey: `stripe-cleanup:${job.id}:manual_required:admin:v1`,
    message: {
      to: getAdminNotificationEmails(),
      subject: `[ElisTravel] ${title}`,
      text,
      html: `<h2>${escapeHtml(title)}</h2><p><strong>Operazione:</strong> ${escapeHtml(job.operation)}<br/><strong>Risorsa Stripe:</strong> ${escapeHtml(job.stripeResourceId)}<br/><strong>Prenotazione:</strong> ${escapeHtml(job.bookingId ?? "non associata")}</p><p><strong>Dettaglio:</strong> ${escapeHtml(detail)}</p>`,
    },
  });
}

export async function enqueueStripeCleanupJobInTransaction(
  tx: Tx,
  input: EnqueueStripeCleanupInput,
): Promise<typeof stripeCleanupJobsTable.$inferSelect> {
  let [job] = await tx
    .insert(stripeCleanupJobsTable)
    .values({
      bookingId: input.bookingId ?? null,
      operation: input.operation,
      stripeResourceId: input.stripeResourceId,
    })
    .onConflictDoNothing()
    .returning();
  if (!job) {
    [job] = await tx
      .select()
      .from(stripeCleanupJobsTable)
      .where(
        and(
          eq(stripeCleanupJobsTable.operation, input.operation),
          eq(stripeCleanupJobsTable.stripeResourceId, input.stripeResourceId),
        ),
      )
      .limit(1);
  }
  if (!job) throw new Error("Impossibile registrare il cleanup Stripe.");
  return job;
}

export function enqueueStripeCleanupJob(
  input: EnqueueStripeCleanupInput,
): Promise<typeof stripeCleanupJobsTable.$inferSelect> {
  return db.transaction((tx) =>
    enqueueStripeCleanupJobInTransaction(tx, input),
  );
}

/**
 * Chiude un job dopo verifica esterna dell'amministrazione. Il riferimento e
 * persistito sul ledger e rende il comando ripetibile senza alterare di nuovo
 * gli stati tecnici collegati.
 */
export async function completeStripeCleanupManually(input: {
  jobId: string;
  reference: string;
}): Promise<{
  jobId: string;
  bookingId: string | null;
  alreadyCompleted: boolean;
  manualCompletionReference: string | null;
}> {
  const reference = input.reference.trim().slice(0, 500);
  if (!reference) {
    throw new StripeCleanupManualCompletionError(
      "invalid_reference",
      "Inserisci il riferimento della verifica effettuata su Stripe.",
      400,
    );
  }

  return db.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(stripeCleanupJobsTable)
      .where(eq(stripeCleanupJobsTable.id, input.jobId))
      .for("update")
      .limit(1);
    if (!job) {
      throw new StripeCleanupManualCompletionError(
        "not_found",
        "Job di cleanup Stripe non trovato.",
        404,
      );
    }
    const decision = decideManualCleanupCompletion({
      status: job.status,
      storedReference: job.manualCompletionReference,
      requestedReference: reference,
    });
    if (decision === "already_completed") {
      return {
        jobId: job.id,
        bookingId: job.bookingId,
        alreadyCompleted: true,
        manualCompletionReference: job.manualCompletionReference,
      };
    }
    if (decision === "reference_conflict") {
      throw new StripeCleanupManualCompletionError(
        "completion_reference_conflict",
        "Il cleanup risulta gia completato con un riferimento differente.",
        409,
      );
    }
    if (decision === "invalid_status") {
      throw new StripeCleanupManualCompletionError(
        "not_manual_required",
        "Il cleanup e ancora gestito automaticamente o non puo essere chiuso manualmente.",
        409,
      );
    }

    const now = new Date();
    await tx
      .update(stripeCleanupJobsTable)
      .set({
        status: "succeeded",
        manualCompletionReference: reference,
        leaseOwner: null,
        leaseExpiresAt: null,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(stripeCleanupJobsTable.id, job.id));

    await alignCompletedCleanupReferencesInTransaction(tx, job, now);

    return {
      jobId: job.id,
      bookingId: job.bookingId,
      alreadyCompleted: false,
      manualCompletionReference: reference,
    };
  });
}

/**
 * Registra sempre il cleanup prima di affidarlo allo scheduler. Se proprio la
 * persistenza non e disponibile, esegue una compensazione sincrona prudente:
 * non cancella mai un PaymentIntent riuscito.
 */
export async function scheduleStripeCleanupWithFallback(
  input: EnqueueStripeCleanupInput,
): Promise<"scheduled" | "compensated" | "reconciled" | "unresolved"> {
  try {
    await enqueueStripeCleanupJob(input);
    return "scheduled";
  } catch (persistenceError) {
    logger.error(
      { err: persistenceError, ...input },
      "Persistenza cleanup Stripe fallita; tentativo compensativo sincrono",
    );
    // La booking puo essere stata eliminata nella stessa race che ha impedito
    // il link del PI. Il job resta comunque registrabile senza FK e conserva
    // la risorsa Stripe per riconciliazione/manual review.
    if (input.bookingId) {
      try {
        await enqueueStripeCleanupJob({ ...input, bookingId: null });
        return "scheduled";
      } catch (fallbackPersistenceError) {
        logger.error(
          { err: fallbackPersistenceError, ...input },
          "Persistenza cleanup Stripe senza booking fallita",
        );
      }
    }
  }
  if (!stripe) return "unresolved";
  try {
    if (input.operation === "cancel_payment_intent") {
      let intent = await stripe.paymentIntents.retrieve(input.stripeResourceId);
      if (intent.status === "succeeded") {
        const applied = await applySuccessfulCardPayment(intent);
        return applied ? "reconciled" : "unresolved";
      }
      if (intent.status === "canceled") {
        await markCancelledCardPaymentAttempt(intent);
        await alignCompletedCleanupReferences(input);
        return "compensated";
      }
      if (
        [
          "requires_payment_method",
          "requires_confirmation",
          "requires_action",
          "requires_capture",
          "processing",
        ].includes(intent.status)
      ) {
        intent = await stripe.paymentIntents.cancel(intent.id);
        if (intent.status === "canceled") {
          await markCancelledCardPaymentAttempt(intent);
          await alignCompletedCleanupReferences(input);
          return "compensated";
        }
      }
      return "unresolved";
    }
    if (input.operation === "cancel_setup_intent") {
      const intent = await stripe.setupIntents.retrieve(input.stripeResourceId);
      if (intent.status === "succeeded" || intent.status === "canceled") {
        await alignCompletedCleanupReferences(input);
        return "compensated";
      }
      if (
        [
          "requires_payment_method",
          "requires_confirmation",
          "requires_action",
        ].includes(intent.status)
      ) {
        await stripe.setupIntents.cancel(intent.id);
        await alignCompletedCleanupReferences(input);
        return "compensated";
      }
      return "unresolved";
    }
    await stripe.customers.del(input.stripeResourceId);
    await alignCompletedCleanupReferences(input);
    return "compensated";
  } catch (error) {
    const detail = errorDetails(error);
    if (detail.code === "resource_missing") {
      try {
        await alignCompletedCleanupReferences(input);
        return "compensated";
      } catch (alignmentError) {
        logger.error(
          { err: alignmentError, ...input },
          "Risorsa Stripe assente ma riferimenti locali non allineati",
        );
        return "unresolved";
      }
    }
    logger.error(
      { err: error, ...input },
      "Compensazione Stripe sincrona fallita",
    );
    return "unresolved";
  }
}

export async function recoverOrCleanupUnlinkedPaymentIntent(input: {
  bookingId: string;
  paymentIntentId: string;
}): Promise<"scheduled" | "compensated" | "reconciled" | "unresolved"> {
  // Prima di accodare una cancellazione controlliamo l'esito economico. Un PI
  // succeeded va contabilizzato (o rimborsato dal flusso standard), mai
  // cancellato ne seguito dalla cancellazione della booking sorgente.
  if (stripe) {
    try {
      const intent = await stripe.paymentIntents.retrieve(
        input.paymentIntentId,
      );
      if (intent.status === "succeeded") {
        const applied = await applySuccessfulCardPayment(intent);
        if (applied) return "reconciled";
        return scheduleStripeCleanupWithFallback({
          bookingId: input.bookingId,
          operation: "cancel_payment_intent",
          stripeResourceId: input.paymentIntentId,
        });
      }
      if (intent.status === "canceled") {
        await markCancelledCardPaymentAttempt(intent);
        return "compensated";
      }
    } catch (error) {
      const detail = errorDetails(error);
      if (detail.code === "resource_missing") return "compensated";
      logger.warn(
        { err: error, ...input },
        "Verifica PaymentIntent orfano fallita; cleanup accodato",
      );
    }
  }
  return scheduleStripeCleanupWithFallback({
    bookingId: input.bookingId,
    operation: "cancel_payment_intent",
    stripeResourceId: input.paymentIntentId,
  });
}

type ClaimedJob = typeof stripeCleanupJobsTable.$inferSelect;

async function claimCleanupJobs(
  now: Date,
  batchSize: number,
): Promise<{ owner: string; jobs: ClaimedJob[] }> {
  const owner = `stripe-cleanup-${process.pid}-${randomUUID()}`;
  const leaseExpiresAt = new Date(now.getTime() + LEASE_MS);
  const jobs = await db.transaction(async (tx) => {
    const candidates = await tx
      .select()
      .from(stripeCleanupJobsTable)
      .where(
        and(
          inArray(stripeCleanupJobsTable.status, [
            "pending",
            "failed",
            "processing",
          ]),
          lte(stripeCleanupJobsTable.nextAttemptAt, now),
          or(
            isNull(stripeCleanupJobsTable.leaseExpiresAt),
            lte(stripeCleanupJobsTable.leaseExpiresAt, now),
          ),
        ),
      )
      .orderBy(stripeCleanupJobsTable.nextAttemptAt)
      .limit(batchSize)
      .for("update", { skipLocked: true });

    const claimed: ClaimedJob[] = [];
    for (const candidate of candidates) {
      if (candidate.attemptCount >= candidate.maxAttempts) {
        const [manual] = await tx
          .update(stripeCleanupJobsTable)
          .set({
            status: "manual_required",
            leaseOwner: null,
            leaseExpiresAt: null,
            completedAt: now,
            lastErrorCode:
              candidate.lastErrorCode ?? "cleanup_attempts_exhausted",
            lastErrorMessage:
              candidate.lastErrorMessage ??
              "Numero massimo di tentativi automatici raggiunto.",
            updatedAt: now,
          })
          .where(eq(stripeCleanupJobsTable.id, candidate.id))
          .returning();
        if (manual) await queueCleanupManualNotice(tx, manual);
        continue;
      }
      const [updated] = await tx
        .update(stripeCleanupJobsTable)
        .set({
          status: "processing",
          attemptCount: candidate.attemptCount + 1,
          lastAttemptAt: now,
          leaseOwner: owner,
          leaseExpiresAt,
          updatedAt: now,
        })
        .where(eq(stripeCleanupJobsTable.id, candidate.id))
        .returning();
      if (updated) claimed.push(updated);
    }
    return claimed;
  });
  return { owner, jobs };
}

function errorDetails(error: unknown): {
  code: string | null;
  message: string;
} {
  const record =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : null;
  return {
    code: typeof record?.code === "string" ? record.code : null,
    message: (error instanceof Error ? error.message : String(error)).slice(
      0,
      2_000,
    ),
  };
}

async function finishCleanupJob(
  job: ClaimedJob,
  owner: string,
  result:
    | { status: "succeeded" }
    | {
        status: "retry" | "manual_required";
        errorCode: string | null;
        errorMessage: string;
      },
): Promise<void> {
  const now = new Date();
  const exhausted = job.attemptCount >= job.maxAttempts;
  const status =
    result.status === "retry"
      ? exhausted
        ? "manual_required"
        : "failed"
      : result.status;
  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(stripeCleanupJobsTable)
      .set({
        status,
        nextAttemptAt:
          status === "failed" ? stripeRetryAt(now, job.attemptCount) : now,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastErrorCode: result.status === "succeeded" ? null : result.errorCode,
        lastErrorMessage:
          result.status === "succeeded" ? null : result.errorMessage,
        completedAt:
          status === "succeeded" || status === "manual_required" ? now : null,
        updatedAt: now,
      })
      .where(
        and(
          eq(stripeCleanupJobsTable.id, job.id),
          eq(stripeCleanupJobsTable.leaseOwner, owner),
        ),
      )
      .returning();
    if (updated?.status === "manual_required") {
      await queueCleanupManualNotice(tx, updated);
    }
    if (
      updated?.status === "succeeded" &&
      updated.operation !== "cancel_payment_intent"
    ) {
      await alignCompletedCleanupReferencesInTransaction(tx, updated, now);
    }
  });

  if (status === "manual_required") {
    logger.error(
      {
        cleanupJobId: job.id,
        bookingId: job.bookingId,
        operation: job.operation,
        stripeResourceId: job.stripeResourceId,
      },
      "Cleanup Stripe richiede intervento manuale",
    );
  }
}

async function executeCleanupJob(
  job: ClaimedJob,
  owner: string,
): Promise<void> {
  if (!stripe) {
    await finishCleanupJob(job, owner, {
      status: "retry",
      errorCode: "stripe_not_configured",
      errorMessage: "Stripe non configurato nel processo di manutenzione.",
    });
    return;
  }

  try {
    if (job.operation === "cancel_payment_intent") {
      let intent = await stripe.paymentIntents.retrieve(job.stripeResourceId);
      if (intent.status === "succeeded") {
        // Un incasso riuscito non viene mai cancellato. La riconciliazione usa
        // i metadata autorevoli e, se il posto non e piu disponibile, apre il
        // normale rimborso compensativo persistente.
        const applied = await applySuccessfulCardPayment(intent);
        if (!applied) {
          await finishCleanupJob(job, owner, {
            status: "manual_required",
            errorCode: "succeeded_payment_not_linked",
            errorMessage:
              "PaymentIntent riuscito senza richiesta di pagamento riconciliabile.",
          });
          return;
        }
        await finishCleanupJob(job, owner, { status: "succeeded" });
        return;
      }
      if (intent.status === "canceled") {
        await markCancelledCardPaymentAttempt(intent);
        await alignCompletedCleanupReferences(job);
        await finishCleanupJob(job, owner, { status: "succeeded" });
        return;
      }
      if (
        [
          "requires_payment_method",
          "requires_confirmation",
          "requires_action",
          "requires_capture",
          "processing",
        ].includes(intent.status)
      ) {
        intent = await stripe.paymentIntents.cancel(intent.id);
        if (intent.status !== "canceled") {
          await finishCleanupJob(job, owner, {
            status: "retry",
            errorCode: "payment_intent_not_cancelled",
            errorMessage: `PaymentIntent ancora in stato ${intent.status}.`,
          });
          return;
        }
        await markCancelledCardPaymentAttempt(intent);
        await alignCompletedCleanupReferences(job);
        await finishCleanupJob(job, owner, { status: "succeeded" });
        return;
      }
      await finishCleanupJob(job, owner, {
        status: "manual_required",
        errorCode: "payment_intent_unexpected_status",
        errorMessage: `PaymentIntent in stato non compensabile automaticamente: ${intent.status}.`,
      });
      return;
    }

    if (job.operation === "cancel_setup_intent") {
      const setupIntent = await stripe.setupIntents.retrieve(
        job.stripeResourceId,
      );
      if (
        setupIntent.status === "canceled" ||
        setupIntent.status === "succeeded"
      ) {
        await finishCleanupJob(job, owner, { status: "succeeded" });
        return;
      }
      if (
        [
          "requires_payment_method",
          "requires_confirmation",
          "requires_action",
        ].includes(setupIntent.status)
      ) {
        await stripe.setupIntents.cancel(setupIntent.id);
        await finishCleanupJob(job, owner, { status: "succeeded" });
        return;
      }
      await finishCleanupJob(job, owner, {
        status: "retry",
        errorCode: "setup_intent_processing",
        errorMessage: `SetupIntent ancora in stato ${setupIntent.status}.`,
      });
      return;
    }

    if (job.operation === "delete_customer") {
      await stripe.customers.del(job.stripeResourceId);
      await finishCleanupJob(job, owner, { status: "succeeded" });
      return;
    }

    await finishCleanupJob(job, owner, {
      status: "manual_required",
      errorCode: "unknown_cleanup_operation",
      errorMessage: `Operazione di cleanup sconosciuta: ${job.operation}.`,
    });
  } catch (error) {
    const detail = errorDetails(error);
    // Una risorsa gia rimossa equivale a cleanup completato.
    if (detail.code === "resource_missing") {
      try {
        await alignCompletedCleanupReferences(job);
      } catch (alignmentError) {
        await finishCleanupJob(job, owner, {
          status: "retry",
          errorCode: "local_reference_alignment_failed",
          errorMessage:
            alignmentError instanceof Error
              ? alignmentError.message
              : String(alignmentError),
        });
        return;
      }
      await finishCleanupJob(job, owner, { status: "succeeded" });
      return;
    }
    const disposition = classifyStripeFailure(error);
    await finishCleanupJob(job, owner, {
      status: disposition === "retryable" ? "retry" : "manual_required",
      errorCode: detail.code,
      errorMessage: detail.message,
    });
    logger.warn(
      {
        err: error,
        cleanupJobId: job.id,
        operation: job.operation,
        stripeResourceId: job.stripeResourceId,
      },
      "Tentativo cleanup Stripe fallito",
    );
  }
}

export async function processStripeCleanupBatch(options?: {
  now?: Date;
  batchSize?: number;
}): Promise<{ leased: number }> {
  const { owner, jobs } = await claimCleanupJobs(
    options?.now ?? new Date(),
    options?.batchSize ?? DEFAULT_BATCH_SIZE,
  );
  for (const job of jobs) {
    await executeCleanupJob(job, owner);
  }
  return { leased: jobs.length };
}
