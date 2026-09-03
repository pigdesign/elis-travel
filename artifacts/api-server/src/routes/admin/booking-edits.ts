import { Router, type Request } from "express";
import { db } from "@workspace/db";
import {
  bookingAdminActionsTable,
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
  isNotNull,
  notInArray,
} from "drizzle-orm";
import { logger } from "../../lib/logger";
import {
  type AdminAssignableMethod,
  adminBookingTotalDecision,
  adminManualPaymentPlan,
  adminPaymentReversalDecision,
  adminRequestAmountDecision,
  adminRequestMethodDecision,
  BookingProfileValidationError,
  EDITABLE_REQUEST_STATUSES,
  isAdminAssignableMethod,
  isDuplicateManualPayment,
  normalizeAdminActionReason,
  normalizeBookingProfile,
  openRequestsRealignment,
  summaryStatusAfterManualMovement,
} from "../../services/admin-booking-edits";
import {
  getPaymentSettings,
  isOnBusPaymentAvailable,
} from "../../services/excursion-pricing";
import { balancePaymentWindowForMethod } from "../../services/booking-balance";
import {
  manualPaymentSeatRecoveryDecision,
  setBookingStatusWithCounters,
} from "../../services/excursion-payments";
import {
  confirmBookingSeatsInTransaction,
  reacquireBookingSeatsInTransaction,
} from "../../services/seat-reservations";
import { enqueueStripeCleanupJobInTransaction } from "../../services/stripe-cleanup";
import { planOfflineMethodCardCleanup } from "../../services/stripe-cleanup-policy";
import { isPaymentBlockedByCancellation } from "../../services/booking-cancellation-guard";
import { computeGraceUntil } from "../../services/excursion-time";

// ---------------------------------------------------------------------------
// Correzioni manuali su una prenotazione gia salvata.
//
// Il registro contabile resta quello di Gite v2 — un'obbligazione per riga in
// payment_requests, la prenotazione come riepilogo derivato — ma da qui
// l'ufficio puo finalmente intervenire su tutto cio che prima poteva decidere
// soltanto il cliente dal portale: assegnare il metodo di pagamento,
// correggere un importo, registrare un incasso arrivato allo sportello,
// stornare una registrazione sbagliata, sistemare l'anagrafica del referente.
//
// Ogni intervento lascia una riga in booking_admin_actions: chi, quando,
// perche. E il prezzo per poter modificare tutto senza perdere la
// ricostruibilita dei conti.
// ---------------------------------------------------------------------------

const router = Router();

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function adminIdentity(req: Request): {
  id: string | null;
  name: string | null;
} {
  const adminUser = req.session?.adminUser;
  return { id: adminUser?.id ?? null, name: adminUser?.name ?? null };
}

async function recordAdminAction(
  tx: Tx,
  input: {
    bookingId: string;
    paymentRequestId?: string | null;
    action: string;
    reason: string | null;
    details: Record<string, unknown>;
    admin: { id: string | null; name: string | null };
  },
): Promise<void> {
  await tx.insert(bookingAdminActionsTable).values({
    bookingId: input.bookingId,
    paymentRequestId: input.paymentRequestId ?? null,
    action: input.action,
    reason: input.reason,
    details: input.details,
    adminUserId: input.admin.id,
    adminName: input.admin.name,
  });
}

/**
 * Somma degli incassi realmente applicati alla prenotazione, letta dalle
 * richieste e non dal riepilogo: dopo uno storno le due cose possono divergere
 * per un istante, e la fonte autorevole e sempre il registro.
 */
async function paidCentsExcluding(
  tx: Tx,
  bookingId: string,
  excludeRequestId: string | null,
): Promise<number> {
  const rows = await tx
    .select({
      id: paymentRequestsTable.id,
      amountCents: paymentRequestsTable.amountCents,
    })
    .from(paymentRequestsTable)
    .where(
      and(
        eq(paymentRequestsTable.bookingId, bookingId),
        eq(paymentRequestsTable.status, "paid"),
      ),
    );
  return rows
    .filter((row) => row.id !== excludeRequestId)
    .reduce((sum, row) => sum + row.amountCents, 0);
}

async function openRequestsFor(
  tx: Tx,
  bookingId: string,
): Promise<Array<{ id: string; type: string; amountCents: number }>> {
  return tx
    .select({
      id: paymentRequestsTable.id,
      type: paymentRequestsTable.type,
      amountCents: paymentRequestsTable.amountCents,
    })
    .from(paymentRequestsTable)
    .where(
      and(
        eq(paymentRequestsTable.bookingId, bookingId),
        inArray(paymentRequestsTable.status, [...EDITABLE_REQUEST_STATUSES]),
      ),
    )
    .orderBy(asc(paymentRequestsTable.createdAt));
}

