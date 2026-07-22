import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { db } from "@workspace/db";
import {
  excursionBookingsTable,
  paymentAttemptsTable,
  paymentRefundAttemptsTable,
  paymentRefundsTable,
  paymentRequestsTable,
} from "@workspace/db/schema";
import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  lte,
  ne,
  or,
} from "drizzle-orm";
import { logger } from "../lib/logger";
import { enqueueEmailInTransaction } from "./email-outbox";
import { getAdminNotificationEmails } from "./email.service";
import { stripe } from "./stripe";
import {
  classifyStripeFailure,
  stripeRetryAt,
} from "./stripe-retry";
import {
  LEGACY_REFUND_IDEMPOTENCY_PREFIX,
  normalizeRefundRegistration,
  refundReasonDefersAggregateReconciliation,
  refundRegistrationMatches,
} from "./booking-refund-policy";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const LATE_PAYMENT_REFUND_REASON = "late_payment_after_seat_release";
export const DUPLICATE_PAYMENT_REFUND_REASON = "duplicate_payment_intent";
export const LATE_PAYMENT_WITH_EXISTING_FUNDS_REFUND_REASON =
  "late_payment_with_existing_funds";
export const PAYMENT_AMOUNT_MISMATCH_REFUND_REASON = "payment_amount_mismatch";

export type RegisterPaymentRefundInput = {
  bookingId: string;
  paymentRequestId: string | null;
  paymentAttemptId?: string | null;
  paymentIntentId: string;
  amountCents: number;
  reason?: string;
  // Obbligatoria quando lo stesso PI puo ricevere piu allocation (per esempio
  // cancellazione parziale). Se omessa mantiene la chiave late-payment legacy.
  idempotencyKey?: string;
};

export type BookingRefundResult = {
  refundId: string;
  status: "pending" | "processing" | "succeeded" | "failed" | "manual_required";
  stripeRefundId: string | null;
};

export class BookingRefundAttemptFailedError extends Error {
  constructor(
    public readonly refundId: string,
    cause: unknown,
  ) {
    super("Il tentativo di rimborso Stripe è fallito.", { cause });
    this.name = "BookingRefundAttemptFailedError";
  }
}

const REFUND_LEASE_MS = 2 * 60 * 1_000;
const DEFAULT_REFUND_BATCH_SIZE = 20;

function paymentIntentIdFromRefund(
  refund: typeof paymentRefundsTable.$inferSelect,
): string | null {
  if (refund.stripePaymentIntentId) return refund.stripePaymentIntentId;
  if (!refund.idempotencyKey.startsWith(LEGACY_REFUND_IDEMPOTENCY_PREFIX)) {
    return null;
  }
  const value = refund.idempotencyKey.slice(
    LEGACY_REFUND_IDEMPOTENCY_PREFIX.length,
  );
  return value.startsWith("pi_") ? value : null;
}

