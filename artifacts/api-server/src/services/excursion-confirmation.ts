import type Stripe from "stripe";
import { db } from "@workspace/db";
import {
  bookingConsentsTable,
  excursionBookingsTable,
  excursionsTable,
  paymentAttemptsTable,
  paymentRequestsTable,
} from "@workspace/db/schema";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  ne,
  notInArray,
} from "drizzle-orm";
import { logger } from "../lib/logger";
import { getCurrentTermsVersion } from "./iubenda-terms";
import { ensureBalanceRequest } from "./booking-balance";
import {
  dispatchExcursionConfirmedEmailV2,
  dispatchPaymentActionRequiredEmailV2,
  dispatchTermsReacceptanceEmailV2,
} from "./excursion-booking-emails-v2";
import {
  computeBalanceDueAt,
  computeGraceUntil,
  isDepartureOpenForBooking,
} from "./excursion-time";
import {
  applySuccessfulCardPayment,
  cardPaymentApplicationDisposition,
} from "./excursion-payments";
import {
  getPaymentSettings,
  isStripeChargeAmountSupported,
} from "./excursion-pricing";
import { stripe } from "./stripe";
import { isPaymentBlockedByCancellation } from "./booking-cancellation-guard";
import { scheduleStripeCleanupWithFallback } from "./stripe-cleanup";

export type ConfirmedBookingRecoveryOutcome =
  | "paid"
  | "paid_balance_created"
  | "balance_created"
  | "action_required"
  | "skipped";

export type ConfirmationFinalState = "confirmed" | "not_found" | "superseded";

export function confirmationFinalState(
  excursionStatus: string | null,
): ConfirmationFinalState {
  if (excursionStatus === null) return "not_found";
  return excursionStatus === "confirmed" ? "confirmed" : "superseded";
}

/**
 * Ripetere esplicitamente `status=confirmed` e un comando di recovery, non un
 * no-op: ogni effetto a valle e protetto da business key/idempotenza proprie.
 */
export function shouldRunConfirmationWorkflow(input: {
  statusExplicitlyRequested: boolean;
  requestedStatus: string;
}): boolean {
  return (
    input.statusExplicitlyRequested && input.requestedStatus === "confirmed"
  );
}

export function confirmationChargeIdempotencyKey(input: {
  excursionId: string;
  bookingId: string;
  requestType: string;
}): string {
  return `confirm-${input.excursionId}-${input.bookingId}-${input.requestType}`;
}

export function savedCardDepositChargePlan(input: {
  authorizedDepositCents: number | null;
  residualCents: number;
}): { requestType: "deposit"; amountCents: number } {
  const residual = Math.max(0, Math.trunc(input.residualCents));
  const authorized = Math.max(
    0,
    Math.trunc(input.authorizedDepositCents ?? residual),
  );
  return {
    requestType: "deposit",
    amountCents: Math.min(authorized, residual),
  };
}

export type ConfirmationAutoChargeBlockReason =
  | "saved_card_missing"
  | "stripe_unavailable"
  | "future_card_charge_disabled"
  | "card_payments_disabled"
  | "excursion_card_payments_disabled"
  | "stripe_amount_below_minimum"
  | "terms_version_changed"
  | "terms_version_unavailable";

export function confirmationAutoChargeBlockReason(input: {
  stripeConfigured: boolean;
  futureCardChargeEnabled: boolean;
  cardPaymentsEnabled: boolean;
  excursionCardPaymentsEnabled: boolean;
  amountCents: number;
  /** Versione dei T&C accettata dal cliente al momento della prenotazione. */
  acceptedTermsVersion?: string | null;
  /** Versione pubblicata adesso su Iubenda; `null` se non determinabile. */
  currentTermsVersion?: string | null;
}): ConfirmationAutoChargeBlockReason | null {
  if (!input.futureCardChargeEnabled) return "future_card_charge_disabled";
  if (!input.cardPaymentsEnabled) return "card_payments_disabled";
  if (!input.excursionCardPaymentsEnabled) {
    return "excursion_card_payments_disabled";
  }
  if (!input.stripeConfigured) return "stripe_unavailable";
  if (!isStripeChargeAmountSupported(input.amountCents)) {
    return "stripe_amount_below_minimum";
  }
  // Il cliente ha autorizzato l'addebito leggendo una certa versione dei T&C.
  // Se il testo e cambiato da allora, quell'autorizzazione non copre piu il
  // testo in vigore: l'acconto non parte in automatico e la prenotazione
  // finisce tra quelle da lavorare a mano, dove si chiede una nuova
  // accettazione. Non potendo sapere quale sia la versione corrente si applica
  // la stessa cautela: non si addebita cio che non si puo verificare.
  if (!input.currentTermsVersion || !input.acceptedTermsVersion) {
    return "terms_version_unavailable";
  }
  if (input.acceptedTermsVersion !== input.currentTermsVersion) {
    return "terms_version_changed";
  }
  return null;
}

