import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import { db } from "@workspace/db";
import {
  bookingCancellationCasesTable,
  bookingParticipantsTable,
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
  isNull,
  ne,
  notInArray,
} from "drizzle-orm";
import { publicFormsLimiter } from "../middlewares/rateLimiter";
import { logger } from "../lib/logger";
import { verifyBookingAccessToken } from "../services/booking-access-token";
import {
  availablePaymentMethods,
  getPaymentSettings,
  isStripeChargeAmountSupported,
} from "../services/excursion-pricing";
import {
  applySuccessfulCardPayment,
  cardPaymentApplicationDisposition,
  markCancelledCardPaymentAttempt,
} from "../services/excursion-payments";
import { stripe } from "../services/stripe";
import {
  enqueueStripeCleanupJobInTransaction,
  recoverOrCleanupUnlinkedPaymentIntent,
  scheduleStripeCleanupWithFallback,
} from "../services/stripe-cleanup";
import {
  BookingCancellationError,
  requestBookingCancellation,
} from "../services/booking-cancellations";
import { isPaymentBlockedByCancellation } from "../services/booking-cancellation-guard";
import { minimizeSavedCardDataForBooking } from "../services/excursion-confirmation";
import { planOfflineMethodCardCleanup } from "../services/stripe-cleanup-policy";

const router = Router();
const ATTEMPT_ID_PATTERN = /^[a-zA-Z0-9_-]{8,100}$/;

function bookingToken(req: Request): string {
  const value = req.header("x-booking-token") ?? "";
  return value.trim().slice(0, 512);
}

async function authorizedBooking(req: Request) {
  const verified = await verifyBookingAccessToken(bookingToken(req));
  if (!verified) return null;
  const [row] = await db
    .select({ booking: excursionBookingsTable, excursion: excursionsTable })
    .from(excursionBookingsTable)
    .innerJoin(
      excursionsTable,
      eq(excursionBookingsTable.excursionId, excursionsTable.id),
    )
    .where(eq(excursionBookingsTable.id, verified.bookingId))
    .limit(1);
  return row ?? null;
}

function effectiveDeadline(
  request: typeof paymentRequestsTable.$inferSelect,
): Date | null {
  return request.graceUntil ?? request.deadline;
}

function portalPaymentBlocked(
  booking: typeof excursionBookingsTable.$inferSelect,
): boolean {
  return (
    isPaymentBlockedByCancellation(booking) || booking.seatStatus === "released"
  );
}

async function portalPaymentStillAllowed(input: {
  bookingId: string;
  paymentRequestId: string;
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [booking] = await tx
      .select()
      .from(excursionBookingsTable)
      .where(eq(excursionBookingsTable.id, input.bookingId))
      .for("update")
      .limit(1);
    if (!booking || portalPaymentBlocked(booking)) return false;
    const [request] = await tx
      .select()
      .from(paymentRequestsTable)
      .where(
        and(
          eq(paymentRequestsTable.id, input.paymentRequestId),
          eq(paymentRequestsTable.bookingId, booking.id),
          inArray(paymentRequestsTable.status, ["pending", "action_required"]),
        ),
      )
      .for("update")
      .limit(1);
    if (!request) return false;
    const deadline = effectiveDeadline(request);
    return !deadline || deadline >= new Date();
  });
}

router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

