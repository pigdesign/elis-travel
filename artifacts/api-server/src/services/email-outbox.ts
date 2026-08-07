import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import {
  bookingCancellationCasesTable,
  emailOutboxTable,
  excursionBookingsTable,
  excursionsTable,
  paymentRequestsTable,
  type EmailOutboxPayload,
} from "@workspace/db/schema";
import { and, desc, eq, inArray, lt, lte, or, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  isEmailConfigured,
  sendEmail,
  type EmailMessage,
} from "./email.service";
import { isPaymentBlockedByCancellation } from "./booking-cancellation-guard";
import {
  cancellationCaseIdFromOutboxKey,
  outboxEventTargetsCustomer,
  outboxSuppressionReason,
  paymentRequestIdFromOutboxKey,
} from "./email-outbox-applicability";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type EnqueueEmailInput = {
  bookingId?: string | null;
  eventType: string;
  dedupeKey: string;
  message: EmailMessage;
  nextAttemptAt?: Date;
};

function payloadFromMessage(message: EmailMessage): EmailOutboxPayload {
  return {
    to: Array.isArray(message.to) ? message.to : [message.to],
    subject: message.subject,
    html: message.html,
    text: message.text,
    replyTo: message.replyTo,
  };
}

function isPaymentSensitiveEventType(eventType: string): boolean {
  return (
    eventType.startsWith("booking.balance-") ||
    eventType === "booking.payment-action-required.customer" ||
    eventType === "booking.payment-action-required.admin" ||
    eventType === "booking.payment-deadline-extended.customer" ||
    eventType === "booking.instructions.customer" ||
    eventType === "booking.card-saved.customer"
  );
}

function shouldCheckApplicability(eventType: string): boolean {
  return (
    isPaymentSensitiveEventType(eventType) ||
    eventType === "booking.excursion-confirmed.customer" ||
    eventType === "booking.payment-deadline-extended.customer" ||
    eventType.startsWith("booking.payment-received.") ||
    eventType.startsWith("booking.cancellation-requested.") ||
    eventType.startsWith("booking.cancellation.")
  );
}

export function shouldReviveCancelledPaymentEmail(input: {
  entryStatus: string;
  paymentBlocked: boolean;
  settled: boolean;
}): boolean {
  return (
    input.entryStatus === "cancelled" && !input.paymentBlocked && !input.settled
  );
}

async function enqueueWith(
  executor: typeof db | Tx,
  input: EnqueueEmailInput,
): Promise<boolean> {
  const inserted = await executor
    .insert(emailOutboxTable)
    .values({
      bookingId: input.bookingId ?? null,
      eventType: input.eventType,
      dedupeKey: input.dedupeKey,
      payload: payloadFromMessage(input.message),
      nextAttemptAt: input.nextAttemptAt ?? new Date(),
    })
    .onConflictDoNothing({ target: emailOutboxTable.dedupeKey })
    .returning({ id: emailOutboxTable.id });
  return inserted.length > 0;
}

export function enqueueEmailInTransaction(
  tx: Tx,
  input: EnqueueEmailInput,
): Promise<boolean> {
  return enqueueWith(tx, input);
}

export function enqueueEmail(input: EnqueueEmailInput): Promise<boolean> {
  const paymentSensitive = isPaymentSensitiveEventType(input.eventType);
  const targetsCustomer = outboxEventTargetsCustomer(input.eventType);
  if (!input.bookingId || (!paymentSensitive && !targetsCustomer)) {
    return enqueueWith(db, input);
  }
  return db.transaction(async (tx) => {
    const [booking] = await tx
      .select()
      .from(excursionBookingsTable)
      .where(eq(excursionBookingsTable.id, input.bookingId!))
      .for("update")
      .limit(1);
    if (
      !booking ||
      (targetsCustomer && !booking.customerNotificationsEnabled) ||
      (paymentSensitive &&
        (isPaymentBlockedByCancellation(booking) ||
          (booking.totalAmountCents ?? 0) <= booking.amountPaidCents ||
          !["held", "confirmed"].includes(booking.seatStatus)))
    ) {
      return false;
    }
    const inserted = await enqueueWith(tx, input);
    if (inserted) return true;
    if (!paymentSensitive) return false;

    const [existing] = await tx
      .select({ status: emailOutboxTable.status })
      .from(emailOutboxTable)
      .where(eq(emailOutboxTable.dedupeKey, input.dedupeKey))
      .for("update")
      .limit(1);
    if (
      !existing ||
      !shouldReviveCancelledPaymentEmail({
        entryStatus: existing.status,
        paymentBlocked: false,
        settled: false,
      })
    ) {
      return false;
    }
    const revived = await tx
      .update(emailOutboxTable)
      .set({
        bookingId: input.bookingId,
        eventType: input.eventType,
        payload: payloadFromMessage(input.message),
        status: "pending",
        attemptCount: 0,
        nextAttemptAt: input.nextAttemptAt ?? new Date(),
        lastAttemptAt: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        sentAt: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(emailOutboxTable.dedupeKey, input.dedupeKey),
          eq(emailOutboxTable.status, "cancelled"),
        ),
      )
      .returning({ id: emailOutboxTable.id });
    return revived.length > 0;
  });
}