function euro(amountCents: number): string {
  return (amountCents / 100).toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function adminMessage(input: {
  bookingId: string;
  paymentIntentId: string;
  amountCents: number;
  state: "required" | "processing" | "succeeded" | "failed" | "manual_required";
  detail?: string | null;
}) {
  const labels = {
    required: "Rimborso automatico richiesto",
    processing: "Rimborso Stripe in elaborazione",
    succeeded: "Rimborso automatico completato",
    failed: "Rimborso automatico fallito",
    manual_required: "Rimborso da gestire manualmente",
  } as const;
  const title = labels[input.state];
  const detail = input.detail ? `\nDettaglio: ${input.detail}` : "";
  const text = `${title}\n\nPrenotazione: ${input.bookingId}\nPaymentIntent: ${input.paymentIntentId}\nImporto: ${euro(input.amountCents)}${detail}`;
  const htmlDetail = input.detail
    ? `<p><strong>Dettaglio:</strong> ${escapeHtml(input.detail)}</p>`
    : "";
  return {
    to: getAdminNotificationEmails(),
    subject: `[ElisTravel] ${title}`,
    text,
    html: `<h2>${escapeHtml(title)}</h2>
      <p><strong>Prenotazione:</strong> ${escapeHtml(input.bookingId)}<br/>
      <strong>PaymentIntent:</strong> ${escapeHtml(input.paymentIntentId)}<br/>
      <strong>Importo:</strong> ${escapeHtml(euro(input.amountCents))}</p>
      ${htmlDetail}`,
  };
}

async function queueAdminNotice(
  tx: Tx,
  input: RegisterPaymentRefundInput & {
    refundId: string;
    state:
      | "required"
      | "processing"
      | "succeeded"
      | "failed"
      | "manual_required";
    detail?: string | null;
  },
): Promise<void> {
  await enqueueEmailInTransaction(tx, {
    bookingId: input.bookingId,
    eventType: `booking.refund.${input.state}.admin`,
    dedupeKey: `refund:${input.refundId}:${input.state}:admin:v1`,
    message: adminMessage(input),
  });
}

/**
 * Registra il rimborso nella stessa transazione che decide di non accettare il
 * pagamento. La business key rende webhook, conferma in pagina e future
 * allocation amministrative concorrenti equivalenti senza imporre un solo
 * rimborso per PaymentIntent.
 */
export async function ensurePaymentRefundInTransaction(
  tx: Tx,
  input: RegisterPaymentRefundInput,
): Promise<typeof paymentRefundsTable.$inferSelect> {
  const registration = normalizeRefundRegistration(input);
  const reason = input.reason ?? LATE_PAYMENT_REFUND_REASON;
  let [refund] = await tx
    .insert(paymentRefundsTable)
    .values({
      bookingId: registration.bookingId,
      paymentRequestId: registration.paymentRequestId,
      paymentAttemptId: registration.paymentAttemptId,
      amountCents: registration.amountCents,
      reason,
      status: "pending",
      provider: "stripe",
      stripePaymentIntentId: registration.paymentIntentId,
      idempotencyKey: registration.idempotencyKey,
    })
    .onConflictDoNothing({ target: paymentRefundsTable.idempotencyKey })
    .returning();

  if (!refund) {
    [refund] = await tx
      .select()
      .from(paymentRefundsTable)
      .where(
        eq(paymentRefundsTable.idempotencyKey, registration.idempotencyKey),
      )
      .limit(1);
  }
  if (!refund) {
    throw new Error("Impossibile registrare il rimborso idempotente.");
  }
  const existingPaymentIntentId = paymentIntentIdFromRefund(refund);
  if (
    !existingPaymentIntentId ||
    refund.reason !== reason ||
    !refundRegistrationMatches(
      {
        bookingId: refund.bookingId,
        paymentRequestId: refund.paymentRequestId,
        paymentAttemptId: refund.paymentAttemptId,
        paymentIntentId: existingPaymentIntentId,
        amountCents: refund.amountCents,
        idempotencyKey: refund.idempotencyKey,
      },
      registration,
    )
  ) {
    throw new Error(
      "Conflitto su chiave idempotente, PaymentIntent o allocation del rimborso.",
    );
  }

  await queueAdminNotice(tx, {
    ...input,
    refundId: refund.id,
    state: "required",
  });
  return refund;
}

export function ensurePaymentRefund(
  input: RegisterPaymentRefundInput,
): Promise<typeof paymentRefundsTable.$inferSelect> {
  return db.transaction((tx) => ensurePaymentRefundInTransaction(tx, input));
}

type LoadedRefund = {
  refund: typeof paymentRefundsTable.$inferSelect;
  booking: typeof excursionBookingsTable.$inferSelect;
  request: typeof paymentRequestsTable.$inferSelect | null;
  attempt: typeof paymentAttemptsTable.$inferSelect | null;
  paymentIntentId: string | null;
};

async function loadRefund(refundId: string): Promise<LoadedRefund | null> {
  const [refund] = await db
    .select()
    .from(paymentRefundsTable)
    .where(eq(paymentRefundsTable.id, refundId))
    .limit(1);
  if (!refund) return null;

  const [booking] = await db
    .select()
    .from(excursionBookingsTable)
    .where(eq(excursionBookingsTable.id, refund.bookingId))
    .limit(1);
  if (!booking) return null;

  const [request] = refund.paymentRequestId
    ? await db
        .select()
        .from(paymentRequestsTable)
        .where(eq(paymentRequestsTable.id, refund.paymentRequestId))
        .limit(1)
    : [];
  const [attempt] = refund.paymentAttemptId
    ? await db
        .select()
        .from(paymentAttemptsTable)
        .where(eq(paymentAttemptsTable.id, refund.paymentAttemptId))
        .limit(1)
    : [];

  return {
    refund,
    booking,
    request: request ?? null,
    attempt: attempt ?? null,
    paymentIntentId:
      paymentIntentIdFromRefund(refund) ??
      attempt?.stripePaymentIntentId ??
      request?.stripePaymentIntentId ??
      booking.stripePaymentIntentId,
  };
}

function errorDetails(error: unknown): {
  code: string | null;
  message: string;
} {
  const record =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : null;
  const code = typeof record?.code === "string" ? record.code : null;
  const message = error instanceof Error ? error.message : String(error);
  return { code, message: message.slice(0, 2_000) };
}

type RefundClaim =
  | { kind: "claimed"; owner: string }
  | { kind: "terminal"; result: BookingRefundResult }
  | { kind: "busy"; result: BookingRefundResult };

function refundResult(
  refund: typeof paymentRefundsTable.$inferSelect,
): BookingRefundResult {
  const status = [
    "pending",
    "processing",
    "succeeded",
    "failed",
    "manual_required",
  ].includes(refund.status)
    ? (refund.status as BookingRefundResult["status"])
    : "manual_required";
  return {
    refundId: refund.id,
    status,
    stripeRefundId: refund.stripeRefundId,
  };
}

async function claimRefundById(
  refundId: string,
  now: Date = new Date(),
): Promise<RefundClaim> {
  const owner = `stripe-refund-${process.pid}-${randomUUID()}`;
  return db.transaction(async (tx) => {
    const [refund] = await tx
      .select()
      .from(paymentRefundsTable)
      .where(eq(paymentRefundsTable.id, refundId))
      .for("update")
      .limit(1);
    if (!refund) throw new Error("Rimborso non trovato.");
    if (["succeeded", "manual_required"].includes(refund.status)) {
      return { kind: "terminal", result: refundResult(refund) };
    }
    if (
      refund.leaseOwner &&
      refund.leaseExpiresAt &&
      refund.leaseExpiresAt > now
    ) {
      return { kind: "busy", result: refundResult(refund) };
    }
    if (refund.attemptCount > 0 && refund.nextAttemptAt > now) {
      return { kind: "busy", result: refundResult(refund) };
    }
    if (refund.attemptCount >= refund.maxAttempts) {
      const [manual] = await tx
        .update(paymentRefundsTable)
        .set({
          status: "manual_required",
          completedAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastErrorCode:
            refund.lastErrorCode ?? "refund_attempts_exhausted",
          lastErrorMessage:
            refund.lastErrorMessage ??
            "Numero massimo di tentativi automatici raggiunto.",
          updatedAt: now,
        })
        .where(eq(paymentRefundsTable.id, refund.id))
        .returning();
      if (manual) {
        await queueAdminNotice(tx, {
          bookingId: manual.bookingId,
          paymentRequestId: manual.paymentRequestId,
          paymentAttemptId: manual.paymentAttemptId,
          paymentIntentId:
            paymentIntentIdFromRefund(manual) ?? "non disponibile",
          amountCents: manual.amountCents,
          reason: manual.reason,
          refundId: manual.id,
          state: "manual_required",
          detail: manual.lastErrorMessage,
        });
      }
      return { kind: "terminal", result: refundResult(manual ?? refund) };
    }
    await tx
      .update(paymentRefundsTable)
      .set({
        status: "processing",
        attemptCount: refund.attemptCount + 1,
        lastAttemptAt: now,
        leaseOwner: owner,
        leaseExpiresAt: new Date(now.getTime() + REFUND_LEASE_MS),
        updatedAt: now,
      })
      .where(eq(paymentRefundsTable.id, refund.id));
    return { kind: "claimed", owner };
  });
}

type ProviderRefundAttempt =
  typeof paymentRefundAttemptsTable.$inferSelect;

async function getOrCreateProviderRefundAttempt(
  refundId: string,
  leaseOwner: string,
): Promise<ProviderRefundAttempt> {
  return db.transaction(async (tx) => {
    const [refund] = await tx
      .select()
      .from(paymentRefundsTable)
      .where(eq(paymentRefundsTable.id, refundId))
      .for("update")
      .limit(1);
    if (!refund) throw new Error("Rimborso non trovato.");
    if (refund.leaseOwner !== leaseOwner) {
      throw new Error("Lease rimborso non piu valida.");
    }

    const [latest] = await tx
      .select()
      .from(paymentRefundAttemptsTable)
      .where(eq(paymentRefundAttemptsTable.paymentRefundId, refund.id))
      .orderBy(desc(paymentRefundAttemptsTable.attemptNumber))
      .for("update")
      .limit(1);
    if (latest && ["pending", "processing"].includes(latest.status)) {
      return latest;
    }
    if (
      latest?.status === "succeeded" ||
      latest?.status === "manual_required"
    ) {
      return latest;
    }

    const attemptNumber = (latest?.attemptNumber ?? 0) + 1;
    const [created] = await tx
      .insert(paymentRefundAttemptsTable)
      .values({
        paymentRefundId: refund.id,
        attemptNumber,
        idempotencyKey: `${refund.idempotencyKey}:provider:${attemptNumber}`,
        // Backfill trasparente se il vecchio flusso aveva gia persistito un ID.
        stripeRefundId: latest ? null : refund.stripeRefundId,
        status:
          !latest && refund.stripeRefundId ? "processing" : "pending",
      })
      .returning();
    if (!created) throw new Error("Tentativo provider rimborso non creato.");
    return created;
  });
}

async function persistProviderRefundAttempt(
  attemptId: string,
  input: {
    status: "processing" | "succeeded" | "failed" | "manual_required";
    stripeRefundId?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  },
): Promise<void> {
  const terminal = ["succeeded", "failed", "manual_required"].includes(
    input.status,
  );
  await db
    .update(paymentRefundAttemptsTable)
    .set({
      status: input.status,
      stripeRefundId: input.stripeRefundId,
      lastErrorCode: input.errorCode ?? null,
      lastErrorMessage: input.errorMessage ?? null,
      completedAt: terminal ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(
      input.status === "succeeded"
        ? eq(paymentRefundAttemptsTable.id, attemptId)
        : and(
            eq(paymentRefundAttemptsTable.id, attemptId),
            ne(paymentRefundAttemptsTable.status, "succeeded"),
          ),
    );
}

async function persistRefundState(
  ctx: LoadedRefund,
  input: {
    status: BookingRefundResult["status"];
    stripeRefundId?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    expectedLeaseOwner?: string;
  },
): Promise<BookingRefundResult> {
  const now = new Date();

  const persisted = await db.transaction(async (tx) => {
    // Stesso ordine di lock del flusso pagamento/scadenza: booking, request,
    // quindi record tecnico. Evita deadlock tra webhook PI e refund concorrenti.
    await tx
      .select({ id: excursionBookingsTable.id })
      .from(excursionBookingsTable)
      .where(eq(excursionBookingsTable.id, ctx.booking.id))
      .for("update")
      .limit(1);
    if (ctx.request) {
      await tx
        .select({ id: paymentRequestsTable.id })
        .from(paymentRequestsTable)
        .where(eq(paymentRequestsTable.id, ctx.request.id))
        .for("update")
        .limit(1);
    }
    const [currentRefund] = await tx
      .select()
      .from(paymentRefundsTable)
      .where(eq(paymentRefundsTable.id, ctx.refund.id))
      .for("update")
      .limit(1);
    if (!currentRefund)
      throw new Error("Rimborso non trovato durante l'aggiornamento.");

    // Un worker che ha perso la lease non puo sovrascrivere il risultato del
    // successore. La riuscita Stripe e l'unica eccezione: e un fatto
    // finanziario autorevole e deve sempre essere riconciliato.
    if (
      input.expectedLeaseOwner &&
      currentRefund.leaseOwner !== input.expectedLeaseOwner &&
      input.status !== "succeeded"
    ) {
      return refundResult(currentRefund);
    }

    // Gli eventi Stripe possono arrivare mentre la chiamata API e ancora in
    // corso. Un esito finale riuscito non deve mai essere retrocesso da una
    // risposta/evento pending o failed arrivato fuori ordine.
    if (currentRefund.status === "succeeded" && input.status !== "succeeded") {
      return {
        refundId: currentRefund.id,
        status: "succeeded" as const,
        stripeRefundId: currentRefund.stripeRefundId,
      };
    }
    if (
      currentRefund.status === "manual_required" &&
      input.status !== "succeeded"
    ) {
      return refundResult(currentRefund);
    }

    const exhausted = currentRefund.attemptCount >= currentRefund.maxAttempts;
    const actualStatus =
      input.status === "failed" && exhausted
        ? ("manual_required" as const)
        : input.status;
    const terminal = ["succeeded", "manual_required"].includes(actualStatus);
    const requestStatus =
      actualStatus === "succeeded" ? "refunded" : "refund_required";
    const bookingStatus =
      actualStatus === "succeeded" ? "refunded" : "refund_required";
    const stripeRefundId =
      input.stripeRefundId === undefined
        ? currentRefund.stripeRefundId
        : input.stripeRefundId;

    await tx
      .update(paymentRefundsTable)
      .set({
        status: actualStatus,
        stripeRefundId,
        lastErrorCode: input.errorCode ?? null,
        lastErrorMessage: input.errorMessage ?? null,
        nextAttemptAt:
          actualStatus === "failed" || actualStatus === "processing"
            ? stripeRetryAt(now, currentRefund.attemptCount)
            : now,
        leaseOwner: null,
        leaseExpiresAt: null,
        completedAt: terminal ? now : null,
        updatedAt: now,
      })
      .where(eq(paymentRefundsTable.id, ctx.refund.id));

    // Un addebito compensativo non deve annullare gli incassi validi gia
    // contabilizzati. Nel duplicato preserviamo anche la request originale;
    // nel saldo tardivo aggiorniamo la request rimborsata ma non l'aggregato.
    const duplicatePayment =
      currentRefund.reason === DUPLICATE_PAYMENT_REFUND_REASON;
    const amountMismatch =
      currentRefund.reason === PAYMENT_AMOUNT_MISMATCH_REFUND_REASON;
    const aggregateReconciliationDeferred =
      refundReasonDefersAggregateReconciliation(currentRefund.reason);
    const preservePaymentRequest =
      duplicatePayment || amountMismatch || aggregateReconciliationDeferred;
    const preserveBookingPayment =
      preservePaymentRequest ||
      currentRefund.reason === LATE_PAYMENT_WITH_EXISTING_FUNDS_REFUND_REASON;
    if (!preservePaymentRequest) {
      if (ctx.request) {
        await tx
          .update(paymentRequestsTable)
          .set({ status: requestStatus, updatedAt: now })
          .where(eq(paymentRequestsTable.id, ctx.request.id));
      }
    }
    if (!preserveBookingPayment) {
      await tx
        .update(excursionBookingsTable)
        .set({ paymentStatus: bookingStatus, updatedAt: now })
        .where(eq(excursionBookingsTable.id, ctx.booking.id));
    }

    // Il tentativo rappresenta correttamente un addebito Stripe riuscito; il
    // rimborso e registrato separatamente, senza trasformarlo in un fallimento.
    if (ctx.attempt) {
      await tx
        .update(paymentAttemptsTable)
        .set({
          status: "succeeded",
          lastErrorCode: null,
          lastErrorMessage: null,
          completedAt: ctx.attempt.completedAt ?? now,
          updatedAt: now,
        })
        .where(eq(paymentAttemptsTable.id, ctx.attempt.id));
    }

    if (actualStatus !== "processing" && actualStatus !== "pending") {
      await queueAdminNotice(tx, {
        bookingId: ctx.booking.id,
        paymentRequestId: ctx.request?.id ?? null,
        paymentAttemptId: ctx.attempt?.id ?? null,
        paymentIntentId: ctx.paymentIntentId ?? "non disponibile",
        amountCents: ctx.refund.amountCents,
        reason: ctx.refund.reason,
        refundId: ctx.refund.id,
        state: actualStatus,
        detail: input.errorMessage,
      });
    }
    return {
      refundId: currentRefund.id,
      status: actualStatus,
      stripeRefundId,
    };
  });

  return persisted;
}

function stripeRefundState(refund: Stripe.Refund): {
  status: "processing" | "succeeded" | "failed" | "manual_required";
  errorCode: string | null;
  errorMessage: string | null;
} {
  if (refund.status === "succeeded") {
    return { status: "succeeded", errorCode: null, errorMessage: null };
  }
  if (refund.status === "failed" || refund.status === "canceled") {
    return {
      status: "failed",
      errorCode: refund.failure_reason ?? refund.status,
      errorMessage: `Stripe refund ${refund.status}${refund.failure_reason ? `: ${refund.failure_reason}` : ""}`,
    };
  }
  if (refund.status === "requires_action") {
    return {
      status: "manual_required",
      errorCode: "requires_action",
      errorMessage: "Il rimborso Stripe richiede un intervento manuale.",
    };
  }
  return { status: "processing", errorCode: null, errorMessage: null };
}

async function executeClaimedRefund(
  refundId: string,
  leaseOwner: string,
): Promise<BookingRefundResult> {
  const ctx = await loadRefund(refundId);
  if (!ctx) throw new Error("Rimborso o prenotazione non trovati.");
  if (ctx.refund.status === "succeeded") {
    return {
      refundId: ctx.refund.id,
      status: "succeeded",
      stripeRefundId: ctx.refund.stripeRefundId,
    };
  }
  if (!ctx.paymentIntentId) {
    return persistRefundState(ctx, {
      status: "manual_required",
      errorCode: "missing_payment_intent",
      errorMessage: "PaymentIntent non disponibile per il rimborso automatico.",
      expectedLeaseOwner: leaseOwner,
    });
  }
  if (!stripe) {
    return persistRefundState(ctx, {
      status: "manual_required",
      errorCode: "stripe_not_configured",
      errorMessage: "Stripe non configurato: rimborso manuale necessario.",
      expectedLeaseOwner: leaseOwner,
    });
  }

  const providerAttempt = await getOrCreateProviderRefundAttempt(
    ctx.refund.id,
    leaseOwner,
  );
  if (providerAttempt.status === "manual_required") {
    return persistRefundState(ctx, {
      status: "manual_required",
      stripeRefundId: providerAttempt.stripeRefundId,
      errorCode: providerAttempt.lastErrorCode,
      errorMessage:
        providerAttempt.lastErrorMessage ??
        "Il tentativo provider richiede un intervento manuale.",
      expectedLeaseOwner: leaseOwner,
    });
  }

  try {
    let stripeRefund: Stripe.Refund | null = providerAttempt.stripeRefundId
      ? await stripe.refunds.retrieve(providerAttempt.stripeRefundId)
      : null;
    if (!stripeRefund && providerAttempt.status === "processing") {
      // Stripe conserva le idempotency key per una finestra limitata. Dopo un
      // timeout cerchiamo prima il refund tramite metadata: anche un retry
      // molto tardivo non puo creare un secondo rimborso.
      const existingRefunds = await stripe.refunds.list({
        payment_intent: ctx.paymentIntentId,
        limit: 100,
      });
      stripeRefund =
        existingRefunds.data.find(
          (candidate) =>
            candidate.metadata?.paymentRefundAttemptId === providerAttempt.id,
        ) ?? null;
    }
    if (!stripeRefund) {
      stripeRefund = await stripe.refunds.create(
          {
            payment_intent: ctx.paymentIntentId,
            amount: ctx.refund.amountCents,
            metadata: {
              source: "elis-travel",
              bookingId: ctx.booking.id,
              paymentRequestId: ctx.request?.id ?? "",
              paymentRefundId: ctx.refund.id,
              paymentRefundAttemptId: providerAttempt.id,
              reason: ctx.refund.reason,
            },
          },
          { idempotencyKey: providerAttempt.idempotencyKey },
        );
    }

    const refundPaymentIntentId =
      typeof stripeRefund.payment_intent === "string"
        ? stripeRefund.payment_intent
        : (stripeRefund.payment_intent?.id ?? null);
    if (
      refundPaymentIntentId !== ctx.paymentIntentId ||
      stripeRefund.amount !== ctx.refund.amountCents
    ) {
      await persistProviderRefundAttempt(providerAttempt.id, {
        status: "manual_required",
        stripeRefundId: stripeRefund.id,
        errorCode: "refund_reference_mismatch",
        errorMessage: "Refund Stripe non coerente con PaymentIntent o importo.",
      });
      return persistRefundState(ctx, {
        status: "manual_required",
        stripeRefundId: stripeRefund.id,
        errorCode: "refund_reference_mismatch",
        errorMessage: "Refund Stripe non coerente con PaymentIntent o importo.",
        expectedLeaseOwner: leaseOwner,
      });
    }

    const state = stripeRefundState(stripeRefund);
    await persistProviderRefundAttempt(providerAttempt.id, {
      ...state,
      stripeRefundId: stripeRefund.id,
    });
    return persistRefundState(ctx, {
      ...state,
      stripeRefundId: stripeRefund.id,
      expectedLeaseOwner: leaseOwner,
    });
  } catch (error) {
    const detail = errorDetails(error);
    const disposition = classifyStripeFailure(error);
    await persistProviderRefundAttempt(providerAttempt.id, {
      status:
        disposition === "retryable" ? "processing" : "manual_required",
      errorCode: detail.code,
      errorMessage: detail.message,
    });
    const result = await persistRefundState(ctx, {
      status:
        disposition === "retryable" ? "failed" : "manual_required",
      errorCode: detail.code,
      errorMessage: detail.message,
      expectedLeaseOwner: leaseOwner,
    });
    logger.error(
      { err: error, refundId: ctx.refund.id, bookingId: ctx.booking.id },
      "Rimborso Stripe automatico fallito",
    );
    if (disposition === "manual_required") return result;
    throw new BookingRefundAttemptFailedError(ctx.refund.id, error);
  }
}

/** Esegue o riprende il rimborso completo del PaymentIntent. */
export async function processBookingRefund(
  refundId: string,
): Promise<BookingRefundResult> {
  const claim = await claimRefundById(refundId);
  if (claim.kind !== "claimed") return claim.result;
  return executeClaimedRefund(refundId, claim.owner);
}

async function claimDueRefunds(
  now: Date,
  batchSize: number,
): Promise<{ owner: string; refundIds: string[] }> {
  const owner = `stripe-refund-${process.pid}-${randomUUID()}`;
  const leaseExpiresAt = new Date(now.getTime() + REFUND_LEASE_MS);
  const refundIds = await db.transaction(async (tx) => {
    const candidates = await tx
      .select()
      .from(paymentRefundsTable)
      .where(
        and(
          inArray(paymentRefundsTable.status, [
            "pending",
            "failed",
            "processing",
          ]),
          lte(paymentRefundsTable.nextAttemptAt, now),
          or(
            isNull(paymentRefundsTable.leaseExpiresAt),
            lte(paymentRefundsTable.leaseExpiresAt, now),
          ),
        ),
      )
      .orderBy(paymentRefundsTable.nextAttemptAt)
      .limit(batchSize)
      .for("update", { skipLocked: true });
    const claimed: string[] = [];
    for (const refund of candidates) {
      if (refund.attemptCount >= refund.maxAttempts) {
        const [manual] = await tx
          .update(paymentRefundsTable)
          .set({
            status: "manual_required",
            completedAt: now,
            leaseOwner: null,
            leaseExpiresAt: null,
            lastErrorCode:
              refund.lastErrorCode ?? "refund_attempts_exhausted",
            lastErrorMessage:
              refund.lastErrorMessage ??
              "Numero massimo di tentativi automatici raggiunto.",
            updatedAt: now,
          })
          .where(eq(paymentRefundsTable.id, refund.id))
          .returning();
        if (manual) {
          await queueAdminNotice(tx, {
            bookingId: manual.bookingId,
            paymentRequestId: manual.paymentRequestId,
            paymentAttemptId: manual.paymentAttemptId,
            paymentIntentId:
              paymentIntentIdFromRefund(manual) ?? "non disponibile",
            amountCents: manual.amountCents,
            reason: manual.reason,
            refundId: manual.id,
            state: "manual_required",
            detail: manual.lastErrorMessage,
          });
        }
        continue;
      }
      const [updated] = await tx
        .update(paymentRefundsTable)
        .set({
          status: "processing",
          attemptCount: refund.attemptCount + 1,
          lastAttemptAt: now,
          leaseOwner: owner,
          leaseExpiresAt,
          updatedAt: now,
        })
        .where(eq(paymentRefundsTable.id, refund.id))
        .returning({ id: paymentRefundsTable.id });
      if (updated) claimed.push(updated.id);
    }
    return claimed;
  });
  return { owner, refundIds };
}

/** Batch concorrente-safe usato dallo scheduler in-process. */
export async function processDueBookingRefunds(options?: {
  now?: Date;
  batchSize?: number;
}): Promise<{ leased: number }> {
  const { owner, refundIds } = await claimDueRefunds(
    options?.now ?? new Date(),
    options?.batchSize ?? DEFAULT_REFUND_BATCH_SIZE,
  );
  for (const refundId of refundIds) {
    try {
      await executeClaimedRefund(refundId, owner);
    } catch (error) {
      logger.warn(
        { err: error, refundId },
        "Rimborso Stripe pianificato per un nuovo tentativo",
      );
    }
  }
  return { leased: refundIds.length };
}

/** Allinea un rimborso gia noto quando Stripe invia refund.updated/failed. */
export async function reconcileStripeRefund(
  stripeRefund: Stripe.Refund,
): Promise<BookingRefundResult | null> {
  const metadataRefundId = stripeRefund.metadata?.paymentRefundId;
  const metadataAttemptId = stripeRefund.metadata?.paymentRefundAttemptId;
  let [providerAttempt] = metadataAttemptId
    ? await db
        .select()
        .from(paymentRefundAttemptsTable)
        .where(eq(paymentRefundAttemptsTable.id, metadataAttemptId))
        .limit(1)
    : await db
        .select()
        .from(paymentRefundAttemptsTable)
        .where(
          eq(paymentRefundAttemptsTable.stripeRefundId, stripeRefund.id),
        )
        .limit(1);
  const [record] = metadataRefundId
    ? await db
        .select({ id: paymentRefundsTable.id })
        .from(paymentRefundsTable)
        .where(eq(paymentRefundsTable.id, metadataRefundId))
        .limit(1)
    : providerAttempt
      ? [{ id: providerAttempt.paymentRefundId }]
      : await db
          .select({ id: paymentRefundsTable.id })
          .from(paymentRefundsTable)
          .where(eq(paymentRefundsTable.stripeRefundId, stripeRefund.id))
          .limit(1);
  if (!record) return null;

  const ctx = await loadRefund(record.id);
  if (!ctx) return null;

  if (!providerAttempt) {
    providerAttempt = await db.transaction(async (tx) => {
      const [latest] = await tx
        .select()
        .from(paymentRefundAttemptsTable)
        .where(eq(paymentRefundAttemptsTable.paymentRefundId, ctx.refund.id))
        .orderBy(desc(paymentRefundAttemptsTable.attemptNumber))
        .for("update")
        .limit(1);
      const [created] = await tx
        .insert(paymentRefundAttemptsTable)
        .values({
          paymentRefundId: ctx.refund.id,
          attemptNumber: (latest?.attemptNumber ?? 0) + 1,
          idempotencyKey: `recovered-refund-${stripeRefund.id}`,
          stripeRefundId: stripeRefund.id,
          status: "processing",
        })
        .onConflictDoNothing()
        .returning();
      if (created) return created;
      const [existing] = await tx
        .select()
        .from(paymentRefundAttemptsTable)
        .where(
          eq(paymentRefundAttemptsTable.stripeRefundId, stripeRefund.id),
        )
        .limit(1);
      return existing;
    });
  }
  if (!providerAttempt || providerAttempt.paymentRefundId !== ctx.refund.id) {
    logger.error(
      { refundId: ctx.refund.id, stripeRefundId: stripeRefund.id },
      "Evento refund non associabile a un tentativo provider",
    );
    return persistRefundState(ctx, {
      status: "manual_required",
      errorCode: "refund_attempt_reference_mismatch",
      errorMessage: "Tentativo provider Stripe non coerente col rimborso.",
    });
  }

  const refundPaymentIntentId =
    typeof stripeRefund.payment_intent === "string"
      ? stripeRefund.payment_intent
      : (stripeRefund.payment_intent?.id ?? null);
  const referenceMismatch =
    !ctx.paymentIntentId ||
    refundPaymentIntentId !== ctx.paymentIntentId ||
    stripeRefund.amount !== ctx.refund.amountCents;
  if (referenceMismatch) {
    logger.error(
      {
        refundId: ctx.refund.id,
        stripeRefundId: stripeRefund.id,
        expectedPaymentIntentId: ctx.paymentIntentId,
        receivedPaymentIntentId: refundPaymentIntentId,
        expectedAmountCents: ctx.refund.amountCents,
        receivedAmountCents: stripeRefund.amount,
      },
      "Evento rimborso Stripe non coerente con il record finanziario",
    );
    return persistRefundState(ctx, {
      status: "manual_required",
      errorCode: "refund_reference_mismatch",
      errorMessage:
        "Evento Stripe non coerente con PaymentIntent, importo o Refund registrato.",
    });
  }

  const state = stripeRefundState(stripeRefund);
  await persistProviderRefundAttempt(providerAttempt.id, {
    ...state,
    stripeRefundId: stripeRefund.id,
  });

  // Un evento tardivo failed di un tentativo provider precedente non deve
  // retrocedere il tentativo nuovo. Una riuscita, invece, chiude sempre il
  // rimborso perche il denaro e stato effettivamente restituito.
  const [latestAttempt] = await db
    .select({ id: paymentRefundAttemptsTable.id })
    .from(paymentRefundAttemptsTable)
    .where(eq(paymentRefundAttemptsTable.paymentRefundId, ctx.refund.id))
    .orderBy(desc(paymentRefundAttemptsTable.attemptNumber))
    .limit(1);
  if (
    latestAttempt &&
    latestAttempt.id !== providerAttempt.id &&
    state.status !== "succeeded"
  ) {
    return refundResult(ctx.refund);
  }
  return persistRefundState(ctx, {
    ...state,
    stripeRefundId: stripeRefund.id,
  });
}