router.get("/booking-portal", async (req, res) => {
  try {
    const ctx = await authorizedBooking(req);
    if (!ctx) {
      res
        .status(404)
        .json({ error: "Link prenotazione non valido o scaduto." });
      return;
    }

    const [participants, requests, settings, cancellationCases] =
      await Promise.all([
        db
          .select({
            id: bookingParticipantsTable.id,
            participantType: bookingParticipantsTable.participantType,
            ageRangeLabel: bookingParticipantsTable.ageRangeLabel,
            firstName: bookingParticipantsTable.firstName,
            lastName: bookingParticipantsTable.lastName,
            pickupPointName: bookingParticipantsTable.pickupPointName,
            finalPriceCents: bookingParticipantsTable.finalPriceCents,
            sortOrder: bookingParticipantsTable.sortOrder,
          })
          .from(bookingParticipantsTable)
          .where(eq(bookingParticipantsTable.bookingId, ctx.booking.id))
          .orderBy(asc(bookingParticipantsTable.sortOrder)),
        db
          .select()
          .from(paymentRequestsTable)
          .where(eq(paymentRequestsTable.bookingId, ctx.booking.id))
          .orderBy(desc(paymentRequestsTable.createdAt)),
        getPaymentSettings(),
        db
          .select()
          .from(bookingCancellationCasesTable)
          .where(eq(bookingCancellationCasesTable.bookingId, ctx.booking.id))
          .orderBy(desc(bookingCancellationCasesTable.createdAt))
          .limit(1),
      ]);

    const activeRequest =
      requests.find((item) =>
        ["pending", "action_required"].includes(item.status),
      ) ?? null;
    const deadline = activeRequest ? effectiveDeadline(activeRequest) : null;
    const now = new Date();
    const residualCents = Math.max(
      (ctx.booking.totalAmountCents ?? 0) - ctx.booking.amountPaidCents,
      0,
    );
    const methods = availablePaymentMethods(
      ctx.excursion,
      settings,
      Boolean(stripe),
    );

    const latestCancellationCase = cancellationCases[0] ?? null;
    const cancellationStatus =
      latestCancellationCase?.status ?? ctx.booking.cancellationRequestStatus;
    res.json({
      booking: {
        bookingCode: ctx.booking.bookingCode ?? ctx.booking.id,
        customerName: ctx.booking.customerName,
        seats: ctx.booking.seats,
        paymentStatus: ctx.booking.paymentStatus,
        seatStatus: ctx.booking.seatStatus,
        totalAmountCents: ctx.booking.totalAmountCents ?? 0,
        amountPaidCents: ctx.booking.amountPaidCents,
        residualCents,
      },
      excursion: {
        name: ctx.excursion.name,
        location: ctx.excursion.location,
        date: ctx.excursion.date,
        departureAt: ctx.excursion.departureAt?.toISOString() ?? null,
        status: ctx.excursion.status,
      },
      participants,
      paymentRequest: activeRequest
        ? {
            id: activeRequest.id,
            type: activeRequest.type,
            amountCents: Math.min(activeRequest.amountCents, residualCents),
            status: activeRequest.status,
            method: activeRequest.method,
            deadline: activeRequest.deadline?.toISOString() ?? null,
            graceUntil: activeRequest.graceUntil?.toISOString() ?? null,
            canPay:
              residualCents > 0 &&
              ctx.booking.seatStatus !== "released" &&
              !portalPaymentBlocked(ctx.booking) &&
              (!deadline || deadline >= now),
          }
        : null,
      paymentMethods: methods,
      bank: {
        iban: settings.iban,
        beneficiary: settings.beneficiary,
        bank: settings.bank,
      },
      office: {
        address: settings.officeAddress,
        openingHours: settings.officeOpeningHours,
      },
      cancellation: {
        caseId: latestCancellationCase?.id ?? null,
        status: cancellationStatus ?? null,
        requestedAt:
          latestCancellationCase?.requestedAt.toISOString() ??
          ctx.booking.cancellationRequestedAt?.toISOString() ??
          null,
        refundAmountCents:
          latestCancellationCase?.approvedRefundCents ??
          ctx.booking.cancellationRefundAmountCents ??
          null,
        penaltyAmountCents: ctx.booking.cancellationPenaltyAmountCents ?? null,
        cancelledAt: ctx.booking.cancelledAt?.toISOString() ?? null,
        canRequest:
          !ctx.booking.cancelledAt &&
          !["pending", "approved", "refunding", "manual_required"].includes(
            cancellationStatus ?? "",
          ) &&
          !["completed", "cancelled", "archived"].includes(
            ctx.excursion.status,
          ),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Lettura portale prenotazione fallita");
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.post(
  "/booking-portal/cancellation",
  publicFormsLimiter,
  async (req, res) => {
    try {
      const ctx = await authorizedBooking(req);
      if (!ctx) {
        res
          .status(404)
          .json({ error: "Link prenotazione non valido o scaduto." });
        return;
      }
      const reason =
        typeof req.body?.reason === "string" ? req.body.reason : null;
      const result = await requestBookingCancellation(ctx.booking.id, reason);
      res.status(result.kind === "requested" ? 202 : 200).json({
        ok: true,
        ...result,
      });
    } catch (error) {
      if (error instanceof BookingCancellationError) {
        res
          .status(error.statusCode)
          .json({ error: error.message, code: error.code });
        return;
      }
      logger.error({ err: error }, "Richiesta annullamento portale fallita");
      res.status(500).json({ error: "Errore interno del server." });
    }
  },
);

router.post(
  "/booking-portal/payment-method",
  publicFormsLimiter,
  async (req, res) => {
    try {
      const ctx = await authorizedBooking(req);
      if (!ctx) {
        res
          .status(404)
          .json({ error: "Link prenotazione non valido o scaduto." });
        return;
      }
      if (portalPaymentBlocked(ctx.booking)) {
        res.status(409).json({
          error:
            "Il pagamento è sospeso perché la prenotazione ha un annullamento in corso.",
          code: "booking_cancellation_in_progress",
        });
        return;
      }
      const { paymentRequestId, method } = req.body as {
        paymentRequestId?: string;
        method?: string;
      };
      if (
        !paymentRequestId ||
        !["card", "bank_transfer", "office"].includes(method ?? "")
      ) {
        res.status(400).json({ error: "Metodo di pagamento non valido." });
        return;
      }
      const settings = await getPaymentSettings();
      const methods = availablePaymentMethods(
        ctx.excursion,
        settings,
        Boolean(stripe),
      );
      const allowed =
        method === "card"
          ? methods.card
          : method === "bank_transfer"
            ? methods.bankTransfer
            : methods.office;
      if (!allowed) {
        res
          .status(400)
          .json({ error: "Metodo non disponibile per questa gita." });
        return;
      }

      const methodUpdate = await db.transaction(async (tx) => {
        const [booking] = await tx
          .select()
          .from(excursionBookingsTable)
          .where(eq(excursionBookingsTable.id, ctx.booking.id))
          .for("update")
          .limit(1);
        if (!booking) return { kind: "not_found" as const };
        if (portalPaymentBlocked(booking)) {
          return { kind: "blocked" as const };
        }
        const [request] = await tx
          .select()
          .from(paymentRequestsTable)
          .where(
            and(
              eq(paymentRequestsTable.id, paymentRequestId),
              eq(paymentRequestsTable.bookingId, ctx.booking.id),
              inArray(paymentRequestsTable.status, [
                "pending",
                "action_required",
              ]),
            ),
          )
          .for("update")
          .limit(1);
        if (!request) return { kind: "not_found" as const };
        const now = new Date();
        const deadline = effectiveDeadline(request);
        if (deadline && deadline < now) return { kind: "expired" as const };
        const staleCardAttempts =
          method !== "card"
            ? await tx
                .select({
                  id: paymentAttemptsTable.id,
                  stripePaymentIntentId:
                    paymentAttemptsTable.stripePaymentIntentId,
                })
                .from(paymentAttemptsTable)
                .where(
                  and(
                    eq(paymentAttemptsTable.paymentRequestId, request.id),
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
                .for("update")
            : [];
        const cardCleanupPlan = planOfflineMethodCardCleanup(
          method!,
          staleCardAttempts,
        );
        for (const item of cardCleanupPlan) {
          await enqueueStripeCleanupJobInTransaction(tx, {
            bookingId: booking.id,
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
        await tx
          .update(paymentRequestsTable)
          .set({ method, updatedAt: now })
          .where(eq(paymentRequestsTable.id, request.id));
        if (method !== "card" && booking.stripeSetupIntentId) {
          await enqueueStripeCleanupJobInTransaction(tx, {
            bookingId: booking.id,
            operation: "cancel_setup_intent",
            stripeResourceId: booking.stripeSetupIntentId,
          });
        }
        if (method !== "card" && booking.stripeCustomerId) {
          await enqueueStripeCleanupJobInTransaction(tx, {
            bookingId: booking.id,
            operation: "delete_customer",
            stripeResourceId: booking.stripeCustomerId,
          });
        }
        await tx
          .update(excursionBookingsTable)
          .set({
            paymentMethod: method,
            // Il cambio esplicito a un metodo offline revoca l'uso operativo
            // della carta salvata. Gli ID restano nel job di cleanup durevole,
            // mentre la booking non puo piu essere addebitata off-session.
            ...(method !== "card"
              ? {
                  stripeCustomerId: null,
                  stripePaymentMethodId: null,
                  stripeSetupIntentId: null,
                }
              : {}),
            updatedAt: now,
          })
          .where(eq(excursionBookingsTable.id, ctx.booking.id));
        return {
          kind: "updated" as const,
        };
      });
      if (methodUpdate.kind === "not_found") {
        res
          .status(404)
          .json({ error: "Richiesta di pagamento non disponibile." });
        return;
      }
      if (methodUpdate.kind === "expired") {
        res.status(410).json({
          error: "La richiesta di pagamento è scaduta. Contatta l'agenzia.",
        });
        return;
      }
      if (methodUpdate.kind === "blocked") {
        res.status(409).json({
          error:
            "Il pagamento è sospeso perché la prenotazione ha un annullamento in corso o non riserva più i posti.",
          code: "booking_cancellation_in_progress",
        });
        return;
      }
      res.json({ ok: true, method });
    } catch (error) {
      logger.error({ err: error }, "Cambio metodo portale fallito");
      res.status(500).json({ error: "Errore interno del server." });
    }
  },
);

router.post(
  "/booking-portal/payment-intent",
  publicFormsLimiter,
  async (req, res) => {
    try {
      const ctx = await authorizedBooking(req);
      if (!ctx) {
        res
          .status(404)
          .json({ error: "Link prenotazione non valido o scaduto." });
        return;
      }
      if (!stripe) {
        res.status(503).json({ error: "Pagamenti con carta non configurati." });
        return;
      }
      const liveSettings = await getPaymentSettings();
      if (!availablePaymentMethods(ctx.excursion, liveSettings, true).card) {
        res.status(409).json({
          error:
            "I pagamenti con carta sono temporaneamente sospesi. Scegli bonifico o pagamento in ufficio.",
          code: "card_payments_disabled",
        });
        return;
      }
      if (portalPaymentBlocked(ctx.booking)) {
        res.status(409).json({
          error:
            "Non è possibile avviare un pagamento durante l'annullamento della prenotazione.",
          code: "booking_cancellation_in_progress",
        });
        return;
      }
      const stripeClient = stripe;
      const { paymentRequestId } = req.body as {
        paymentRequestId?: string;
        attemptId?: string;
      };
      const suppliedAttemptId = (
        req.body as { attemptId?: string }
      ).attemptId?.trim();
      const attemptId = suppliedAttemptId || randomUUID();
      if (!paymentRequestId || !ATTEMPT_ID_PATTERN.test(attemptId)) {
        res.status(400).json({ error: "Tentativo di pagamento non valido." });
        return;
      }

      const prepared = await db.transaction(async (tx) => {
        const [booking] = await tx
          .select()
          .from(excursionBookingsTable)
          .where(eq(excursionBookingsTable.id, ctx.booking.id))
          .for("update")
          .limit(1);
        if (!booking) return { kind: "not_found" as const };
        if (portalPaymentBlocked(booking)) return { kind: "blocked" as const };

        const [request] = await tx
          .select()
          .from(paymentRequestsTable)
          .where(
            and(
              eq(paymentRequestsTable.id, paymentRequestId),
              eq(paymentRequestsTable.bookingId, booking.id),
              inArray(paymentRequestsTable.status, [
                "pending",
                "action_required",
              ]),
            ),
          )
          .for("update")
          .limit(1);
        if (!request) return { kind: "not_found" as const };
        const deadline = effectiveDeadline(request);
        if (deadline && deadline < new Date()) {
          return { kind: "expired" as const };
        }
        const residual = Math.max(
          (booking.totalAmountCents ?? 0) - booking.amountPaidCents,
          0,
        );
        const amount = Math.min(request.amountCents, residual);
        if (amount <= 0) return { kind: "settled" as const };
        if (!isStripeChargeAmountSupported(amount)) {
          return { kind: "below_minimum" as const };
        }

        const idempotencyKey = `portal-${request.id}-${attemptId}`;
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
            .onConflictDoNothing({
              target: paymentAttemptsTable.idempotencyKey,
            })
            .returning();
          if (!attempt) {
            [attempt] = await tx
              .select()
              .from(paymentAttemptsTable)
              .where(eq(paymentAttemptsTable.idempotencyKey, idempotencyKey))
              .limit(1);
          }
        }
        if (!attempt)
          throw new Error("Impossibile creare il tentativo idempotente.");
        const staleAttempts = await tx
          .select({
            id: paymentAttemptsTable.id,
            stripePaymentIntentId: paymentAttemptsTable.stripePaymentIntentId,
          })
          .from(paymentAttemptsTable)
          .where(
            and(
              eq(paymentAttemptsTable.paymentRequestId, request.id),
              ne(paymentAttemptsTable.id, attempt.id),
              isNotNull(paymentAttemptsTable.stripePaymentIntentId),
              inArray(paymentAttemptsTable.status, [
                "pending",
                "processing",
                "action_required",
                "failed",
                "cancellation_pending",
              ]),
            ),
          );
        return {
          kind: "ready" as const,
          booking,
          request,
          amount,
          attempt,
          idempotencyKey,
          staleAttempts,
        };
      });

      if (prepared.kind === "not_found") {
        res
          .status(404)
          .json({ error: "Richiesta di pagamento non disponibile." });
        return;
      }
      if (prepared.kind === "blocked") {
        res.status(409).json({
          error:
            "Non è possibile avviare un pagamento durante l'annullamento o dopo il rilascio dei posti.",
          code: "booking_cancellation_in_progress",
        });
        return;
      }
      if (prepared.kind === "expired") {
        res.status(410).json({
          error: "La richiesta di pagamento è scaduta. Contatta l'agenzia.",
        });
        return;
      }
      if (prepared.kind === "settled") {
        res.status(409).json({ error: "La prenotazione risulta già saldata." });
        return;
      }
      if (prepared.kind === "below_minimum") {
        res.status(400).json({
          error:
            "L'importo è inferiore al minimo accettato per la carta. Scegli bonifico o pagamento in ufficio.",
          code: "CARD_AMOUNT_BELOW_MINIMUM",
        });
        return;
      }
      const {
        booking,
        request,
        amount,
        attempt,
        idempotencyKey,
        staleAttempts,
      } = prepared;
      for (const stale of staleAttempts) {
        if (!stale.stripePaymentIntentId) continue;
        const cleanup = await scheduleStripeCleanupWithFallback({
          bookingId: booking.id,
          operation: "cancel_payment_intent",
          stripeResourceId: stale.stripePaymentIntentId,
        });
        if (cleanup === "scheduled") {
          await db
            .update(paymentAttemptsTable)
            .set({ status: "cancellation_pending", updatedAt: new Date() })
            .where(eq(paymentAttemptsTable.id, stale.id));
        }
      }

      if (attempt.stripePaymentIntentId) {
        const existingIntent = await stripeClient.paymentIntents.retrieve(
          attempt.stripePaymentIntentId,
        );
        const stillAllowed = await portalPaymentStillAllowed({
          bookingId: booking.id,
          paymentRequestId: request.id,
        });
        if (!stillAllowed) {
          await recoverOrCleanupUnlinkedPaymentIntent({
            bookingId: booking.id,
            paymentIntentId: existingIntent.id,
          });
          res.status(409).json({
            error:
              "Il pagamento è stato sospeso mentre era in preparazione. Nessun client secret è stato restituito.",
            code: "booking_cancellation_in_progress",
          });
          return;
        }
        if (existingIntent.status === "succeeded") {
          const applied = await applySuccessfulCardPayment(existingIntent);
          const disposition = cardPaymentApplicationDisposition(applied);
          if (disposition === "refund_initiated") {
            res.status(409).json({
              code: "PAYMENT_REFUND_INITIATED",
              refundStatus: applied?.refundStatus,
              error:
                "Il pagamento è stato ricevuto fuori tempo ed è stato preso in carico per il rimborso. Non ripetere il pagamento.",
            });
            return;
          }
          if (disposition === "not_applied") {
            res.status(409).json({
              code: "PAYMENT_RECONCILIATION_PENDING",
              error:
                "Stripe ha ricevuto il pagamento, ma la prenotazione non è ancora riconciliata. Non ripetere il pagamento e contatta l'agenzia.",
            });
            return;
          }
          await minimizeSavedCardDataForBooking(applied!.bookingId);
          res.json({
            attemptId: attempt.id,
            paymentIntentId: existingIntent.id,
            clientSecret: null,
            status: "succeeded",
          });
          return;
        }
        if (existingIntent.status === "canceled") {
          await markCancelledCardPaymentAttempt(existingIntent);
          res.status(409).json({
            error:
              "Questo tentativo di pagamento e stato annullato. Avviane uno nuovo.",
            code: "payment_attempt_cancelled",
          });
          return;
        }
        res.json({
          attemptId: attempt.id,
          paymentIntentId: existingIntent.id,
          clientSecret: existingIntent.client_secret,
          status: existingIntent.status,
        });
        return;
      }

      const createPaymentIntent = () =>
        stripeClient.paymentIntents.create(
          {
            amount,
            currency: "eur",
            receipt_email: booking.email ?? undefined,
            description: `${ctx.excursion.name} — saldo ${booking.bookingCode ?? booking.id}`,
            automatic_payment_methods: { enabled: true },
            metadata: {
              source: "elis-travel",
              flow: "booking-portal",
              bookingId: booking.id,
              paymentRequestId: request.id,
              paymentAttemptId: attempt.id,
              type: request.type,
            },
          },
          { idempotencyKey },
        );
      let creationAttempted = false;
      let createdPaymentIntentId: string | null = null;
      try {
        creationAttempted = true;
        const intent = await createPaymentIntent();
        createdPaymentIntentId = intent.id;
        const now = new Date();
        const linked = await db.transaction(async (tx) => {
          const [currentBooking] = await tx
            .select()
            .from(excursionBookingsTable)
            .where(eq(excursionBookingsTable.id, booking.id))
            .for("update")
            .limit(1);
          if (!currentBooking || portalPaymentBlocked(currentBooking)) {
            return false;
          }
          const [currentRequest] = await tx
            .select()
            .from(paymentRequestsTable)
            .where(
              and(
                eq(paymentRequestsTable.id, request.id),
                eq(paymentRequestsTable.bookingId, currentBooking.id),
                inArray(paymentRequestsTable.status, [
                  "pending",
                  "action_required",
                ]),
              ),
            )
            .for("update")
            .limit(1);
          if (!currentRequest) return false;
          const currentDeadline = effectiveDeadline(currentRequest);
          if (currentDeadline && currentDeadline < now) return false;
          const linkedAttempt = await tx
            .update(paymentAttemptsTable)
            .set({
              stripePaymentIntentId: intent.id,
              status: "processing",
              updatedAt: now,
            })
            .where(
              and(
                eq(paymentAttemptsTable.id, attempt.id),
                inArray(paymentAttemptsTable.status, [
                  "pending",
                  "processing",
                  "action_required",
                  "failed",
                ]),
              ),
            )
            .returning({ id: paymentAttemptsTable.id });
          const linkedRequest = await tx
            .update(paymentRequestsTable)
            .set({
              method: "card",
              stripePaymentIntentId: intent.id,
              status: "pending",
              updatedAt: now,
            })
            .where(eq(paymentRequestsTable.id, currentRequest.id))
            .returning({ id: paymentRequestsTable.id });
          const linkedBooking = await tx
            .update(excursionBookingsTable)
            .set({
              paymentMethod: "card",
              stripePaymentIntentId: intent.id,
              updatedAt: now,
            })
            .where(eq(excursionBookingsTable.id, currentBooking.id))
            .returning({ id: excursionBookingsTable.id });
          if (
            linkedAttempt.length === 0 ||
            linkedRequest.length === 0 ||
            linkedBooking.length === 0
          ) {
            throw new Error(
              "Riferimenti rimossi durante il collegamento del PaymentIntent",
            );
          }
          return true;
        });
        if (!linked) {
          await recoverOrCleanupUnlinkedPaymentIntent({
            bookingId: booking.id,
            paymentIntentId: intent.id,
          });
          res.status(409).json({
            error:
              "Il pagamento è stato sospeso mentre era in preparazione. La risorsa Stripe è stata accodata per la riconciliazione.",
            code: "booking_cancellation_in_progress",
          });
          return;
        }
        res.status(201).json({
          attemptId: attempt.id,
          paymentIntentId: intent.id,
          clientSecret: intent.client_secret,
          status: intent.status,
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        if (creationAttempted && !createdPaymentIntentId) {
          try {
            const recovered = await createPaymentIntent();
            createdPaymentIntentId = recovered.id;
          } catch (recoveryError) {
            logger.error(
              { err: recoveryError, attemptId: attempt.id },
              "PaymentIntent portale con esito incerto non recuperato",
            );
          }
        }
        const recovery = createdPaymentIntentId
          ? await recoverOrCleanupUnlinkedPaymentIntent({
              bookingId: booking.id,
              paymentIntentId: createdPaymentIntentId,
            })
          : "unresolved";
        if (recovery !== "reconciled") {
          await db
            .update(paymentAttemptsTable)
            .set({
              status: createdPaymentIntentId ? "processing" : "failed",
              stripePaymentIntentId: createdPaymentIntentId,
              lastErrorMessage: detail.slice(0, 2_000),
              completedAt: createdPaymentIntentId ? null : new Date(),
              updatedAt: new Date(),
            })
            .where(eq(paymentAttemptsTable.id, attempt.id));
        }
        throw error;
      }
    } catch (error) {
      logger.error({ err: error }, "Creazione PaymentIntent portale fallita");
      res
        .status(500)
        .json({ error: "Impossibile avviare il pagamento. Riprova." });
    }
  },
);

router.post(
  "/booking-portal/payment-confirmed",
  publicFormsLimiter,
  async (req, res) => {
    try {
      const ctx = await authorizedBooking(req);
      if (!ctx) {
        res
          .status(404)
          .json({ error: "Link prenotazione non valido o scaduto." });
        return;
      }
      const { paymentIntentId } = req.body as { paymentIntentId?: string };
      if (!paymentIntentId || !stripe) {
        res.status(400).json({ error: "Pagamento non valido." });
        return;
      }
      const [attempt] = await db
        .select({ id: paymentAttemptsTable.id })
        .from(paymentAttemptsTable)
        .innerJoin(
          paymentRequestsTable,
          eq(paymentAttemptsTable.paymentRequestId, paymentRequestsTable.id),
        )
        .where(
          and(
            eq(paymentAttemptsTable.stripePaymentIntentId, paymentIntentId),
            eq(paymentRequestsTable.bookingId, ctx.booking.id),
          ),
        )
        .limit(1);
      if (!attempt) {
        res.status(400).json({ error: "Pagamento non riconosciuto." });
        return;
      }
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (intent.status !== "succeeded") {
        res.status(409).json({ error: "Il pagamento non risulta completato." });
        return;
      }
      const applied = await applySuccessfulCardPayment(intent);
      const disposition = cardPaymentApplicationDisposition(applied);
      if (disposition === "refund_initiated") {
        res.status(409).json({
          ok: false,
          code: "PAYMENT_REFUND_INITIATED",
          refundStatus: applied?.refundStatus,
          error:
            "Il pagamento è stato ricevuto quando la prenotazione non era più pagabile ed è stato preso in carico per il rimborso. Non ripetere il pagamento.",
        });
        return;
      }
      if (disposition === "not_applied") {
        res.status(409).json({
          ok: false,
          code: "PAYMENT_RECONCILIATION_PENDING",
          error:
            "Stripe ha ricevuto il pagamento, ma la prenotazione non è ancora riconciliata. Non ripetere il pagamento e contatta l'agenzia.",
        });
        return;
      }
      await minimizeSavedCardDataForBooking(applied!.bookingId);
      res.json({ ok: true, alreadyApplied: applied!.alreadyApplied });
    } catch (error) {
      logger.error({ err: error }, "Conferma pagamento portale fallita");
      res.status(500).json({ error: "Errore interno del server." });
    }
  },
);

export default router;