/**
 * La prenotazione e ferma perche il cliente deve riaccettare i Termini?
 *
 * Distinzione importante rispetto a `confirmationAutoChargeBlockReason`: li si
 * decide se addebitare, qui se ha senso *chiedere qualcosa al cliente*. Se non
 * sappiamo quale sia la versione in vigore il problema e nostro, non suo, e
 * chiedergli di riaccettare un testo che non riusciamo a leggere non avrebbe
 * senso.
 */
export function requiresTermsReacceptance(input: {
  acceptedTermsVersion: string | null;
  currentTermsVersion: string | null;
  hasSavedCard: boolean;
  cancelled: boolean;
}): boolean {
  if (input.cancelled || !input.hasSavedCard) return false;
  if (!input.currentTermsVersion) return false;
  return input.acceptedTermsVersion !== input.currentTermsVersion;
}

async function markActionRequired(opts: {
  bookingId: string;
  requestId: string;
  attemptId: string;
  requestType: string;
  paymentIntent?: Stripe.PaymentIntent | null;
  requestMethod?: "card" | null;
  error: unknown;
  /**
   * Se l'addebito si e fermato perche il testo dei Termini e cambiato, al
   * cliente non va chiesto di "completare il pagamento" — non deve pagare
   * niente, deve dare una conferma. Serve un'altra email.
   */
  blockReason?: ConfirmationAutoChargeBlockReason | null;
}): Promise<void> {
  const now = new Date();
  const detail =
    opts.error instanceof Error ? opts.error.message : String(opts.error);
  const code = (opts.error as { code?: string } | null)?.code ?? null;
  const shouldNotify = await db.transaction(async (tx) => {
    const [attemptUpdated] = await tx
      .update(paymentAttemptsTable)
      .set({
        status: "action_required",
        stripePaymentIntentId: opts.paymentIntent?.id,
        lastErrorCode: code,
        lastErrorMessage: detail.slice(0, 2_000),
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(paymentAttemptsTable.id, opts.attemptId),
          ne(paymentAttemptsTable.status, "succeeded"),
        ),
      )
      .returning({ id: paymentAttemptsTable.id });
    if (!attemptUpdated) return false;

    const [requestUpdated] = await tx
      .update(paymentRequestsTable)
      .set({
        status: "action_required",
        method: opts.requestMethod === undefined ? "card" : opts.requestMethod,
        stripePaymentIntentId: opts.paymentIntent?.id,
        updatedAt: now,
      })
      .where(
        and(
          eq(paymentRequestsTable.id, opts.requestId),
          notInArray(paymentRequestsTable.status, [
            "paid",
            "refund_required",
            "refunded",
          ]),
        ),
      )
      .returning({ id: paymentRequestsTable.id });
    if (!requestUpdated) return false;

    await tx
      .update(excursionBookingsTable)
      .set({
        paymentStatus: "charge_failed",
        ...(opts.requestMethod !== undefined
          ? { paymentMethod: opts.requestMethod }
          : {}),
        stripePaymentIntentId: opts.paymentIntent?.id,
        updatedAt: now,
      })
      .where(
        and(
          eq(excursionBookingsTable.id, opts.bookingId),
          notInArray(excursionBookingsTable.paymentStatus, [
            "deposit",
            "paid",
            "refund_required",
            "refunded",
          ]),
        ),
      );
    return true;
  });
  if (shouldNotify) {
    if (opts.blockReason === "terms_version_changed") {
      await dispatchTermsReacceptanceEmailV2(opts.bookingId, opts.requestId);
    } else {
      await dispatchPaymentActionRequiredEmailV2(
        opts.bookingId,
        opts.requestType,
        opts.requestId,
      );
    }
  }
}