/**
 * Riporta riepilogo economico e richieste aperte in accordo con gli incassi
 * effettivi. Chiamata dopo ogni movimento manuale: e il punto in cui la
 * prenotazione torna a raccontare la verita del registro.
 */
async function reconcileBookingTotals(
  tx: Tx,
  booking: typeof excursionBookingsTable.$inferSelect,
  now: Date,
): Promise<{ amountPaidCents: number; residualCents: number | null }> {
  const amountPaidCents = await paidCentsExcluding(tx, booking.id, null);
  const residualCents =
    booking.totalAmountCents === null
      ? null
      : booking.totalAmountCents - amountPaidCents;

  if (residualCents !== null) {
    const openRequests = await openRequestsFor(tx, booking.id);
    const realignment = openRequestsRealignment({
      residualCents,
      openRequests,
    });
    if (realignment.cancel.length > 0) {
      await tx
        .update(paymentRequestsTable)
        .set({ status: "cancelled", updatedAt: now })
        .where(inArray(paymentRequestsTable.id, realignment.cancel));
    }
    if (realignment.setAmount) {
      await tx
        .update(paymentRequestsTable)
        .set({ amountCents: realignment.setAmount.amountCents, updatedAt: now })
        .where(eq(paymentRequestsTable.id, realignment.setAmount.id));
    }
  }

  const [openAfter] = await tx
    .select({
      id: paymentRequestsTable.id,
      amountCents: paymentRequestsTable.amountCents,
      deadline: paymentRequestsTable.deadline,
      method: paymentRequestsTable.method,
    })
    .from(paymentRequestsTable)
    .where(
      and(
        eq(paymentRequestsTable.bookingId, booking.id),
        inArray(paymentRequestsTable.status, [...EDITABLE_REQUEST_STATUSES]),
      ),
    )
    .orderBy(desc(paymentRequestsTable.createdAt))
    .limit(1);

  await tx
    .update(excursionBookingsTable)
    .set({
      amountPaidCents,
      amountDueCents: openAfter?.amountCents ?? 0,
      paymentDeadline: openAfter?.deadline ?? null,
      paymentMethod: openAfter?.method ?? booking.paymentMethod,
      updatedAt: now,
    })
    .where(eq(excursionBookingsTable.id, booking.id));

  return { amountPaidCents, residualCents };
}

function summaryStatusFor(
  amountPaidCents: number,
  totalAmountCents: number | null,
  fallbackStatus: string,
): string {
  return summaryStatusAfterManualMovement({
    amountPaidCents,
    totalAmountCents,
    fallbackStatus,
  });
}

/**
 * Spegne i tentativi Stripe rimasti appesi su una richiesta che passa a un
 * metodo offline. Senza, un PaymentIntent ancora vivo potrebbe incassare
 * denaro su un'obbligazione che l'ufficio ha gia chiuso per contanti.
 */
async function cancelStaleCardAttempts(
  tx: Tx,
  input: {
    bookingId: string;
    paymentRequestId: string;
    offlineMethod: string;
    now: Date;
  },
): Promise<void> {
  const staleCardAttempts = await tx
    .select({
      id: paymentAttemptsTable.id,
      stripePaymentIntentId: paymentAttemptsTable.stripePaymentIntentId,
    })
    .from(paymentAttemptsTable)
    .where(
      and(
        eq(paymentAttemptsTable.paymentRequestId, input.paymentRequestId),
        isNotNull(paymentAttemptsTable.stripePaymentIntentId),
        inArray(paymentAttemptsTable.status, [
          "pending",
          "processing",
          "action_required",
          "failed",
          "cancellation_pending",
        ]),
      ),
    )
    .for("update");
  const cleanupPlan = planOfflineMethodCardCleanup(
    input.offlineMethod,
    staleCardAttempts,
  );
  for (const item of cleanupPlan) {
    await enqueueStripeCleanupJobInTransaction(tx, {
      bookingId: input.bookingId,
      operation: "cancel_payment_intent",
      stripeResourceId: item.paymentIntentId,
    });
  }
  if (cleanupPlan.length > 0) {
    await tx
      .update(paymentAttemptsTable)
      .set({ status: "cancellation_pending", updatedAt: input.now })
      .where(
        and(
          inArray(
            paymentAttemptsTable.id,
            cleanupPlan.map((item) => item.attemptId),
          ),
          notInArray(paymentAttemptsTable.status, ["succeeded", "cancelled"]),
        ),
      );
  }
}

async function loadBookingForUpdate(
  tx: Tx,
  bookingId: string,
): Promise<typeof excursionBookingsTable.$inferSelect | null> {
  const [booking] = await tx
    .select()
    .from(excursionBookingsTable)
    .where(eq(excursionBookingsTable.id, bookingId))
    .for("update")
    .limit(1);
  return booking ?? null;
}