type LeasedEmail = typeof emailOutboxTable.$inferSelect;

async function leaseBatch(
  workerId: string,
  batchSize: number,
  dedupeKey?: string,
): Promise<LeasedEmail[]> {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + 5 * 60 * 1000);

  return db.transaction(async (tx) => {
    const candidates = await tx
      .select()
      .from(emailOutboxTable)
      .where(
        and(
          // Il lease mirato serve alla consegna immediata (§ enqueueAndDeliverNow):
          // prende una riga precisa invece della testa della coda, che e FIFO e
          // metterebbe un magic link dietro a tutto cio che era gia in attesa.
          dedupeKey ? eq(emailOutboxTable.dedupeKey, dedupeKey) : undefined,
          lte(emailOutboxTable.nextAttemptAt, now),
          sql`${emailOutboxTable.attemptCount} < ${emailOutboxTable.maxAttempts}`,
          or(
            inArray(emailOutboxTable.status, ["pending", "failed"]),
            and(
              eq(emailOutboxTable.status, "processing"),
              or(
                lt(emailOutboxTable.leaseExpiresAt, now),
                sql`${emailOutboxTable.leaseExpiresAt} IS NULL`,
              ),
            ),
          ),
        ),
      )
      .orderBy(emailOutboxTable.nextAttemptAt, emailOutboxTable.createdAt)
      .limit(batchSize)
      .for("update", { skipLocked: true });

    if (candidates.length === 0) return [];
    const ids = candidates.map((row) => row.id);
    await tx
      .update(emailOutboxTable)
      .set({
        status: "processing",
        leaseOwner: workerId,
        leaseExpiresAt,
        lastAttemptAt: now,
        attemptCount: sql`${emailOutboxTable.attemptCount} + 1`,
        updatedAt: now,
      })
      .where(inArray(emailOutboxTable.id, ids));

    return candidates.map((row) => ({
      ...row,
      status: "processing",
      leaseOwner: workerId,
      leaseExpiresAt,
      lastAttemptAt: now,
      attemptCount: row.attemptCount + 1,
      updatedAt: now,
    }));
  });
}

function retryDelayMs(attemptCount: number): number {
  const base = 60_000;
  const max = 6 * 60 * 60 * 1000;
  return Math.min(base * 2 ** Math.max(0, attemptCount - 1), max);
}

function messageFromPayload(payload: EmailOutboxPayload): EmailMessage {
  return {
    to: payload.to,
    subject: payload.subject,
    html: payload.html ?? "",
    text: payload.text ?? "",
    replyTo: payload.replyTo,
  };
}

async function shouldSuppress(entry: LeasedEmail): Promise<boolean> {
  if (!entry.bookingId) return false;
  if (!shouldCheckApplicability(entry.eventType)) return false;
  const [booking] = await db
    .select()
    .from(excursionBookingsTable)
    .where(eq(excursionBookingsTable.id, entry.bookingId))
    .limit(1);

  const keyedRequestId = paymentRequestIdFromOutboxKey(entry.dedupeKey);
  let paymentRequest: typeof paymentRequestsTable.$inferSelect | null = null;
  if (booking && keyedRequestId) {
    [paymentRequest = null] = await db
      .select()
      .from(paymentRequestsTable)
      .where(
        and(
          eq(paymentRequestsTable.id, keyedRequestId),
          eq(paymentRequestsTable.bookingId, booking.id),
        ),
      )
      .limit(1);
  } else if (booking && isPaymentSensitiveEventType(entry.eventType)) {
    const expectedType =
      entry.eventType === "booking.card-saved.customer"
        ? "deposit"
        : entry.eventType.startsWith("booking.balance-")
          ? "balance"
          : entry.eventType === "booking.instructions.customer"
            ? booking.paymentType
            : null;
    const conditions = [eq(paymentRequestsTable.bookingId, booking.id)];
    if (expectedType) {
      conditions.push(eq(paymentRequestsTable.type, expectedType));
    }
    [paymentRequest = null] = await db
      .select()
      .from(paymentRequestsTable)
      .where(and(...conditions))
      .orderBy(desc(paymentRequestsTable.createdAt))
      .limit(1);
  }

  const keyedCaseId = cancellationCaseIdFromOutboxKey(entry.dedupeKey);
  let cancellationCase:
    | typeof bookingCancellationCasesTable.$inferSelect
    | null = null;
  if (booking && keyedCaseId) {
    [cancellationCase = null] = await db
      .select()
      .from(bookingCancellationCasesTable)
      .where(
        and(
          eq(bookingCancellationCasesTable.id, keyedCaseId),
          eq(bookingCancellationCasesTable.bookingId, booking.id),
        ),
      )
      .limit(1);
  }

  let excursionStatus: string | null = null;
  if (booking && entry.eventType === "booking.excursion-confirmed.customer") {
    const [excursion] = await db
      .select({ status: excursionsTable.status })
      .from(excursionsTable)
      .where(eq(excursionsTable.id, booking.excursionId))
      .limit(1);
    excursionStatus = excursion?.status ?? null;
  }

  return Boolean(
    outboxSuppressionReason({
      eventType: entry.eventType,
      dedupeKey: entry.dedupeKey,
      booking: booking ?? null,
      paymentRequest,
      cancellationCase,
      excursionStatus,
    }),
  );
}