async function minimizeSavedCardDataAfterCharge(input: {
  bookingId: string;
  stripeCustomerId: string | null;
}): Promise<void> {
  if (!input.stripeCustomerId) return;
  const outcome = await scheduleStripeCleanupWithFallback({
    bookingId: input.bookingId,
    operation: "delete_customer",
    stripeResourceId: input.stripeCustomerId,
  });
  if (outcome === "unresolved") {
    logger.error(
      { bookingId: input.bookingId, stripeCustomerId: input.stripeCustomerId },
      "Customer Stripe non eliminato dopo l'addebito dell'acconto",
    );
  }
}

/**
 * Anche un deposito completato dal portale dopo un off-session fallito deve
 * eliminare il Customer salvato; non solo il percorso automatico sincrono.
 */
export async function minimizeSavedCardDataForBooking(
  bookingId: string,
): Promise<void> {
  const [booking] = await db
    .select({ stripeCustomerId: excursionBookingsTable.stripeCustomerId })
    .from(excursionBookingsTable)
    .where(eq(excursionBookingsTable.id, bookingId))
    .limit(1);
  await minimizeSavedCardDataAfterCharge({
    bookingId,
    stripeCustomerId: booking?.stripeCustomerId ?? null,
  });
}

async function chargeSavedCardAtConfirmation(
  bookingId: string,
  now: Date,
): Promise<ConfirmedBookingRecoveryOutcome> {
  const settings = await getPaymentSettings();
  // Fuori dalla transazione: e una chiamata di rete, non deve tenere aperto un
  // lock sulla prenotazione.
  const currentTermsVersion = await getCurrentTermsVersion();

  const prepared = await db.transaction(async (tx) => {
    const [booking] = await tx
      .select()
      .from(excursionBookingsTable)
      .where(eq(excursionBookingsTable.id, bookingId))
      .for("update")
      .limit(1);
    if (
      !booking ||
      booking.cancelledAt ||
      booking.paymentStatus !== "card_saved"
    )
      return null;
    if (isPaymentBlockedByCancellation(booking)) {
      return { kind: "cancellation_in_progress" as const, booking };
    }
    const [excursion] = await tx
      .select()
      .from(excursionsTable)
      .where(eq(excursionsTable.id, booking.excursionId))
      .limit(1);
    if (!excursion?.departureAt || excursion.status !== "confirmed")
      return { kind: "invalid" as const, booking };

    const dueAt = computeBalanceDueAt(
      excursion.departureAt,
      excursion.balanceHoursOverride ?? settings.balanceHours,
    );
    if (!dueAt) return { kind: "invalid" as const, booking };
    const residual = Math.max(
      (booking.totalAmountCents ?? 0) - booking.amountPaidCents,
      0,
    );
    if (residual <= 0) return null;
    // Il consenso off-session copre esclusivamente l'acconto autorizzato al
    // momento della prenotazione. Anche oltre T-48 il residuo viene richiesto
    // separatamente via portale, mai addebitato automaticamente.
    const plan = savedCardDepositChargePlan({
      authorizedDepositCents: booking.amountDueCents,
      residualCents: residual,
    });
    const requestType = plan.requestType;
    const amount = plan.amountCents;
    if (amount <= 0) return null;
    // Versione dei T&C che il cliente aveva davanti quando ha autorizzato.
    const [acceptedConsent] = await tx
      .select({ policyVersion: bookingConsentsTable.policyVersion })
      .from(bookingConsentsTable)
      .where(
        and(
          eq(bookingConsentsTable.bookingId, booking.id),
          eq(bookingConsentsTable.consentType, "future_card_charge"),
          eq(bookingConsentsTable.accepted, true),
        ),
      )
      .limit(1);
    const blockReason =
      !booking.stripeCustomerId || !booking.stripePaymentMethodId
        ? ("saved_card_missing" as const)
        : booking.paymentType !== "deposit"
          ? ("future_card_charge_disabled" as const)
          : confirmationAutoChargeBlockReason({
              stripeConfigured: Boolean(stripe),
              futureCardChargeEnabled: settings.futureCardChargeEnabled,
              cardPaymentsEnabled: settings.cardPaymentsEnabled,
              excursionCardPaymentsEnabled: excursion.payCardEnabled,
              amountCents: amount,
              acceptedTermsVersion: acceptedConsent?.policyVersion ?? null,
              currentTermsVersion,
            });

    let [request] = await tx
      .select()
      .from(paymentRequestsTable)
      .where(
        and(
          eq(paymentRequestsTable.bookingId, booking.id),
          inArray(paymentRequestsTable.status, [
            "pending",
            "scheduled",
            "action_required",
          ]),
        ),
      )
      .orderBy(desc(paymentRequestsTable.createdAt))
      .limit(1);
    if (!request) {
      [request] = await tx
        .insert(paymentRequestsTable)
        .values({
          bookingId: booking.id,
          type: requestType,
          amountCents: amount,
          method: "card",
          status: "pending",
          deadline: now,
          graceUntil: computeGraceUntil({
            deadline: now,
            graceMinutes: settings.paymentGraceMinutes,
            departureAt: excursion.departureAt,
          }),
        })
        .returning();
    } else {
      [request] = await tx
        .update(paymentRequestsTable)
        .set({
          type: requestType,
          amountCents: amount,
          method: "card",
          status: "pending",
          deadline: now,
          graceUntil: computeGraceUntil({
            deadline: now,
            graceMinutes: settings.paymentGraceMinutes,
            departureAt: excursion.departureAt,
          }),
          updatedAt: now,
        })
        .where(eq(paymentRequestsTable.id, request.id))
        .returning();
    }

    const idempotencyKey = confirmationChargeIdempotencyKey({
      excursionId: excursion.id,
      bookingId: booking.id,
      requestType,
    });
    let [attempt] = await tx
      .select()
      .from(paymentAttemptsTable)
      .where(eq(paymentAttemptsTable.idempotencyKey, idempotencyKey))
      .limit(1);
    if (!attempt) {
      [attempt] = await tx
        .insert(paymentAttemptsTable)
        .values({
          paymentRequestId: request.id,
          amountCents: amount,
          idempotencyKey,
          status: "pending",
        })
        .onConflictDoNothing({ target: paymentAttemptsTable.idempotencyKey })
        .returning();
      if (!attempt) {
        [attempt] = await tx
          .select()
          .from(paymentAttemptsTable)
          .where(eq(paymentAttemptsTable.idempotencyKey, idempotencyKey))
          .limit(1);
      }
    }
    if (!attempt) throw new Error("Tentativo di addebito non creato.");
    await tx
      .update(excursionBookingsTable)
      .set({ amountDueCents: amount, paymentType: requestType, updatedAt: now })
      .where(eq(excursionBookingsTable.id, booking.id));

    return {
      kind: blockReason
        ? ("manual_action_required" as const)
        : ("ready" as const),
      booking,
      excursion,
      request,
      attempt,
      amount,
      requestType,
      idempotencyKey,
      blockReason,
    };
  });

  if (!prepared) return "skipped";
  if (prepared.kind === "cancellation_in_progress") return "skipped";
  if (prepared.kind === "invalid") {
    logger.error(
      { bookingId },
      "Carta salvata incompleta: addebito alla conferma impossibile",
    );
    return "action_required";
  }

  if (prepared.kind === "manual_action_required") {
    await markActionRequired({
      bookingId,
      requestId: prepared.request.id,
      attemptId: prepared.attempt.id,
      requestType: prepared.requestType,
      requestMethod: null,
      blockReason: prepared.blockReason,
      error: new Error(
        `Addebito automatico non eseguito: ${prepared.blockReason ?? "configurazione_non_disponibile"}`,
      ),
    });
    logger.warn(
      { bookingId, reason: prepared.blockReason },
      "Addebito carta alla conferma sospeso dal kill switch/configurazione",
    );
    return "action_required";
  }

  const stripeClient = stripe;
  if (!stripeClient) {
    // Difesa contro un cambio di configurazione tra preparazione e provider.
    await markActionRequired({
      bookingId,
      requestId: prepared.request.id,
      attemptId: prepared.attempt.id,
      requestType: prepared.requestType,
      requestMethod: null,
      error: new Error("Stripe non disponibile alla conferma"),
    });
    return "action_required";
  }

  let resolvedIntent: Stripe.PaymentIntent | null = null;
  try {
    let intent: Stripe.PaymentIntent;
    if (prepared.attempt.stripePaymentIntentId) {
      intent = await stripeClient.paymentIntents.retrieve(
        prepared.attempt.stripePaymentIntentId,
      );
    } else {
      intent = await stripeClient.paymentIntents.create(
        {
          amount: prepared.amount,
          currency: "eur",
          customer: prepared.booking.stripeCustomerId!,
          payment_method: prepared.booking.stripePaymentMethodId!,
          confirm: true,
          off_session: true,
          payment_method_types: ["card"],
          receipt_email: prepared.booking.email ?? undefined,
          description: `${prepared.excursion.name} — ${prepared.requestType} ${prepared.booking.bookingCode ?? prepared.booking.id}`,
          metadata: {
            source: "elis-travel",
            flow: "trip-confirmation",
            bookingId: prepared.booking.id,
            paymentRequestId: prepared.request.id,
            paymentAttemptId: prepared.attempt.id,
            type: prepared.requestType,
          },
        },
        { idempotencyKey: prepared.idempotencyKey },
      );
      resolvedIntent = intent;
      await db
        .update(paymentAttemptsTable)
        .set({
          stripePaymentIntentId: intent.id,
          status: "processing",
          updatedAt: new Date(),
        })
        .where(eq(paymentAttemptsTable.id, prepared.attempt.id));
      await db
        .update(paymentRequestsTable)
        .set({ stripePaymentIntentId: intent.id, updatedAt: new Date() })
        .where(eq(paymentRequestsTable.id, prepared.request.id));
    }
    resolvedIntent = intent;

    if (intent.status === "succeeded") {
      const applied = await applySuccessfulCardPayment(intent);
      const disposition = cardPaymentApplicationDisposition(applied);
      if (disposition !== "applied") {
        logger.error(
          { bookingId, disposition, paymentIntentId: intent.id },
          "PaymentIntent riuscito non applicabile durante la conferma gita",
        );
        return "action_required";
      }
      if (applied) {
        await minimizeSavedCardDataAfterCharge({
          bookingId: prepared.booking.id,
          stripeCustomerId: prepared.booking.stripeCustomerId,
        });
      }
      return applied?.balanceRequestCreated ? "paid_balance_created" : "paid";
    }
    await markActionRequired({
      bookingId,
      requestId: prepared.request.id,
      attemptId: prepared.attempt.id,
      requestType: prepared.requestType,
      paymentIntent: intent,
      error: new Error(`PaymentIntent ${intent.status}`),
    });
    return "action_required";
  } catch (error) {
    const intent =
      (error as { payment_intent?: Stripe.PaymentIntent } | null)
        ?.payment_intent ?? resolvedIntent;
    if (intent?.status === "succeeded") {
      const applied = await applySuccessfulCardPayment(intent);
      const disposition = cardPaymentApplicationDisposition(applied);
      if (disposition !== "applied") {
        logger.error(
          { bookingId, disposition, paymentIntentId: intent.id },
          "PaymentIntent riuscito non applicabile nel recupero conferma gita",
        );
        return "action_required";
      }
      if (applied) {
        await minimizeSavedCardDataAfterCharge({
          bookingId: prepared.booking.id,
          stripeCustomerId: prepared.booking.stripeCustomerId,
        });
      }
      return applied?.balanceRequestCreated ? "paid_balance_created" : "paid";
    }
    await markActionRequired({
      bookingId,
      requestId: prepared.request.id,
      attemptId: prepared.attempt.id,
      requestType: prepared.requestType,
      paymentIntent: intent,
      error,
    });
    logger.warn(
      { err: error, bookingId },
      "Addebito carta alla conferma richiede intervento cliente",
    );
    return "action_required";
  }
}