// ---------------------------------------------------------------------------
// Anagrafica del referente e totale della prenotazione.
// ---------------------------------------------------------------------------
// Il percorso deve finire con /profile: e quello dichiarato nell'openapi
// (updateAdminBookingProfile) e quello che il pannello admin chiama davvero.
// Senza, la modifica di anagrafica e totale riceve 404.
router.patch("/bookings/:bookingId/profile", async (req, res) => {
  try {
    const admin = adminIdentity(req);
    const body = req.body as Record<string, unknown>;
    const outcome = await db.transaction(async (tx) => {
      const booking = await loadBookingForUpdate(tx, req.params.bookingId);
      if (!booking) return { kind: "not_found" as const };
      if (booking.cancelledAt) return { kind: "cancelled" as const };

      const now = new Date();
      const before = {
        customerName: booking.customerName,
        email: booking.email,
        phone: booking.phone,
        customerNotificationsEnabled: booking.customerNotificationsEnabled,
        servizioCasa: booking.servizioCasa,
        homePickupAddress: booking.homePickupAddress,
      };
      let profile: ReturnType<typeof normalizeBookingProfile>;
      let reason: string | null;
      try {
        profile = normalizeBookingProfile(body, before);
        reason = normalizeAdminActionReason(body.reason, { required: false });
      } catch (error) {
        if (error instanceof BookingProfileValidationError) {
          return { kind: "invalid" as const, error: error.message };
        }
        throw error;
      }

      // Il totale viaggia insieme all'anagrafica ma ha regole sue: e denaro.
      let nextTotalCents: number | null = null;
      if (body.totalAmountCents !== undefined) {
        const requested = Number(body.totalAmountCents);
        const decision = adminBookingTotalDecision({
          nextTotalCents: requested,
          currentTotalCents: booking.totalAmountCents,
          amountPaidCents: booking.amountPaidCents,
        });
        if (decision === "invalid_amount") {
          return { kind: "invalid" as const, error: "Totale non valido." };
        }
        if (decision === "below_collected") {
          return { kind: "total_below_collected" as const };
        }
        if (decision === "apply") nextTotalCents = requested;
      }

      await tx
        .update(excursionBookingsTable)
        .set({
          ...profile,
          ...(nextTotalCents !== null
            ? { totalAmountCents: nextTotalCents }
            : {}),
          updatedAt: now,
        })
        .where(eq(excursionBookingsTable.id, booking.id));

      const [updated] = await tx
        .select()
        .from(excursionBookingsTable)
        .where(eq(excursionBookingsTable.id, booking.id))
        .limit(1);

      // Cambiare il totale sposta il residuo: le richieste aperte vanno
      // riallineate, altrimenti l'agenzia continua a chiedere la cifra vecchia.
      const totals =
        nextTotalCents !== null
          ? await reconcileBookingTotals(tx, updated, now)
          : null;
      if (totals) {
        await setBookingStatusWithCounters(
          tx,
          updated,
          summaryStatusFor(
            totals.amountPaidCents,
            updated.totalAmountCents,
            updated.paymentStatus,
          ),
        );
      }

      await recordAdminAction(tx, {
        bookingId: booking.id,
        action: "update_booking",
        reason,
        details: {
          before: {
            ...before,
            ...(nextTotalCents !== null
              ? { totalAmountCents: booking.totalAmountCents }
              : {}),
          },
          after: {
            ...profile,
            ...(nextTotalCents !== null
              ? { totalAmountCents: nextTotalCents }
              : {}),
          },
        },
        admin,
      });

      return { kind: "updated" as const };
    });

    if (outcome.kind === "not_found") {
      res.status(404).json({ error: "Prenotazione non trovata." });
      return;
    }
    if (outcome.kind === "cancelled") {
      res.status(409).json({
        error: "La prenotazione è annullata: i dati non sono più modificabili.",
        code: "BOOKING_CANCELLED",
      });
      return;
    }
    if (outcome.kind === "total_below_collected") {
      res.status(409).json({
        error:
          "Il totale non può scendere sotto l'importo già incassato: storna prima l'incasso in eccesso o apri un rimborso.",
        code: "TOTAL_BELOW_COLLECTED",
      });
      return;
    }
    if (outcome.kind === "invalid") {
      res.status(400).json({ error: outcome.error });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    logger.error({ err: error }, "Aggiornamento prenotazione admin fallito");
    res.status(500).json({ error: "Errore interno del server." });
  }
});

// ---------------------------------------------------------------------------
// Metodo, importo e scadenza di una richiesta ancora aperta.
// ---------------------------------------------------------------------------
router.patch("/payment-requests/:requestId", async (req, res) => {
  try {
    const admin = adminIdentity(req);
    const body = req.body as {
      method?: unknown;
      amountCents?: unknown;
      deadline?: unknown;
      reason?: unknown;
    };
    if (
      body.method === undefined &&
      body.amountCents === undefined &&
      body.deadline === undefined
    ) {
      res.status(400).json({ error: "Nessuna modifica richiesta." });
      return;
    }
    let requestedMethod: AdminAssignableMethod | undefined;
    if (body.method !== undefined) {
      if (!isAdminAssignableMethod(body.method)) {
        res.status(400).json({
          error:
            "Metodo non assegnabile dall'amministrazione: sono ammessi bonifico, ufficio e incasso a bordo.",
          code: "METHOD_NOT_ASSIGNABLE",
        });
        return;
      }
      requestedMethod = body.method;
    }
    const settings = await getPaymentSettings();

    const outcome = await db.transaction(async (tx) => {
      const [request] = await tx
        .select()
        .from(paymentRequestsTable)
        .where(eq(paymentRequestsTable.id, req.params.requestId))
        .for("update")
        .limit(1);
      if (!request) return { kind: "not_found" as const };

      const booking = await loadBookingForUpdate(tx, request.bookingId);
      if (!booking) return { kind: "not_found" as const };
      if (booking.cancelledAt) return { kind: "cancelled" as const };
      if (isPaymentBlockedByCancellation(booking)) {
        return { kind: "cancellation_in_progress" as const };
      }

      const [excursion] = await tx
        .select()
        .from(excursionsTable)
        .where(eq(excursionsTable.id, booking.excursionId))
        .for("update")
        .limit(1);
      if (!excursion) return { kind: "not_found" as const };
      if (["completed", "cancelled", "archived"].includes(excursion.status)) {
        return { kind: "excursion_closed" as const };
      }

      const now = new Date();
      let reason: string | null;
      try {
        // Il motivo diventa obbligatorio solo quando cambia l'importo: li si
        // sta riscrivendo quanto l'agenzia pretende dal cliente.
        reason = normalizeAdminActionReason(body.reason, {
          required: body.amountCents !== undefined,
        });
      } catch (error) {
        if (error instanceof BookingProfileValidationError) {
          return { kind: "invalid" as const, error: error.message };
        }
        throw error;
      }

      const changes: Record<string, unknown> = {};
      const before: Record<string, unknown> = {};
      let nextMethod: string | null = request.method;

      if (requestedMethod !== undefined) {
        const decision = adminRequestMethodDecision({
          requestStatus: request.status,
          requestType: request.type,
          currentMethod: request.method,
          nextMethod: requestedMethod,
          onBusAvailable: isOnBusPaymentAvailable(
            excursion,
            settings,
            request.type,
          ),
        });
        if (decision !== "apply" && decision !== "unchanged") {
          return { kind: decision };
        }
        if (decision === "apply") {
          before.method = request.method;
          changes.method = requestedMethod;
          nextMethod = requestedMethod;
        }
      }

      if (body.amountCents !== undefined) {
        const nextAmountCents = Number(body.amountCents);
        const paidElsewhere = await paidCentsExcluding(
          tx,
          booking.id,
          request.id,
        );
        const decision = adminRequestAmountDecision({
          requestStatus: request.status,
          requestType: request.type,
          currentAmountCents: request.amountCents,
          nextAmountCents,
          totalAmountCents: booking.totalAmountCents,
          paidOnOtherRequestsCents: paidElsewhere,
        });
        if (decision !== "apply" && decision !== "unchanged") {
          return { kind: decision };
        }
        if (decision === "apply") {
          before.amountCents = request.amountCents;
          changes.amountCents = nextAmountCents;
        }
      }

      // Il passaggio da e verso il saldo a bordo ricalcola la finestra di
      // pagamento con la stessa regola del portale: fino alla partenza per il
      // bus, scadenza canonica del saldo per chi paga prima di salire.
      const busWindow =
        request.type === "balance" &&
        nextMethod !== request.method &&
        (nextMethod === "on_bus" || request.method === "on_bus")
          ? balancePaymentWindowForMethod({
              method: nextMethod ?? "bank_transfer",
              departureAt: excursion.departureAt,
              balanceHours:
                excursion.balanceHoursOverride ?? settings.balanceHours,
              graceMinutes: settings.paymentGraceMinutes,
              now,
            })
          : null;
      if (busWindow) {
        before.deadline = request.deadline;
        changes.deadline = busWindow.deadline;
        changes.graceUntil = busWindow.graceUntil;
      }

      // Una scadenza indicata esplicitamente vince sul ricalcolo automatico:
      // l'operatore che scrive una data sta concedendo una proroga precisa.
      if (body.deadline !== undefined) {
        const parsed = body.deadline ? new Date(String(body.deadline)) : null;
        if (!parsed || !Number.isFinite(parsed.getTime())) {
          return { kind: "invalid" as const, error: "Scadenza non valida." };
        }
        if (!excursion.departureAt)
          return { kind: "missing_departure" as const };
        if (parsed >= excursion.departureAt) {
          return { kind: "after_departure" as const };
        }
        before.deadline = request.deadline;
        changes.deadline = parsed;
        changes.graceUntil = computeGraceUntil({
          deadline: parsed,
          graceMinutes: settings.paymentGraceMinutes,
          departureAt: excursion.departureAt,
        });
      }

      if (Object.keys(changes).length === 0) {
        return { kind: "unchanged" as const };
      }

      // Uscendo dalla carta si spengono i tentativi Stripe rimasti appesi,
      // esattamente come fa il portale.
      if (changes.method && changes.method !== "card") {
        await cancelStaleCardAttempts(tx, {
          bookingId: booking.id,
          paymentRequestId: request.id,
          offlineMethod: String(changes.method),
          now,
        });
      }

      // Una richiesta scaduta che riceve una correzione torna esigibile: e il
      // senso stesso dell'intervento dell'amministrazione.
      const reopened = request.status === "expired";
      await tx
        .update(paymentRequestsTable)
        .set({
          ...changes,
          ...(reopened ? { status: "pending" } : {}),
          updatedAt: now,
        })
        .where(eq(paymentRequestsTable.id, request.id));

      await tx
        .update(excursionBookingsTable)
        .set({
          ...(changes.method
            ? { paymentMethod: changes.method as string }
            : {}),
          ...(changes.amountCents
            ? { amountDueCents: changes.amountCents as number }
            : {}),
          ...(changes.deadline
            ? { paymentDeadline: changes.deadline as Date }
            : {}),
          updatedAt: now,
        })
        .where(eq(excursionBookingsTable.id, booking.id));

      await recordAdminAction(tx, {
        bookingId: booking.id,
        paymentRequestId: request.id,
        action: "update_payment_request",
        reason,
        details: { before, after: changes, reopened },
        admin,
      });

      return { kind: "updated" as const, reopened };
    });

    const conflict = PAYMENT_REQUEST_CONFLICTS[outcome.kind];
    if (conflict) {
      res
        .status(conflict.status)
        .json({ error: conflict.error, code: outcome.kind.toUpperCase() });
      return;
    }
    if (outcome.kind === "invalid") {
      res.status(400).json({ error: outcome.error });
      return;
    }
    res.json({
      ok: true,
      unchanged: outcome.kind === "unchanged",
      reopened: outcome.kind === "updated" ? Boolean(outcome.reopened) : false,
    });
  } catch (error) {
    logger.error({ err: error }, "Correzione richiesta di pagamento fallita");
    res.status(500).json({ error: "Errore interno del server." });
  }
});

// ---------------------------------------------------------------------------
// Registrazione di un incasso arrivato in ufficio.
// ---------------------------------------------------------------------------
const PAYMENT_RECORD_CONFLICTS: Record<
  string,
  { status: number; error: string }
> = {
  not_found: { status: 404, error: "Prenotazione non trovata." },
  cancelled: {
    status: 409,
    error:
      "La prenotazione è annullata: l'incasso non può essere registrato qui.",
  },
  cancellation_in_progress: {
    status: 409,
    error:
      "La prenotazione ha un annullamento in corso: l'incasso resta sospeso fino alla decisione.",
  },
  excursion_closed: {
    status: 409,
    error: "La gita è annullata o archiviata: nessun incasso registrabile.",
  },
  invalid_amount: {
    status: 400,
    error: "Importo dell'incasso non valido.",
  },
  exceeds_residual: {
    status: 400,
    error:
      "L'importo supera il residuo dovuto. Correggi prima il totale della prenotazione.",
  },
  total_required: {
    status: 409,
    error:
      "Questa prenotazione non ha un totale: impostalo nel pannello economico prima di registrare un incasso.",
  },
  duplicate: {
    status: 409,
    error:
      "Un incasso con questo importo e questo riferimento è già registrato su questa prenotazione.",
  },
  seats_departed: {
    status: 409,
    error:
      "I posti erano già stati liberati e la gita è partita: l'incasso non è stato registrato.",
  },
  seats_full: {
    status: 409,
    error:
      "I posti erano stati liberati e la gita è ora al completo: l'incasso non è stato registrato.",
  },
};

/**
 * Esito che deve ANNULLARE la transazione dell'incasso.
 *
 * Dentro una transazione Drizzle un `return` fa commit: solo un'eccezione fa
 * rollback. Questi casi si scoprono dopo aver gia scritto la richiesta di
 * pagamento, quindi vanno lanciati, non ritornati, altrimenti l'incasso resta
 * salvato mentre all'operatore diciamo il contrario.
 */
class PaymentOutcome extends Error {
  constructor(readonly kind: string) {
    super(`payment outcome: ${kind}`);
    this.name = "PaymentOutcome";
  }
}

const PAYMENT_REQUEST_CONFLICTS: Record<
  string,
  { status: number; error: string }
> = {
  not_found: { status: 404, error: "Richiesta di pagamento non trovata." },
  cancelled: {
    status: 409,
    error: "La prenotazione è annullata: la richiesta non è modificabile.",
  },
  cancellation_in_progress: {
    status: 409,
    error:
      "La prenotazione ha un annullamento in corso: il pagamento resta sospeso fino alla decisione.",
  },
  excursion_closed: {
    status: 409,
    error: "La gita è conclusa o annullata: la richiesta non è modificabile.",
  },
  status_not_editable: {
    status: 409,
    error:
      "La richiesta non è più aperta: per correggere un incasso già registrato usa lo storno.",
  },
  method_not_allowed: {
    status: 400,
    error:
      "Metodo non assegnabile dall'amministrazione: la carta la può autorizzare solo il cliente dal portale.",
  },
  on_bus_requires_balance: {
    status: 400,
    error:
      "Il pagamento a bordo è ammesso soltanto per il saldo di una prenotazione già avviata.",
  },
  on_bus_not_available: {
    status: 400,
    error:
      "Il saldo a bordo non è attivo per questa gita o è disabilitato nelle impostazioni.",
  },
  exceeds_residual: {
    status: 400,
    error: "L'importo supera il residuo ancora dovuto sulla prenotazione.",
  },
  deposit_not_partial: {
    status: 400,
    error:
      "Un acconto pari all'intero residuo non è un acconto: registra il pagamento totale.",
  },
  invalid_amount: { status: 400, error: "Importo non valido." },
  missing_departure: {
    status: 409,
    error: "Imposta data e ora di partenza prima di spostare la scadenza.",
  },
  after_departure: {
    status: 400,
    error: "La scadenza deve precedere la partenza.",
  },
};

router.post("/bookings/:bookingId/payments", async (req, res) => {
  try {
    const admin = adminIdentity(req);
    const body = req.body as {
      amountCents?: unknown;
      method?: unknown;
      transactionReference?: unknown;
      paidAt?: unknown;
      reason?: unknown;
    };
    if (!isAdminAssignableMethod(body.method)) {
      res.status(400).json({
        error:
          "Indica come è stato incassato: bonifico, in ufficio o a bordo del mezzo.",
        code: "METHOD_NOT_ASSIGNABLE",
      });
      return;
    }
    const method = body.method;
    const transactionReference =
      typeof body.transactionReference === "string"
        ? body.transactionReference.trim().slice(0, 500)
        : "";
    if (!transactionReference) {
      res.status(400).json({
        error:
          "Inserisci il riferimento dell'operazione (CRO, numero ricevuta o nota di cassa).",
        code: "REFERENCE_REQUIRED",
      });
      return;
    }
    const paidAt = body.paidAt ? new Date(String(body.paidAt)) : new Date();
    if (!Number.isFinite(paidAt.getTime())) {
      res.status(400).json({ error: "Data dell'incasso non valida." });
      return;
    }

    const outcome = await db.transaction(async (tx) => {
      const booking = await loadBookingForUpdate(tx, req.params.bookingId);
      if (!booking) return { kind: "not_found" as const };
      if (booking.cancelledAt) return { kind: "cancelled" as const };
      if (isPaymentBlockedByCancellation(booking)) {
        return { kind: "cancellation_in_progress" as const };
      }

      const [excursion] = await tx
        .select()
        .from(excursionsTable)
        .where(eq(excursionsTable.id, booking.excursionId))
        .for("update")
        .limit(1);
      if (!excursion) return { kind: "not_found" as const };
      if (["cancelled", "archived"].includes(excursion.status)) {
        return { kind: "excursion_closed" as const };
      }

      const now = new Date();
      let reason: string | null;
      try {
        reason = normalizeAdminActionReason(body.reason, { required: false });
      } catch (error) {
        if (error instanceof BookingProfileValidationError) {
          return { kind: "invalid" as const, error: error.message };
        }
        throw error;
      }

      const paidRows = await tx
        .select({
          amountCents: paymentRequestsTable.amountCents,
          transactionReference: paymentRequestsTable.transactionReference,
        })
        .from(paymentRequestsTable)
        .where(
          and(
            eq(paymentRequestsTable.bookingId, booking.id),
            eq(paymentRequestsTable.status, "paid"),
          ),
        );
      if (
        isDuplicateManualPayment({
          amountCents: Number(body.amountCents),
          transactionReference,
          existing: paidRows,
        })
      ) {
        return { kind: "duplicate" as const };
      }

      const alreadyPaidCents = paidRows.reduce(
        (sum, row) => sum + row.amountCents,
        0,
      );
      const openRequests = await openRequestsFor(tx, booking.id);
      const plan = adminManualPaymentPlan({
        amountCents: Number(body.amountCents),
        totalAmountCents: booking.totalAmountCents,
        alreadyPaidCents,
        openRequests,
      });
      if (plan.kind === "invalid") return { kind: plan.reason };

      const amountCents = Number(body.amountCents);
      let requestId: string;
      if (plan.kind === "settle") {
        requestId = plan.requestId;
        // La richiesta saldata allo sportello poteva essere nata su carta:
        // il checkout eventualmente ancora aperto va spento, o il cliente
        // rischia di pagare due volte la stessa cosa.
        await cancelStaleCardAttempts(tx, {
          bookingId: booking.id,
          paymentRequestId: requestId,
          offlineMethod: method,
          now,
        });
        await tx
          .update(paymentRequestsTable)
          .set({
            status: "paid",
            method,
            paidAt,
            transactionReference,
            updatedAt: now,
          })
          .where(eq(paymentRequestsTable.id, requestId));
      } else {
        const [created] = await tx
          .insert(paymentRequestsTable)
          .values({
            bookingId: booking.id,
            type: plan.type,
            amountCents,
            status: "paid",
            method,
            deadline: null,
            paidAt,
            transactionReference,
            notes: "Incasso registrato dall'amministrazione.",
          })
          .returning({ id: paymentRequestsTable.id });
        requestId = created.id;
      }

      // Il denaro entrato conferma i posti: una prenotazione pagata non deve
      // restare esposta alla scadenza della riserva. Se la riserva era gia
      // scaduta i posti si riprendono, con la stessa regola della conferma
      // manuale: solo se la gita non e partita e c'e ancora capienza, mai
      // vendendo un posto che non esiste.
      const seatRecovery = manualPaymentSeatRecoveryDecision({
        seatStatus: booking.seatStatus,
        departureAt: excursion.departureAt,
        now,
      });
      // Da qui in poi la richiesta di pagamento e GIA stata scritta: uscire con
      // un return farebbe COMMIT, e l'incasso resterebbe salvato mentre al
      // collega diciamo che non e stato registrato — che lo porterebbe a
      // registrarlo una seconda volta. Solo un'eccezione annulla la
      // transazione: l'esito viaggia dentro l'errore e viene tradotto sotto.
      if (seatRecovery === "departed")
        throw new PaymentOutcome("seats_departed");
      if (seatRecovery === "reacquire") {
        const reacquired = await reacquireBookingSeatsInTransaction(
          tx,
          booking.id,
          null,
          now,
        );
        if (reacquired === "full") throw new PaymentOutcome("seats_full");
        if (reacquired === "closed")
          throw new PaymentOutcome("excursion_closed");
        if (reacquired === "not_found") throw new PaymentOutcome("not_found");
      }
      await confirmBookingSeatsInTransaction(tx, booking.id, now);

      const [refreshed] = await tx
        .select()
        .from(excursionBookingsTable)
        .where(eq(excursionBookingsTable.id, booking.id))
        .limit(1);
      const totals = await reconcileBookingTotals(tx, refreshed, now);
      await setBookingStatusWithCounters(
        tx,
        refreshed,
        summaryStatusFor(
          totals.amountPaidCents,
          refreshed.totalAmountCents,
          refreshed.paymentStatus,
        ),
      );

      await recordAdminAction(tx, {
        bookingId: booking.id,
        paymentRequestId: requestId,
        action: "record_payment",
        reason,
        details: {
          amountCents,
          method,
          transactionReference,
          paidAt: paidAt.toISOString(),
          plan: plan.kind,
        },
        admin,
      });

      return {
        kind: "recorded" as const,
        requestId,
        amountPaidCents: totals.amountPaidCents,
      };
    });

    const conflict = PAYMENT_RECORD_CONFLICTS[outcome.kind];
    if (conflict) {
      res
        .status(conflict.status)
        .json({ error: conflict.error, code: outcome.kind.toUpperCase() });
      return;
    }
    if (outcome.kind === "invalid") {
      res.status(400).json({ error: outcome.error });
      return;
    }
    res.status(201).json({
      ok: true,
      paymentRequestId: outcome.requestId,
      amountPaidCents: outcome.amountPaidCents,
    });
  } catch (error) {
    // Transazione annullata di proposito: l'incasso NON e stato scritto, ed e
    // proprio quello che il messaggio dice all'operatore.
    if (error instanceof PaymentOutcome) {
      const conflict = PAYMENT_RECORD_CONFLICTS[error.kind];
      if (conflict) {
        res
          .status(conflict.status)
          .json({ error: conflict.error, code: error.kind.toUpperCase() });
        return;
      }
    }
    logger.error({ err: error }, "Registrazione incasso manuale fallita");
    res.status(500).json({ error: "Errore interno del server." });
  }
});

// ---------------------------------------------------------------------------
// Storno di un incasso registrato a mano per errore.
// ---------------------------------------------------------------------------
router.post("/payment-requests/:requestId/reverse", async (req, res) => {
  try {
    const admin = adminIdentity(req);
    const outcome = await db.transaction(async (tx) => {
      const [request] = await tx
        .select()
        .from(paymentRequestsTable)
        .where(eq(paymentRequestsTable.id, req.params.requestId))
        .for("update")
        .limit(1);
      if (!request) return { kind: "not_found" as const };

      const booking = await loadBookingForUpdate(tx, request.bookingId);
      if (!booking) return { kind: "not_found" as const };

      const now = new Date();
      let reason: string;
      try {
        // Qui il motivo non e negoziabile: sta sparendo un incasso.
        reason = normalizeAdminActionReason(req.body?.reason, {
          required: true,
        }) as string;
      } catch (error) {
        if (error instanceof BookingProfileValidationError) {
          return { kind: "invalid" as const, error: error.message };
        }
        throw error;
      }

      const [succeededCardAttempt] = await tx
        .select({ id: paymentAttemptsTable.id })
        .from(paymentAttemptsTable)
        .where(
          and(
            eq(paymentAttemptsTable.paymentRequestId, request.id),
            eq(paymentAttemptsTable.status, "succeeded"),
          ),
        )
        .limit(1);

      const decision = adminPaymentReversalDecision({
        requestStatus: request.status,
        method: request.method,
        hasSucceededCardAttempt: Boolean(succeededCardAttempt),
      });
      if (decision !== "apply") return { kind: decision };

      await tx
        .update(paymentRequestsTable)
        .set({
          status: "cancelled",
          paidAt: null,
          notes: [request.notes, `Storno del ${now.toISOString()}: ${reason}`]
            .filter(Boolean)
            .join(" · ")
            .slice(0, 2000),
          updatedAt: now,
        })
        .where(eq(paymentRequestsTable.id, request.id));

      const [refreshed] = await tx
        .select()
        .from(excursionBookingsTable)
        .where(eq(excursionBookingsTable.id, booking.id))
        .limit(1);
      const totals = await reconcileBookingTotals(tx, refreshed, now);
      await setBookingStatusWithCounters(
        tx,
        refreshed,
        summaryStatusFor(
          totals.amountPaidCents,
          refreshed.totalAmountCents,
          // Senza piu incassi la prenotazione torna in attesa del pagamento
          // che era stato registrato per errore.
          request.type === "deposit" ? "deposit_requested" : "full_requested",
        ),
      );

      await recordAdminAction(tx, {
        bookingId: booking.id,
        paymentRequestId: request.id,
        action: "reverse_payment",
        reason,
        details: {
          amountCents: request.amountCents,
          method: request.method,
          transactionReference: request.transactionReference,
          previousPaidAt: request.paidAt?.toISOString() ?? null,
        },
        admin,
      });

      return {
        kind: "reversed" as const,
        amountPaidCents: totals.amountPaidCents,
      };
    });

    if (outcome.kind === "not_found") {
      res.status(404).json({ error: "Richiesta di pagamento non trovata." });
      return;
    }
    if (outcome.kind === "not_paid") {
      res.status(409).json({
        error:
          "Questa richiesta non risulta incassata: non c'è nulla da stornare.",
        code: "NOT_PAID",
      });
      return;
    }
    if (outcome.kind === "card_requires_refund") {
      res.status(409).json({
        error:
          "Un incasso su carta non si storna: il denaro è uscito davvero dal conto del cliente e va restituito dal flusso rimborsi.",
        code: "CARD_REQUIRES_REFUND",
      });
      return;
    }
    if (outcome.kind === "invalid") {
      res.status(400).json({ error: outcome.error });
      return;
    }
    res.json({ ok: true, amountPaidCents: outcome.amountPaidCents });
  } catch (error) {
    logger.error({ err: error }, "Storno incasso manuale fallito");
    res.status(500).json({ error: "Errore interno del server." });
  }
});

export default router;