type DeliveryOutcome = "sent" | "suppressed" | "failed";

/**
 * Consegna una riga gia in lease. Estratta dal ciclo del batch perche la
 * corsia prioritaria (enqueueAndDeliverNow) deve usare esattamente la stessa
 * logica di soppressione, marcatura e retry: duplicarla significherebbe
 * ritrovarsi due comportamenti divergenti sul percorso piu delicato.
 * Non solleva: l'esito e nel valore di ritorno.
 */
async function deliverLeasedEntry(
  entry: LeasedEmail,
  workerId: string,
): Promise<DeliveryOutcome> {
  try {
    if (await shouldSuppress(entry)) {
      await db
        .update(emailOutboxTable)
        .set({
          status: "cancelled",
          lastError:
            "Messaggio non piu applicabile allo stato della prenotazione.",
          leaseOwner: null,
          leaseExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(emailOutboxTable.id, entry.id),
            eq(emailOutboxTable.leaseOwner, workerId),
          ),
        );
      return "suppressed";
    }
    await sendEmail(messageFromPayload(entry.payload));
    const now = new Date();
    await db
      .update(emailOutboxTable)
      .set({
        status: "sent",
        sentAt: now,
        lastError: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(emailOutboxTable.id, entry.id),
          eq(emailOutboxTable.status, "processing"),
          eq(emailOutboxTable.leaseOwner, workerId),
        ),
      );
    return "sent";
  } catch (error) {
    const now = new Date();
    const detail = error instanceof Error ? error.message : String(error);
    await db
      .update(emailOutboxTable)
      .set({
        status: "failed",
        lastError: detail.slice(0, 2_000),
        nextAttemptAt: new Date(
          now.getTime() + retryDelayMs(entry.attemptCount),
        ),
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(emailOutboxTable.id, entry.id),
          eq(emailOutboxTable.leaseOwner, workerId),
        ),
      );
    logger.warn(
      { err: error, emailOutboxId: entry.id, eventType: entry.eventType },
      "Invio email outbox fallito; verra ritentato",
    );
    return "failed";
  }
}

export async function processEmailOutboxBatch(opts?: {
  workerId?: string;
  batchSize?: number;
}): Promise<{ leased: number; sent: number; failed: number }> {
  if (!isEmailConfigured()) return { leased: 0, sent: 0, failed: 0 };

  const workerId = opts?.workerId ?? `api-${process.pid}-${randomUUID()}`;
  const batch = await leaseBatch(
    workerId,
    Math.max(1, Math.min(opts?.batchSize ?? 20, 100)),
  );
  let sent = 0;
  let failed = 0;

  for (const entry of batch) {
    const outcome = await deliverLeasedEntry(entry, workerId);
    if (outcome === "sent") sent += 1;
    else if (outcome === "failed") failed += 1;
  }

  return { leased: batch.length, sent, failed };
}

/**
 * Tenta la consegna immediata di una singola riga dell'outbox, identificata
 * dalla sua dedupeKey. Pensata per le email di autenticazione, dove l'utente
 * e fermo davanti allo schermo: il poller di manutenzione gira ogni 30 secondi
 * e mette l'invio email in coda DOPO rimborsi, pulizia Stripe e riconciliazioni,
 * quindi l'attesa percepita sarebbe di decine di secondi.
 *
 * Non solleva mai e non va attesa dal chiamante: se fallisce, o se il processo
 * muore prima di completare, la riga resta nell'outbox e il poller la recupera
 * (il lease scade dopo 5 minuti). La durabilita non dipende da questa funzione.
 */
export async function deliverOutboxEntryNow(dedupeKey: string): Promise<void> {
  if (!isEmailConfigured()) return;
  const workerId = `now-${process.pid}-${randomUUID()}`;
  try {
    const [entry] = await leaseBatch(workerId, 1, dedupeKey);
    // Nessuna riga: il poller l'ha gia presa, oppure e gia stata inviata.
    // In entrambi i casi non c'e nulla da fare qui.
    if (!entry) return;
    await deliverLeasedEntry(entry, workerId);
  } catch (error) {
    logger.warn(
      { err: error, dedupeKey },
      "Consegna immediata fallita; il messaggio resta in carico al poller",
    );
  }
}

/**
 * Accoda un messaggio e ne avvia subito la consegna, senza attendere il poller.
 *
 * La consegna parte in background di proposito: la risposta HTTP non deve
 * dipendere dall'esito dell'invio, sia per non far attendere l'utente sia
 * perche un tempo di risposta diverso fra "account esistente" e "account
 * inesistente" rivelerebbe quali indirizzi sono registrati.
 */
export async function enqueueAndDeliverNow(
  input: EnqueueEmailInput,
): Promise<boolean> {
  const enqueued = await enqueueEmail(input);
  if (!enqueued) return false;
  void deliverOutboxEntryNow(input.dedupeKey);
  return true;
}