/**
 * Recovery granulare usato dopo race SetupIntent/conferma e dopo il rigetto
 * di un annullamento. Non apre la gita e non effettua nulla se non e gia
 * confirmed; tutti gli effetti sono idempotenti.
 */
export async function recoverConfirmedBookingWorkflow(
  bookingId: string,
  now: Date = new Date(),
): Promise<ConfirmedBookingRecoveryOutcome> {
  const [snapshot] = await db
    .select({
      booking: excursionBookingsTable,
      excursionStatus: excursionsTable.status,
    })
    .from(excursionBookingsTable)
    .innerJoin(
      excursionsTable,
      eq(excursionBookingsTable.excursionId, excursionsTable.id),
    )
    .where(eq(excursionBookingsTable.id, bookingId))
    .limit(1);
  if (
    !snapshot ||
    snapshot.excursionStatus !== "confirmed" ||
    isPaymentBlockedByCancellation(snapshot.booking)
  ) {
    return "skipped";
  }
  let outcome: ConfirmedBookingRecoveryOutcome = "skipped";
  if (snapshot.booking.paymentStatus === "card_saved") {
    outcome = await chargeSavedCardAtConfirmation(bookingId, now);
  } else if (
    snapshot.booking.amountPaidCents > 0 &&
    snapshot.booking.paymentStatus !== "paid"
  ) {
    const balance = await ensureBalanceRequest(bookingId, {
      now,
      notify: true,
    });
    outcome = balance.kind === "created" ? "balance_created" : "skipped";
  }
  // Evento indipendente dall'incasso: serve anche alle prenotazioni già paid e
  // viene recuperato dai rerun grazie alla dedupe key dell'outbox.
  await dispatchExcursionConfirmedEmailV2(bookingId);
  return outcome;
}

