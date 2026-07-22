import { Router } from "express";
import { db } from "@workspace/db";
import {
  excursionsTable,
  excursionBookingsTable,
  bookingParticipantsTable,
  bookingConsentsTable,
  paymentRequestsTable,
  paymentAttemptsTable,
  paymentRefundsTable,
  stripeCleanupJobsTable,
  bookingCancellationCasesTable,
  excursionPickupPointsTable,
  pickupLocationsTable,
} from "@workspace/db/schema";
import {
  eq,
  and,
  asc,
  desc,
  isNull,
  ne,
  inArray,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { getPaymentSettings } from "../../services/excursion-pricing";
import {
  applyManualPayment,
  ManualPaymentSeatsUnavailableError,
} from "../../services/excursion-payments";
import { ensureBalanceRequest } from "../../services/booking-balance";
import { confirmExcursionWorkflow } from "../../services/excursion-confirmation";
import {
  reacquireBookingSeatsInTransaction,
  releaseBookingSeatsInTransaction,
} from "../../services/seat-reservations";
import {
  completeStripeCleanupManually,
  enqueueStripeCleanupJobInTransaction,
  StripeCleanupManualCompletionError,
} from "../../services/stripe-cleanup";
import { reconcileBookingCancellation } from "../../services/booking-cancellations";
import { isPaymentBlockedByCancellation } from "../../services/booking-cancellation-guard";
import {
  buildMissingParticipantDetails,
  hasCompletePickupReportParticipant,
} from "../../services/pickup-report";
import { computeGraceUntil } from "../../services/excursion-time";
import {
  canRevisitExpiredSeatHold,
  canReleaseOverdueBooking,
  chooseDeadlineExtensionTarget,
  planExpiredCardAttemptCleanup,
} from "../../services/booking-deadline";
import { dispatchPaymentDeadlineExtendedEmailV2 } from "../../services/excursion-booking-emails-v2";

// ---------------------------------------------------------------------------
// Admin Gite v2: conferma gita con richieste saldo (idempotenti), conferma
// manuale dei pagamenti bonifico/ufficio, scadenze e prenotazioni scadute.
// ---------------------------------------------------------------------------

const router = Router();

router.post(
  "/stripe-cleanup-jobs/:jobId/complete-manually",
  async (req, res) => {
    try {
      const result = await completeStripeCleanupManually({
        jobId: req.params.jobId,
        reference:
          typeof req.body?.reference === "string" ? req.body.reference : "",
      });
      const cancellation = result.bookingId
        ? await reconcileBookingCancellation(result.bookingId)
        : null;
      res.json({ ok: true, ...result, cancellation });
    } catch (error) {
      if (error instanceof StripeCleanupManualCompletionError) {
        res
          .status(error.statusCode)
          .json({ error: error.message, code: error.code });
        return;
      }
      console.error("Manual Stripe cleanup completion failed:", error);
      res.status(500).json({ error: "Errore interno del server." });
    }
  },
);

// Conferma manuale della gita (soglia raggiunta): stato → confirmed e
// richieste saldo per chi ha l'acconto pagato. Rieseguibile senza doppioni.
router.post("/excursions/:id/confirm-trip", async (req, res) => {
  try {
    const { id } = req.params;
    const outcome = await confirmExcursionWorkflow(id);
    res.json({ ok: true, ...outcome });
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_FOUND") {
      res.status(404).json({ error: "Gita non trovata." });
      return;
    }
    if (err instanceof Error && err.message === "INVALID_STATUS") {
      res
        .status(400)
        .json({ error: "La gita non è confermabile in questo stato." });
      return;
    }
    if (err instanceof Error && err.message === "MISSING_DEPARTURE") {
      res.status(400).json({
        error: "Imposta data e ora di partenza prima di confermare la gita.",
      });
      return;
    }
    if (err instanceof Error && err.message === "EXCURSION_DEPARTED") {
      res.status(409).json({
        error: "La gita non può essere confermata dopo la partenza.",
        code: "EXCURSION_ALREADY_DEPARTED",
      });
      return;
    }
    if (err instanceof Error && err.message === "CONFIRMATION_SUPERSEDED") {
      res.status(409).json({
        error:
          "Lo stato della gita è cambiato durante la conferma. Ricarica i dati prima di continuare.",
        code: "EXCURSION_CONFIRMATION_SUPERSEDED",
      });
      return;
    }
    console.error("Confirm trip failed:", err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

// Richiesta saldo manuale per singola prenotazione (idempotente).
router.post("/bookings/:bookingId/request-balance", async (req, res) => {
  try {
    const { bookingId } = req.params;
    const [booking] = await db
      .select()
      .from(excursionBookingsTable)
      .where(eq(excursionBookingsTable.id, bookingId))
      .limit(1);
    if (!booking || booking.cancelledAt) {
      res.status(404).json({ error: "Prenotazione non trovata o annullata." });
      return;
    }
    const [excursion] = await db
      .select()
      .from(excursionsTable)
      .where(eq(excursionsTable.id, booking.excursionId))
      .limit(1);
    if (!excursion) {
      res.status(404).json({ error: "Gita non trovata." });
      return;
    }
    if (!excursion.departureAt) {
      res.status(400).json({
        error: "Imposta data e ora di partenza prima di richiedere il saldo.",
      });
      return;
    }
    const outcome = await ensureBalanceRequest(booking.id, { notify: true });
    if (outcome.kind === "no_residual" || outcome.kind === "deposit_not_paid") {
      res.status(400).json({
        error:
          "Nessun residuo da richiedere (acconto non pagato o già saldato).",
      });
      return;
    }
    if (outcome.kind === "cancellation_in_progress") {
      res.status(409).json({
        error:
          "La prenotazione ha un annullamento in corso: il saldo resta sospeso fino alla decisione.",
        code: "cancellation_in_progress",
      });
      return;
    }
    if (outcome.kind === "trip_not_confirmed") {
      res.status(409).json({
        error: "La gita deve essere confermata prima di richiedere il saldo.",
        code: "TRIP_NOT_CONFIRMED",
      });
      return;
    }
    if (outcome.kind === "missing_departure") {
      res.status(409).json({
        error: "Imposta data e ora di partenza prima di richiedere il saldo.",
        code: "MISSING_DEPARTURE",
      });
      return;
    }
    if (outcome.kind === "trip_departed") {
      res.status(409).json({
        error:
          "La gita è già partita: non è possibile creare o reinviare una richiesta di saldo.",
        code: "EXCURSION_ALREADY_DEPARTED",
      });
      return;
    }
    if (outcome.kind === "booking_not_found") {
      res.status(404).json({
        error: "Prenotazione non trovata o non più disponibile.",
      });
      return;
    }
    res.json({ ok: true, outcome: outcome.kind });
  } catch (err) {
    console.error("Request balance failed:", err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

// Conferma manuale di una richiesta di pagamento (bonifico/ufficio ricevuto).
router.post("/payment-requests/:requestId/mark-paid", async (req, res) => {
  try {
    const { requestId } = req.params;
    const { transactionReference } = req.body as {
      transactionReference?: string;
    };
    const applied = await applyManualPayment({
      paymentRequestId: requestId,
      transactionReference: transactionReference?.trim() || null,
    });
    if (!applied) {
      res.status(404).json({ error: "Richiesta di pagamento non trovata." });
      return;
    }
    res.json({ ok: true, alreadyApplied: applied.alreadyApplied });
  } catch (err) {
    if (err instanceof ManualPaymentSeatsUnavailableError) {
      res.status(409).json({ error: err.message, code: err.code });
      return;
    }
    console.error("Mark paid failed:", err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

// Estende/modifica la scadenza della prenotazione e delle richieste pendenti.
router.patch("/bookings/:bookingId/deadline", async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { deadline, paymentRequestId } = req.body as {
      deadline?: string;
      paymentRequestId?: string;
    };
    const parsed = deadline ? new Date(deadline) : null;
    if (!parsed || !Number.isFinite(parsed.getTime())) {
      res.status(400).json({ error: "Scadenza non valida." });
      return;
    }
    if (!paymentRequestId?.trim()) {
      res.status(400).json({
        error: "Seleziona la richiesta di pagamento da prorogare.",
        code: "PAYMENT_REQUEST_REQUIRED",
      });
      return;
    }
    const now = new Date();
    const settings = await getPaymentSettings();
    const outcome = await db.transaction(async (tx) => {
      const [booking] = await tx
        .select()
        .from(excursionBookingsTable)
        .where(eq(excursionBookingsTable.id, bookingId))
        .for("update")
        .limit(1);

      if (!booking) return { kind: "not_found" as const };
      if (booking.cancelledAt) return { kind: "cancelled" as const };
      if (isPaymentBlockedByCancellation(booking)) {
        return { kind: "cancellation_in_progress" as const };
      }
      const requestCandidates = await tx
        .select()
        .from(paymentRequestsTable)
        .where(eq(paymentRequestsTable.bookingId, booking.id))
        .orderBy(sql`${paymentRequestsTable.createdAt} DESC`)
        .for("update");
      const request = chooseDeadlineExtensionTarget(
        requestCandidates,
        paymentRequestId.trim(),
      );
      if (!request) return { kind: "request_not_extendable" as const };
      const [excursion] = await tx
        .select({ departureAt: excursionsTable.departureAt })
        .from(excursionsTable)
        .where(eq(excursionsTable.id, booking.excursionId))
        .for("update")
        .limit(1);
      if (!excursion?.departureAt) {
        return { kind: "missing_departure" as const };
      }
      if (parsed >= excursion.departureAt) {
        return { kind: "after_departure" as const };
      }
      const graceUntil = computeGraceUntil({
        deadline: parsed,
        graceMinutes: settings.paymentGraceMinutes,
        departureAt: excursion.departureAt,
      });

      if (booking.seatStatus === "released") {
        const reacquired = await reacquireBookingSeatsInTransaction(
          tx,
          bookingId,
          graceUntil,
          now,
        );
        if (reacquired === "full") return { kind: "full" as const };
        if (reacquired === "closed") return { kind: "closed" as const };
        if (reacquired === "not_found") {
          return { kind: "not_found" as const };
        }
      }

      // Se era scaduta, torna allo stato di attesa coerente col tipo richiesta.
      const revivedStatus =
        booking.paymentStatus === "expired"
          ? request.type === "balance" ||
            (booking.amountPaidCents > 0 &&
              (booking.totalAmountCents ?? 0) > booking.amountPaidCents)
            ? "balance_requested"
            : request.type === "full"
              ? "full_requested"
              : "deposit_requested"
          : booking.paymentStatus;

      await tx
        .update(excursionBookingsTable)
        .set({
          paymentDeadline: parsed,
          paymentType: request.type,
          paymentMethod: request.method,
          amountDueCents: Math.min(
            request.amountCents,
            Math.max(
              (booking.totalAmountCents ?? 0) - booking.amountPaidCents,
              0,
            ),
          ),
          paymentStatus: revivedStatus,
          // Una proroga estende anche una riserva ancora temporanea. Le riserve
          // riacquisite hanno gia ricevuto parsed dall'helper atomico.
          ...(booking.seatStatus === "held"
            ? { seatHoldExpiresAt: graceUntil }
            : {}),
          updatedAt: now,
        })
        .where(eq(excursionBookingsTable.id, bookingId));

      await tx
        .update(paymentRequestsTable)
        .set({
          deadline: parsed,
          graceUntil,
          status: "pending",
          updatedAt: now,
        })
        .where(
          and(
            eq(paymentRequestsTable.bookingId, bookingId),
            eq(paymentRequestsTable.id, request.id),
            inArray(paymentRequestsTable.status, [
              "pending",
              "action_required",
              "expired",
            ]),
          ),
        );

      return {
        kind: "ok" as const,
        bookingId: booking.id,
        paymentRequestId: request.id,
        deadline: parsed,
        graceUntil,
      };
    });

    if (outcome.kind === "not_found") {
      res.status(404).json({ error: "Prenotazione non trovata." });
      return;
    }
    if (outcome.kind === "cancelled") {
      res
        .status(400)
        .json({ error: "Prenotazione annullata: scadenza non modificabile." });
      return;
    }
    if (outcome.kind === "cancellation_in_progress") {
      res.status(409).json({
        error:
          "La prenotazione ha un annullamento in corso: scadenza e posti restano congelati fino alla decisione.",
        code: "cancellation_in_progress",
      });
      return;
    }
    if (outcome.kind === "request_not_extendable") {
      res.status(409).json({
        error:
          "La richiesta scelta non è più prorogabile oppure non è l'obbligazione attiva più recente.",
        code: "PAYMENT_REQUEST_NOT_EXTENDABLE",
      });
      return;
    }
    if (
      outcome.kind === "missing_departure" ||
      outcome.kind === "after_departure"
    ) {
      res.status(409).json({
        error:
          "La scadenza deve essere precedente all'orario di partenza della gita.",
        code: "PAYMENT_DEADLINE_AFTER_DEPARTURE",
      });
      return;
    }
    if (outcome.kind === "full") {
      res.status(409).json({
        error: "Impossibile prorogare: i posti non sono più disponibili.",
      });
      return;
    }
    if (outcome.kind === "closed") {
      res.status(409).json({
        error: "Impossibile prorogare: la gita è chiusa.",
      });
      return;
    }
    await dispatchPaymentDeadlineExtendedEmailV2({
      bookingId: outcome.bookingId,
      paymentRequestId: outcome.paymentRequestId,
      deadline: outcome.deadline,
      graceUntil: outcome.graceUntil,
    });
    res.json({
      ok: true,
      deadline: outcome.deadline.toISOString(),
      graceUntil: outcome.graceUntil.toISOString(),
    });
  } catch (err) {
    console.error("Deadline update failed:", err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

// Marca come scadute le prenotazioni oltre scadenza di una gita; libera i
// posti solo se richiesto (impostazione o parametro esplicito).
router.post("/excursions/:id/expire-overdue", async (req, res) => {
  try {
    const { id } = req.params;
    const { releaseSeats } = req.body as { releaseSeats?: boolean };
    const settings = await getPaymentSettings();
    const shouldRelease =
      releaseSeats === true ||
      (releaseSeats === undefined && settings.autoReleaseSeats);
    const now = new Date();
    const effectiveExpiry = sql<Date>`COALESCE(
      (
        SELECT COALESCE(pr.grace_until, pr.deadline)
        FROM payment_requests pr
        WHERE pr.booking_id = ${excursionBookingsTable.id}
          AND pr.status IN ('pending', 'action_required', 'expired')
        ORDER BY pr.created_at DESC
        LIMIT 1
      ),
      ${excursionBookingsTable.seatHoldExpiresAt},
      ${excursionBookingsTable.paymentDeadline}
    )`;

    const overdue = await db
      .select()
      .from(excursionBookingsTable)
      .where(
        and(
          eq(excursionBookingsTable.excursionId, id),
          isNull(excursionBookingsTable.cancelledAt),
          ne(excursionBookingsTable.seatStatus, "released"),
          or(
            isNull(excursionBookingsTable.cancellationRequestStatus),
            notInArray(excursionBookingsTable.cancellationRequestStatus, [
              "pending",
              "approved",
            ]),
          ),
          or(
            inArray(excursionBookingsTable.paymentStatus, [
              "deposit_requested",
              "full_requested",
              "balance_requested",
              "pending_card",
            ]),
            ...(shouldRelease
              ? [
                  and(
                    eq(excursionBookingsTable.paymentStatus, "expired"),
                    eq(excursionBookingsTable.seatStatus, "held"),
                    eq(excursionBookingsTable.amountPaidCents, 0),
                  ),
                ]
              : []),
          ),
          sql`${effectiveExpiry} IS NOT NULL AND ${effectiveExpiry} < ${now}`,
        ),
      );

    let expired = 0;
    let releasedSeats = 0;
    let requiresCancellationDecision = 0;
    let stripeCancellationsScheduled = 0;
    for (const booking of overdue) {
      const outcome = await db.transaction(async (tx) => {
        const [currentBooking] = await tx
          .select()
          .from(excursionBookingsTable)
          .where(
            and(
              eq(excursionBookingsTable.id, booking.id),
              isNull(excursionBookingsTable.cancelledAt),
              ne(excursionBookingsTable.seatStatus, "released"),
              or(
                isNull(excursionBookingsTable.cancellationRequestStatus),
                notInArray(excursionBookingsTable.cancellationRequestStatus, [
                  "pending",
                  "approved",
                ]),
              ),
            ),
          )
          .for("update")
          .limit(1);

        const activeStatuses = [
          "deposit_requested",
          "full_requested",
          "balance_requested",
          "pending_card",
        ];
        const isAlreadyExpiredAndReleasable = currentBooking
          ? canRevisitExpiredSeatHold({
              releaseSeats: shouldRelease,
              paymentStatus: currentBooking.paymentStatus,
              seatStatus: currentBooking.seatStatus,
              amountPaidCents: currentBooking.amountPaidCents,
            })
          : false;
        if (
          !currentBooking ||
          (!activeStatuses.includes(currentBooking.paymentStatus) &&
            !isAlreadyExpiredAndReleasable)
        ) {
          return {
            expired: false,
            releasedSeats: 0,
            requiresCancellationDecision: false,
            stripeCancellationsScheduled: 0,
          };
        }

        // La richiesta più recente è l'obbligazione operativa corrente. La
        // tolleranza viene riletta sotto lo stesso lock della booking, così una
        // proroga concorrente vince sempre sulla scadenza.
        const [currentRequest] = await tx
          .select()
          .from(paymentRequestsTable)
          .where(
            and(
              eq(paymentRequestsTable.bookingId, currentBooking.id),
              inArray(paymentRequestsTable.status, [
                "pending",
                "action_required",
                "expired",
              ]),
            ),
          )
          .orderBy(desc(paymentRequestsTable.createdAt))
          .for("update")
          .limit(1);
        const expiryAt =
          currentRequest?.graceUntil ??
          currentRequest?.deadline ??
          currentBooking.seatHoldExpiresAt ??
          currentBooking.paymentDeadline;
        if (!expiryAt || expiryAt >= now) {
          return {
            expired: false,
            releasedSeats: 0,
            requiresCancellationDecision: false,
            stripeCancellationsScheduled: 0,
          };
        }

        const newlyExpired = currentBooking.paymentStatus !== "expired";
        if (newlyExpired) {
          await tx
            .update(excursionBookingsTable)
            .set({ paymentStatus: "expired", updatedAt: now })
            .where(eq(excursionBookingsTable.id, currentBooking.id));
        }

        // Un altro processo puo aver pagato o scaduto la prenotazione dopo la
        // SELECT iniziale: in quel caso non tocchiamo richieste o posti.
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
              eq(paymentRequestsTable.bookingId, currentBooking.id),
              inArray(paymentAttemptsTable.status, [
                "pending",
                "processing",
                "action_required",
                "failed",
                "cancellation_pending",
              ]),
            ),
          );
        const localAttemptIds = activeAttempts
          .filter((attempt) => !attempt.stripePaymentIntentId)
          .map((attempt) => attempt.id);
        if (localAttemptIds.length > 0) {
          await tx
            .update(paymentAttemptsTable)
            .set({
              status: "cancelled",
              lastErrorCode: "payment_request_expired",
              lastErrorMessage:
                "Tentativo chiuso perché la richiesta di pagamento è scaduta.",
              completedAt: now,
              updatedAt: now,
            })
            .where(inArray(paymentAttemptsTable.id, localAttemptIds));
        }
        const cardCleanupPlan = planExpiredCardAttemptCleanup(activeAttempts);
        for (const item of cardCleanupPlan) {
          await enqueueStripeCleanupJobInTransaction(tx, {
            bookingId: currentBooking.id,
            operation: "cancel_payment_intent",
            stripeResourceId: item.paymentIntentId,
          });
        }
        if (cardCleanupPlan.length > 0) {
          await tx
            .update(paymentAttemptsTable)
            .set({ status: "cancellation_pending", updatedAt: now })
            .where(
              and(
                inArray(
                  paymentAttemptsTable.id,
                  cardCleanupPlan.map((item) => item.attemptId),
                ),
                notInArray(paymentAttemptsTable.status, [
                  "succeeded",
                  "cancelled",
                ]),
              ),
            );
        }
        const stripeCancellationsScheduled = cardCleanupPlan.length;

        await tx
          .update(paymentRequestsTable)
          .set({ status: "expired", updatedAt: now })
          .where(
            and(
              eq(paymentRequestsTable.bookingId, currentBooking.id),
              inArray(paymentRequestsTable.status, [
                "pending",
                "action_required",
              ]),
            ),
          );
        if (shouldRelease) {
          if (!canReleaseOverdueBooking(currentBooking.amountPaidCents)) {
            return {
              expired: newlyExpired,
              releasedSeats: 0,
              requiresCancellationDecision: true,
              stripeCancellationsScheduled,
            };
          }
          const released = await releaseBookingSeatsInTransaction(
            tx,
            currentBooking.id,
            currentBooking.paymentStatus === "pending_card"
              ? "card_checkout_expired"
              : "payment_expired",
            now,
          );
          return {
            expired: newlyExpired,
            releasedSeats: released.released ? (released.seats ?? 0) : 0,
            requiresCancellationDecision: false,
            stripeCancellationsScheduled,
          };
        }
        return {
          expired: newlyExpired,
          releasedSeats: 0,
          requiresCancellationDecision: false,
          stripeCancellationsScheduled,
        };
      });
      if (outcome.expired) expired += 1;
      releasedSeats += outcome.releasedSeats;
      if (outcome.requiresCancellationDecision) {
        requiresCancellationDecision += 1;
      }
      stripeCancellationsScheduled += outcome.stripeCancellationsScheduled;
    }
    res.json({
      ok: true,
      expired,
      releasedSeats,
      requiresCancellationDecision,
      stripeCancellationsScheduled,
    });
  } catch (err) {
    console.error("Expire overdue failed:", err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

// Dettaglio completo prenotazione per l'admin: partecipanti, consensi,
// pagamenti e ledger di cancellazione/rimborso. Prenotazioni pre-v2 →
// participantsDetailed false.
router.get("/bookings/:bookingId/details", async (req, res) => {
  try {
    const { bookingId } = req.params;
    const [booking] = await db
      .select()
      .from(excursionBookingsTable)
      .where(eq(excursionBookingsTable.id, bookingId))
      .limit(1);
    if (!booking) {
      res.status(404).json({ error: "Prenotazione non trovata." });
      return;
    }
    const [
      participants,
      consents,
      paymentRequests,
      paymentAttempts,
      cancellationCases,
      refunds,
      cleanupJobs,
    ] = await Promise.all([
      db
        .select()
        .from(bookingParticipantsTable)
        .where(eq(bookingParticipantsTable.bookingId, bookingId))
        .orderBy(asc(bookingParticipantsTable.sortOrder)),
      db
        .select()
        .from(bookingConsentsTable)
        .where(eq(bookingConsentsTable.bookingId, bookingId))
        .orderBy(asc(bookingConsentsTable.consentType)),
      db
        .select()
        .from(paymentRequestsTable)
        .where(eq(paymentRequestsTable.bookingId, bookingId))
        .orderBy(asc(paymentRequestsTable.createdAt)),
      db
        .select({
          id: paymentAttemptsTable.id,
          paymentRequestId: paymentAttemptsTable.paymentRequestId,
          provider: paymentAttemptsTable.provider,
          status: paymentAttemptsTable.status,
          amountCents: paymentAttemptsTable.amountCents,
          stripePaymentIntentId: paymentAttemptsTable.stripePaymentIntentId,
          lastErrorCode: paymentAttemptsTable.lastErrorCode,
          lastErrorMessage: paymentAttemptsTable.lastErrorMessage,
          completedAt: paymentAttemptsTable.completedAt,
          createdAt: paymentAttemptsTable.createdAt,
          updatedAt: paymentAttemptsTable.updatedAt,
        })
        .from(paymentAttemptsTable)
        .innerJoin(
          paymentRequestsTable,
          eq(paymentAttemptsTable.paymentRequestId, paymentRequestsTable.id),
        )
        .where(eq(paymentRequestsTable.bookingId, bookingId))
        .orderBy(asc(paymentAttemptsTable.createdAt)),
      db
        .select({
          id: bookingCancellationCasesTable.id,
          bookingId: bookingCancellationCasesTable.bookingId,
          excursionId: bookingCancellationCasesTable.excursionId,
          source: bookingCancellationCasesTable.source,
          status: bookingCancellationCasesTable.status,
          requestReason: bookingCancellationCasesTable.requestReason,
          decisionReason: bookingCancellationCasesTable.decisionReason,
          openedByAdminUserId:
            bookingCancellationCasesTable.openedByAdminUserId,
          openedByAdminName: bookingCancellationCasesTable.openedByAdminName,
          decidedByAdminUserId:
            bookingCancellationCasesTable.decidedByAdminUserId,
          decidedByAdminName: bookingCancellationCasesTable.decidedByAdminName,
          refundableAtDecisionCents:
            bookingCancellationCasesTable.refundableAtDecisionCents,
          approvedRefundCents:
            bookingCancellationCasesTable.approvedRefundCents,
          requestedAt: bookingCancellationCasesTable.requestedAt,
          decidedAt: bookingCancellationCasesTable.decidedAt,
          completedAt: bookingCancellationCasesTable.completedAt,
          createdAt: bookingCancellationCasesTable.createdAt,
          updatedAt: bookingCancellationCasesTable.updatedAt,
        })
        .from(bookingCancellationCasesTable)
        .where(eq(bookingCancellationCasesTable.bookingId, bookingId))
        .orderBy(asc(bookingCancellationCasesTable.createdAt)),
      db
        .select({
          id: paymentRefundsTable.id,
          bookingId: paymentRefundsTable.bookingId,
          paymentRequestId: paymentRefundsTable.paymentRequestId,
          paymentAttemptId: paymentRefundsTable.paymentAttemptId,
          cancellationCaseId: paymentRefundsTable.cancellationCaseId,
          amountCents: paymentRefundsTable.amountCents,
          reason: paymentRefundsTable.reason,
          status: paymentRefundsTable.status,
          provider: paymentRefundsTable.provider,
          providerReference: paymentRefundsTable.providerReference,
          stripePaymentIntentId: paymentRefundsTable.stripePaymentIntentId,
          stripeRefundId: paymentRefundsTable.stripeRefundId,
          lastErrorCode: paymentRefundsTable.lastErrorCode,
          lastErrorMessage: paymentRefundsTable.lastErrorMessage,
          attemptCount: paymentRefundsTable.attemptCount,
          maxAttempts: paymentRefundsTable.maxAttempts,
          nextAttemptAt: paymentRefundsTable.nextAttemptAt,
          lastAttemptAt: paymentRefundsTable.lastAttemptAt,
          completedAt: paymentRefundsTable.completedAt,
          createdAt: paymentRefundsTable.createdAt,
          updatedAt: paymentRefundsTable.updatedAt,
        })
        .from(paymentRefundsTable)
        .where(eq(paymentRefundsTable.bookingId, bookingId))
        .orderBy(asc(paymentRefundsTable.createdAt)),
      db
        .select({
          id: stripeCleanupJobsTable.id,
          bookingId: stripeCleanupJobsTable.bookingId,
          operation: stripeCleanupJobsTable.operation,
          stripeResourceId: stripeCleanupJobsTable.stripeResourceId,
          status: stripeCleanupJobsTable.status,
          attemptCount: stripeCleanupJobsTable.attemptCount,
          maxAttempts: stripeCleanupJobsTable.maxAttempts,
          nextAttemptAt: stripeCleanupJobsTable.nextAttemptAt,
          lastAttemptAt: stripeCleanupJobsTable.lastAttemptAt,
          lastErrorCode: stripeCleanupJobsTable.lastErrorCode,
          lastErrorMessage: stripeCleanupJobsTable.lastErrorMessage,
          manualCompletionReference:
            stripeCleanupJobsTable.manualCompletionReference,
          completedAt: stripeCleanupJobsTable.completedAt,
          createdAt: stripeCleanupJobsTable.createdAt,
          updatedAt: stripeCleanupJobsTable.updatedAt,
        })
        .from(stripeCleanupJobsTable)
        .where(eq(stripeCleanupJobsTable.bookingId, bookingId))
        .orderBy(asc(stripeCleanupJobsTable.createdAt)),
    ]);

    const sumRefunds = (statuses?: string[]) =>
      refunds.reduce(
        (sum, refund) =>
          !statuses || statuses.includes(refund.status)
            ? sum + Math.max(refund.amountCents, 0)
            : sum,
        0,
      );
    const totalAmountCents = booking.totalAmountCents ?? null;
    const paidAmountCents = Math.max(booking.amountPaidCents ?? 0, 0);
    const approvedRefundAmountCents = Math.max(
      booking.cancellationRefundAmountCents ?? 0,
      0,
    );
    const refundedAmountCents = sumRefunds(["succeeded"]);
    const economicSummary = {
      totalAmountCents,
      paidAmountCents,
      balanceAmountCents:
        totalAmountCents === null
          ? null
          : Math.max(totalAmountCents - paidAmountCents, 0),
      approvedRefundAmountCents,
      registeredRefundAmountCents: sumRefunds(),
      refundedAmountCents,
      pendingRefundAmountCents: sumRefunds(["pending", "processing"]),
      failedRefundAmountCents: sumRefunds(["failed"]),
      manualRefundRequiredAmountCents: sumRefunds(["manual_required"]),
      remainingApprovedRefundAmountCents: Math.max(
        approvedRefundAmountCents - refundedAmountCents,
        0,
      ),
      penaltyAmountCents: Math.max(
        booking.cancellationPenaltyAmountCents ?? 0,
        0,
      ),
      netCollectedAmountCents: Math.max(
        paidAmountCents - refundedAmountCents,
        0,
      ),
    };
    const participantsDetailed =
      participants.length === booking.seats &&
      participants.every(
        (participant) =>
          participant.dataCompleted === true &&
          Boolean(participant.firstName?.trim()) &&
          Boolean(participant.lastName?.trim()),
      );

    res.json({
      booking,
      participants,
      consents,
      paymentRequests,
      paymentAttempts,
      cancellationCases,
      refunds,
      cleanupJobs,
      economicSummary,
      participantsDetailed,
    });
  } catch (err) {
    console.error("Booking details fetch failed:", err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

// Report raccolta bus: persone raggruppate per punto di raccolta, con tipo
// partecipante e riferimento della prenotazione. Pensato per le gite RIDENT
// (punto per persona) ma funziona anche per le gite normali.
router.get("/excursions/:id/pickup-report", async (req, res) => {
  try {
    const { id } = req.params;
    const [excursion] = await db
      .select({
        id: excursionsTable.id,
        name: excursionsTable.name,
        date: excursionsTable.date,
      })
      .from(excursionsTable)
      .where(eq(excursionsTable.id, id))
      .limit(1);
    if (!excursion) {
      res.status(404).json({ error: "Gita non trovata." });
      return;
    }

    const rows = await db
      .select({
        bookingId: excursionBookingsTable.id,
        participantType: bookingParticipantsTable.participantType,
        ageRangeLabel: bookingParticipantsTable.ageRangeLabel,
        firstName: bookingParticipantsTable.firstName,
        lastName: bookingParticipantsTable.lastName,
        dataCompleted: bookingParticipantsTable.dataCompleted,
        pickupPointId: bookingParticipantsTable.pickupPointId,
        pickupPointName: bookingParticipantsTable.pickupPointName,
        bookingCode: excursionBookingsTable.bookingCode,
        customerName: excursionBookingsTable.customerName,
        customerPhone: excursionBookingsTable.phone,
        paymentStatus: excursionBookingsTable.paymentStatus,
        servizioCasa: excursionBookingsTable.servizioCasa,
        homePickupAddress: excursionBookingsTable.homePickupAddress,
      })
      .from(bookingParticipantsTable)
      .innerJoin(
        excursionBookingsTable,
        eq(bookingParticipantsTable.bookingId, excursionBookingsTable.id),
      )
      .where(
        and(
          eq(excursionBookingsTable.excursionId, id),
          isNull(excursionBookingsTable.cancelledAt),
          ne(excursionBookingsTable.seatStatus, "released"),
        ),
      )
      .orderBy(
        asc(excursionBookingsTable.customerName),
        asc(bookingParticipantsTable.sortOrder),
      );

    // La query dei gruppi parte intenzionalmente dai partecipanti completi e
    // quindi non puo rappresentare integralmente le prenotazioni legacy o con
    // cardinalita/anagrafiche incoerenti. Le carichiamo separatamente per
    // renderle esplicite nel report, senza creare persone o punti fittizi.
    const activeBookings = await db
      .select({
        bookingId: excursionBookingsTable.id,
        bookingCode: excursionBookingsTable.bookingCode,
        customerName: excursionBookingsTable.customerName,
        phone: excursionBookingsTable.phone,
        seats: excursionBookingsTable.seats,
        servizioCasa: excursionBookingsTable.servizioCasa,
        homePickupAddress: excursionBookingsTable.homePickupAddress,
      })
      .from(excursionBookingsTable)
      .where(
        and(
          eq(excursionBookingsTable.excursionId, id),
          isNull(excursionBookingsTable.cancelledAt),
          ne(excursionBookingsTable.seatStatus, "released"),
        ),
      )
      .orderBy(asc(excursionBookingsTable.customerName));

    const points = await db
      .select({
        id: excursionPickupPointsTable.id,
        pickupTime: excursionPickupPointsTable.pickupTime,
        sortOrder: excursionPickupPointsTable.sortOrder,
        name: pickupLocationsTable.name,
        province: pickupLocationsTable.province,
      })
      .from(excursionPickupPointsTable)
      .innerJoin(
        pickupLocationsTable,
        eq(
          excursionPickupPointsTable.pickupLocationId,
          pickupLocationsTable.id,
        ),
      )
      .where(eq(excursionPickupPointsTable.excursionId, id))
      .orderBy(asc(excursionPickupPointsTable.sortOrder));
    const pointById = new Map(points.map((p) => [p.id, p]));
    const operationalRows = rows.filter(hasCompletePickupReportParticipant);

    type Group = {
      pickupPointId: string | null;
      pickupPointName: string;
      province: string | null;
      pickupTime: string | null;
      configuredSortOrder: number;
      people: {
        name: string;
        participantType: string;
        ageRangeLabel: string | null;
        bookingCode: string | null;
        referente: string;
        phone: string | null;
        paymentStatus: string;
        servizioCasa: boolean;
        homePickupAddress: string | null;
      }[];
      patients: number;
      companions: number;
      adults: number;
      children: number;
    };
    const groups = new Map<string, Group>();
    for (const r of operationalRows) {
      const point = r.pickupPointId ? pointById.get(r.pickupPointId) : null;
      const key = r.pickupPointId ?? "none";
      let g = groups.get(key);
      if (!g) {
        g = {
          pickupPointId: r.pickupPointId,
          pickupPointName:
            point?.name ?? r.pickupPointName ?? "Senza punto di raccolta",
          province: point?.province ?? null,
          pickupTime: point?.pickupTime ?? null,
          configuredSortOrder: point?.sortOrder ?? Number.MAX_SAFE_INTEGER,
          people: [],
          patients: 0,
          companions: 0,
          adults: 0,
          children: 0,
        };
        groups.set(key, g);
      }
      const personName = `${r.firstName.trim()} ${r.lastName.trim()}`;
      g.people.push({
        name: personName,
        participantType: r.participantType,
        ageRangeLabel: r.ageRangeLabel,
        bookingCode: r.bookingCode,
        referente: r.customerName,
        phone: r.customerPhone,
        paymentStatus: r.paymentStatus,
        servizioCasa: r.servizioCasa,
        homePickupAddress: r.homePickupAddress,
      });
      if (r.participantType === "patient") g.patients += 1;
      else if (r.participantType === "companion") g.companions += 1;
      else if (r.participantType === "child") g.children += 1;
      else g.adults += 1;
    }

    const sorted = Array.from(groups.values()).sort(
      (a, b) =>
        a.configuredSortOrder - b.configuredSortOrder ||
        a.pickupPointName.localeCompare(b.pickupPointName, "it"),
    );
    const missingParticipantDetails = buildMissingParticipantDetails(
      activeBookings,
      rows,
    );
    res.json({
      excursion,
      groups: sorted.map(({ configuredSortOrder: _sortOrder, ...g }) => ({
        ...g,
        totalPeople: g.people.length,
      })),
      totalPeople: operationalRows.length,
      missingParticipantDetails,
    });
  } catch (err) {
    console.error("Pickup report failed:", err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

export default router;