export async function confirmExcursionWorkflow(excursionId: string): Promise<{
  status: "confirmed";
  cardCharged: number;
  actionRequired: number;
  balanceRequestsCreated: number;
  skipped: number;
}> {
  const transition = await db.transaction(async (tx) => {
    // Ordine globale condiviso con pagamenti e annullamento gita: tutte le
    // booking in ordine stabile, poi la gita. Nessuna chiamata Stripe avviene
    // dentro questa transazione.
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
    if (!excursion) throw new Error("NOT_FOUND");
    if (["completed", "cancelled", "archived"].includes(excursion.status)) {
      throw new Error("INVALID_STATUS");
    }
    const transitionNow = new Date();
    if (!excursion.departureAt) throw new Error("MISSING_DEPARTURE");
    if (!isDepartureOpenForBooking(excursion.departureAt, transitionNow)) {
      throw new Error("EXCURSION_DEPARTED");
    }

    // Una prenotazione puo essere stata inserita mentre attendevamo il lock
    // della gita. Ora il suo stato e stabile: rileggiamo e blocchiamo lo
    // snapshot autorevole prima della transizione.
    const bookings = await tx
      .select({
        id: excursionBookingsTable.id,
        seatStatus: excursionBookingsTable.seatStatus,
      })
      .from(excursionBookingsTable)
      .where(
        and(
          eq(excursionBookingsTable.excursionId, excursionId),
          isNull(excursionBookingsTable.cancelledAt),
        ),
      )
      .orderBy(asc(excursionBookingsTable.id))
      .for("update");

    await tx
      .update(excursionsTable)
      .set({
        status: "confirmed",
        confirmedAt: excursion.confirmedAt ?? transitionNow,
        updatedAt: transitionNow,
      })
      .where(eq(excursionsTable.id, excursion.id));

    return {
      bookingIds: bookings
        .filter((booking) => booking.seatStatus !== "released")
        .map((booking) => booking.id),
    };
  });

  let cardCharged = 0;
  let actionRequired = 0;
  let balanceRequestsCreated = 0;
  let skipped = 0;
  for (const bookingId of transition.bookingIds) {
    const outcome = await recoverConfirmedBookingWorkflow(bookingId);
    if (outcome === "paid" || outcome === "paid_balance_created") {
      cardCharged += 1;
      if (outcome === "paid_balance_created") balanceRequestsCreated += 1;
    } else if (outcome === "balance_created") {
      balanceRequestsCreated += 1;
    } else if (outcome === "action_required") {
      actionRequired += 1;
    } else {
      skipped += 1;
    }
  }

  // L'annullamento può iniziare subito dopo il commit della transizione e deve
  // restare libero di procedere mentre Stripe lavora. Prima della risposta
  // rileggiamo quindi lo stato autorevole e non dichiariamo mai confermata una
  // gita che nel frattempo è stata annullata o portata in uno stato terminale.
  const finalExcursionStatus = await db.transaction(async (tx) => {
    // Breve barriera finale con lo stesso ordine di lock: se un annullamento è
    // già in corso, attendiamo il suo commit prima di costruire la risposta.
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
    const [finalExcursion] = await tx
      .select({ status: excursionsTable.status })
      .from(excursionsTable)
      .where(eq(excursionsTable.id, excursionId))
      .for("update")
      .limit(1);
    return finalExcursion?.status ?? null;
  });
  const finalState = confirmationFinalState(finalExcursionStatus);
  if (finalState === "not_found") throw new Error("NOT_FOUND");
  if (finalState === "superseded") {
    throw new Error("CONFIRMATION_SUPERSEDED");
  }

  return {
    status: "confirmed",
    cardCharged,
    actionRequired,
    balanceRequestsCreated,
    skipped,
  };
}
