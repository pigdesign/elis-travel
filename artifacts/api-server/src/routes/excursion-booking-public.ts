import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  excursionsTable,
  excursionBookingsTable,
  bookingParticipantsTable,
  bookingConsentsTable,
  paymentAttemptsTable,
  paymentRequestsTable,
  customersTable,
} from "@workspace/db/schema";
import {
  asc,
  eq,
  and,
  gt,
  inArray,
  isNull,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { publicFormsLimiter } from "../middlewares/rateLimiter";
import { stripe } from "../services/stripe";
import { logger } from "../lib/logger";
import {
  loadPricingContext,
  getPaymentSettings,
  buildQuote,
  availablePaymentMethods,
  computePaymentDeadline,
  generateBookingCode,
  isNoPaymentRequired,
  isStripeChargeAmountSupported,
  quotedAmountSnapshotDecision,
  requiresSavedCardAuthorization,
  QuoteError,
  type Quote,
  type QuoteParticipantInput,
} from "../services/excursion-pricing";
import {
  applySuccessfulCardPayment,
  cardPaymentApplicationDisposition,
} from "../services/excursion-payments";
import {
  applySuccessfulCardSetup,
  CardSetupVerificationError,
} from "../services/excursion-card-setup";
import { releaseBookingSeatsInTransaction } from "../services/seat-reservations";
import {
  recoverOrCleanupUnlinkedPaymentIntent,
  scheduleStripeCleanupWithFallback,
} from "../services/stripe-cleanup";
import {
  shouldCleanupRecoveredStripeResource,
  shouldRollbackBookingAfterStripeSetupFailure,
} from "../services/stripe-cleanup-policy";
import {
  dispatchBookingInstructionsEmailsV2,
  dispatchCardSavedEmailV2,
  dispatchNewBookingAdminEmailV2,
  dispatchPaymentReceivedEmailV2,
} from "../services/excursion-booking-emails-v2";
import {
  normalizeBookingParticipantIdentities,
  ParticipantDetailsError,
} from "../services/participant-details";
import {
  computeGraceUntil,
  endOfDayInRome,
  isDepartureOpenForBooking,
} from "../services/excursion-time";
import { isPaymentBlockedByCancellation } from "../services/booking-cancellation-guard";
import {
  HomePickupValidationError,
  normalizeHomePickupRequest,
} from "../services/excursion-home-pickup";
import { classifyPublicSeatReservationUpdateMiss } from "../services/public-seat-reservation-conflict";

// ---------------------------------------------------------------------------
// Prenotazione pubblica Gite v2: partecipanti individuali, consensi separati,
// richiesta di pagamento con scadenza e tre metodi (carta con addebito
// immediato o carta salvata via SetupIntent, bonifico, pagamento in ufficio).
// Ogni importo è ricalcolato dal server; il totale del browser viene ignorato.
// ---------------------------------------------------------------------------

const router: IRouter = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type BookRequestBody = {
  bookingAttemptId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  participants?: QuoteParticipantInput[];
  pickupPointId?: string | null;
  paymentType?: string;
  paymentMethod?: string;
  quotedTotalCents?: number;
  quotedAmountDueCents?: number;
  futureChargeConsent?: boolean;
  consents?: { terms?: boolean; privacy?: boolean; media?: boolean };
  servizioCasa?: boolean;
  homePickupAddress?: string;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function allocateUniqueBookingCodeInTransaction(
  tx: DbTransaction,
): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = generateBookingCode();
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`booking-code:${candidate}`}, 0))`,
    );
    const [collision] = await tx
      .select({ id: excursionBookingsTable.id })
      .from(excursionBookingsTable)
      .where(eq(excursionBookingsTable.bookingCode, candidate))
      .limit(1);
    if (!collision) return candidate;
  }
  throw new Error("Impossibile generare un codice prenotazione univoco.");
}

function publicCheckoutBlocked(
  booking: typeof excursionBookingsTable.$inferSelect,
): boolean {
  return (
    isPaymentBlockedByCancellation(booking) || booking.seatStatus === "released"
  );
}

async function publicCheckoutStillAllowed(input: {
  bookingId: string;
  paymentRequestId: string;
  requestStatuses: string[];
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [booking] = await tx
      .select()
      .from(excursionBookingsTable)
      .where(eq(excursionBookingsTable.id, input.bookingId))
      .for("update")
      .limit(1);
    if (!booking || publicCheckoutBlocked(booking)) return false;
    const now = new Date();
    if (booking.seatHoldExpiresAt && booking.seatHoldExpiresAt < now) {
      return false;
    }
    const [excursion] = await tx
      .select({
        status: excursionsTable.status,
        departureAt: excursionsTable.departureAt,
      })
      .from(excursionsTable)
      .where(eq(excursionsTable.id, booking.excursionId))
      .limit(1);
    if (
      !excursion ||
      ["completed", "cancelled", "archived"].includes(excursion.status) ||
      !isDepartureOpenForBooking(excursion.departureAt, now)
    ) {
      return false;
    }
    const [request] = await tx
      .select()
      .from(paymentRequestsTable)
      .where(
        and(
          eq(paymentRequestsTable.id, input.paymentRequestId),
          eq(paymentRequestsTable.bookingId, booking.id),
          inArray(paymentRequestsTable.status, input.requestStatuses),
        ),
      )
      .for("update")
      .limit(1);
    if (!request) return false;
    const effectiveDeadline = request.graceUntil ?? request.deadline;
    return !effectiveDeadline || effectiveDeadline >= now;
  });
}

router.post("/excursions/:id/book", publicFormsLimiter, async (req, res) => {
  try {
    const id = req.params.id as string;
    const body = req.body as BookRequestBody;
    const suppliedBookingAttemptId = body.bookingAttemptId?.trim() ?? "";
    if (
      suppliedBookingAttemptId &&
      !UUID_REGEX.test(suppliedBookingAttemptId)
    ) {
      res.status(400).json({
        error: "Identificativo del tentativo di prenotazione non valido.",
      });
      return;
    }
    // Il campo resta opzionale per non interrompere i client gia aperti durante
    // il rollout. I nuovi client lo inviano e possono ripetere la richiesta
    // senza creare una seconda prenotazione o occupare nuovamente i posti.
    const bookingAttemptId = suppliedBookingAttemptId || randomUUID();

    // --- Referente ---
    const firstName = body.firstName?.trim() ?? "";
    const lastName = body.lastName?.trim() ?? "";
    const email = body.email?.trim().toLowerCase() ?? "";
    const phone = body.phone?.trim() ?? "";
    if (!firstName || !lastName) {
      res.status(400).json({ error: "Nome e cognome sono obbligatori." });
      return;
    }
    if (!email || !EMAIL_REGEX.test(email)) {
      res.status(400).json({ error: "Indirizzo email non valido." });
      return;
    }
    if (!phone) {
      res.status(400).json({ error: "Il numero di telefono è obbligatorio." });
      return;
    }
    if (
      firstName.length > 100 ||
      lastName.length > 100 ||
      email.length > 200 ||
      phone.length > 40
    ) {
      res.status(400).json({ error: "Dati referente troppo lunghi." });
      return;
    }

    // Ogni nuova prenotazione nasce gia pronta per lista operativa e chiusura
    // amministrativa. Il solo caso legacy compatibile e una prenotazione di
    // una persona: se una vecchia pagina non manda i nomi, usa il referente.
    const participantInputs = body.participants ?? [];
    const participantIdentities = normalizeBookingParticipantIdentities(
      participantInputs,
      { firstName, lastName },
    );

    // --- Consensi: termini e privacy obbligatori, foto/video facoltativo ---
    const consents = body.consents ?? {};
    if (consents.terms !== true) {
      res.status(400).json({
        error: "Devi accettare i Termini e Condizioni per prenotare.",
      });
      return;
    }
    if (consents.privacy !== true) {
      res
        .status(400)
        .json({ error: "Devi accettare l'Informativa Privacy per prenotare." });
      return;
    }
    const mediaAccepted = consents.media === true;

    // --- Tipo e metodo di pagamento ---
    const requestedPaymentType =
      body.paymentType === "deposit"
        ? "deposit"
        : body.paymentType === "full"
          ? "full"
          : null;
    if (!requestedPaymentType) {
      res.status(400).json({ error: "Tipo di pagamento non valido." });
      return;
    }
    const requestedPaymentMethod =
      body.paymentMethod === "card" ||
      body.paymentMethod === "bank_transfer" ||
      body.paymentMethod === "office"
        ? body.paymentMethod
        : null;

    const [preflightBooking] = suppliedBookingAttemptId
      ? await db
          .select()
          .from(excursionBookingsTable)
          .where(
            eq(
              excursionBookingsTable.bookingAttemptId,
              suppliedBookingAttemptId,
            ),
          )
          .limit(1)
      : [null];
    const [preflightParticipants, preflightFutureConsent] = preflightBooking
      ? await Promise.all([
          db
            .select()
            .from(bookingParticipantsTable)
            .where(eq(bookingParticipantsTable.bookingId, preflightBooking.id))
            .orderBy(asc(bookingParticipantsTable.sortOrder)),
          db
            .select()
            .from(bookingConsentsTable)
            .where(
              and(
                eq(bookingConsentsTable.bookingId, preflightBooking.id),
                eq(bookingConsentsTable.consentType, "future_card_charge"),
              ),
            )
            .limit(1),
        ])
      : [[], []];

    // --- Contesto gita ---
    const ctx = await loadPricingContext(id);
    if (!ctx) {
      res.status(404).json({ error: "Gita non trovata." });
      return;
    }
    const { excursion } = ctx;
    let homePickup: ReturnType<typeof normalizeHomePickupRequest>;
    try {
      homePickup =
        preflightBooking && body.homePickupAddress === undefined
          ? {
              servizioCasa: Boolean(preflightBooking.servizioCasa),
              homePickupAddress: preflightBooking.homePickupAddress,
            }
          : normalizeHomePickupRequest(
              {
                servizioCasa: body.servizioCasa,
                homePickupAddress: body.homePickupAddress,
              },
              {
                available:
                  Boolean(preflightBooking) ||
                  ctx.pickupPoints.some((point) => point.active),
              },
            );
    } catch (error) {
      if (error instanceof HomePickupValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
    if (
      !preflightBooking &&
      excursion.status !== "open" &&
      excursion.status !== "confirmed"
    ) {
      res
        .status(400)
        .json({ error: "Le prenotazioni per questa gita sono chiuse." });
      return;
    }
    const now = new Date();
    if (
      !preflightBooking &&
      !isDepartureOpenForBooking(excursion.departureAt, now)
    ) {
      res.status(400).json({
        error: "Le prenotazioni sono chiuse: la partenza non è futura.",
        code: "EXCURSION_DEPARTURE_UNAVAILABLE",
      });
      return;
    }
    const bookingCloseAt = excursion.bookingCloseDate
      ? endOfDayInRome(excursion.bookingCloseDate)
      : null;
    if (!preflightBooking && bookingCloseAt && now > bookingCloseAt) {
      res
        .status(400)
        .json({ error: "Le prenotazioni per questa gita sono chiuse." });
      return;
    }

    // Regola server-side inderogabile: chi prenota una gita gia confermata
    // paga il totale, anche se il browser aveva ancora una selezione acconto.
    let paymentType: "deposit" | "full" = preflightBooking
      ? preflightBooking.paymentType === "deposit"
        ? "deposit"
        : "full"
      : excursion.status === "confirmed"
        ? "full"
        : requestedPaymentType;

    const settings = await getPaymentSettings();
    // --- Preventivo server-side (valida partecipanti, fasce, punti, acconto) ---
    const quote: Quote = preflightBooking
      ? {
          participants: preflightParticipants.map((participant) => ({
            type: participant.participantType as QuoteParticipantInput["type"],
            ageRangeId: participant.ageRangeId,
            ageRangeLabel: participant.ageRangeLabel,
            pickupPointId: participant.pickupPointId,
            pickupPointName: participant.pickupPointName,
            basePriceCents: participant.basePriceCents,
            pickupSurchargeCents: participant.pickupSurchargeCents,
            finalPriceCents: participant.finalPriceCents,
            sortOrder: participant.sortOrder,
          })),
          totalCents: preflightBooking.totalAmountCents ?? 0,
          depositCents:
            preflightBooking.paymentType === "deposit"
              ? (preflightBooking.amountDueCents ?? 0)
              : 0,
          amountDueCents: preflightBooking.amountDueCents ?? 0,
          paymentType,
          depositAllowed: paymentType === "deposit",
          seats: preflightBooking.seats,
        }
      : buildQuote(
          ctx,
          {
            participants: participantInputs,
            pickupPointId: body.pickupPointId ?? null,
            paymentType,
          },
          settings,
        );

    const quoteSnapshotDecision = quotedAmountSnapshotDecision({
      quotedTotalCents: body.quotedTotalCents,
      quotedAmountDueCents: body.quotedAmountDueCents,
      authoritativeTotalCents: quote.totalCents,
      authoritativeAmountDueCents: quote.amountDueCents,
    });
    if (quoteSnapshotDecision === "missing") {
      res.status(400).json({
        error:
          "Il preventivo non è presente o non è valido. Ricalcolalo prima di prenotare.",
        code: "QUOTE_SNAPSHOT_REQUIRED",
      });
      return;
    }
    if (quoteSnapshotDecision === "changed") {
      res.status(409).json({
        error:
          "Il prezzo è cambiato dopo il preventivo. Verifica il nuovo totale prima di confermare.",
        code: "QUOTE_CHANGED",
        quote: {
          totalCents: quote.totalCents,
          amountDueCents: quote.amountDueCents,
        },
      });
      return;
    }

    const noPaymentRequired = isNoPaymentRequired(quote);
    if (noPaymentRequired && !preflightBooking) paymentType = "full";
    if (!noPaymentRequired && !requestedPaymentMethod) {
      res.status(400).json({ error: "Metodo di pagamento non valido." });
      return;
    }
    // Una prenotazione gratuita non conserva un metodo fittizio e non dipende
    // dalla disponibilita di Stripe, IBAN o ufficio.
    const paymentMethod = preflightBooking
      ? preflightBooking.paymentMethod
      : noPaymentRequired
        ? null
        : requestedPaymentMethod!;
    if (!preflightBooking && !noPaymentRequired) {
      const methods = availablePaymentMethods(
        excursion,
        settings,
        Boolean(stripe),
      );
      const methodAvailable =
        paymentMethod === "card"
          ? methods.card
          : paymentMethod === "bank_transfer"
            ? methods.bankTransfer
            : methods.office;
      if (!methodAvailable) {
        res.status(400).json({
          error: "Metodo di pagamento non disponibile per questa gita.",
        });
        return;
      }
    }

    // Il salvataggio carta e ammesso esclusivamente per un acconto di una gita
    // ancora aperta e soltanto quando flag e versione consenso sono configurati.
    const savedCardAuthorizationRequired = preflightBooking
      ? false
      : requiresSavedCardAuthorization({
          paymentMethod,
          paymentType,
          excursionStatus: excursion.status,
          depositAllowed: quote.depositAllowed,
        });
    const saveCardForConfirmation = preflightBooking
      ? paymentMethod === "card" &&
        paymentType === "deposit" &&
        Boolean(
          preflightBooking.stripeSetupIntentId ||
          preflightFutureConsent[0]?.accepted,
        )
      : savedCardAuthorizationRequired &&
        settings.futureCardChargeEnabled &&
        Boolean(settings.futureCardChargeConsentVersion?.trim());
    const futureChargeConsentVersion =
      preflightFutureConsent[0]?.policyVersion ??
      settings.futureCardChargeConsentVersion;
    if (
      !preflightBooking &&
      savedCardAuthorizationRequired &&
      !saveCardForConfirmation
    ) {
      res.status(409).json({
        error:
          "L'acconto con carta richiede l'autorizzazione al salvataggio per la conferma, ma questa funzione non è disponibile. Scegli bonifico o pagamento in ufficio.",
        code: "CARD_DEPOSIT_REQUIRES_SAVED_CARD_AUTHORIZATION",
      });
      return;
    }
    if (
      !preflightBooking &&
      paymentMethod === "card" &&
      !noPaymentRequired &&
      !isStripeChargeAmountSupported(quote.amountDueCents)
    ) {
      res.status(400).json({
        error:
          "L'importo è inferiore al minimo accettato per la carta. Scegli bonifico o pagamento in ufficio.",
        code: "CARD_AMOUNT_BELOW_MINIMUM",
      });
      return;
    }
    if (saveCardForConfirmation && body.futureChargeConsent !== true) {
      res.status(400).json({
        error:
          "Devi autorizzare il salvataggio della carta e l'addebito dell'acconto alla conferma della gita.",
      });
      return;
    }
    // Fail closed: se la pagina era rimasta aperta mentre stato/configurazione
    // cambiavano, non trasformiamo mai un consenso futuro in un addebito subito.
    if (
      !noPaymentRequired &&
      body.futureChargeConsent === true &&
      !saveCardForConfirmation
    ) {
      res.status(400).json({
        error:
          "Le condizioni di pagamento della gita sono cambiate. Ricarica la pagina prima di continuare.",
      });
      return;
    }

    // --- Scadenza pagamento ---
    let deadlineHours =
      paymentMethod === "bank_transfer"
        ? (excursion.bankTransferHoursOverride ?? settings.bankHours)
        : paymentMethod === "office"
          ? (excursion.officeHoursOverride ?? settings.officeHours)
          : settings.cardCheckoutHoldMinutes / 60;
    const fullOnlyDays =
      excursion.fullPaymentOnlyDaysBefore ?? settings.fullOnlyDaysBefore;
    const departure =
      excursion.departureAt ?? new Date(`${excursion.date}T00:00:00`);
    const daysLeft = Math.floor(
      (departure.getTime() - now.getTime()) / 86400000,
    );
    if (fullOnlyDays > 0 && daysLeft < fullOnlyDays) {
      deadlineHours = Math.min(deadlineHours, settings.nearDepartureHours);
    }
    const paymentDeadline = computePaymentDeadline({
      from: now,
      hours: deadlineHours,
      excursion,
      hardLimitDate:
        paymentType === "deposit" ? excursion.depositDeadlineDate : null,
    });
    const bookingPaymentDeadline = noPaymentRequired ? null : paymentDeadline;
    const paymentGraceUntil =
      paymentMethod === "bank_transfer" || paymentMethod === "office"
        ? computeGraceUntil({
            deadline: paymentDeadline,
            graceMinutes: settings.paymentGraceMinutes,
            departureAt: excursion.departureAt,
          })
        : null;
    const seatHoldExpiresAt = noPaymentRequired
      ? null
      : paymentMethod === "card"
        ? new Date(
            Math.min(
              now.getTime() + settings.cardCheckoutHoldMinutes * 60 * 1000,
              paymentDeadline.getTime(),
            ),
          )
        : (paymentGraceUntil ?? paymentDeadline);

    let bookingCode: string | null = null;
    const customerName = `${firstName} ${lastName}`;
    const paymentStatus = noPaymentRequired
      ? "paid"
      : saveCardForConfirmation
        ? "card_setup_pending"
        : paymentMethod === "card"
          ? "pending_card"
          : paymentType === "deposit"
            ? "deposit_requested"
            : "full_requested";

    const adultsCount = quote.participants.filter(
      (p) =>
        p.type === "adult" || p.type === "patient" || p.type === "companion",
    ).length;
    const childrenCount = quote.participants.filter(
      (p) => p.type === "child",
    ).length;
    // Gite normali: il punto unico della prenotazione resta anche sulla colonna legacy
    const bookingPickupPointId = ctx.isRident
      ? null
      : (quote.participants[0]?.pickupPointId ?? null);

    const result = await db.transaction(async (tx) => {
      // Serializza esclusivamente i retry dello stesso tentativo. L'advisory
      // lock evita che due richieste concorrenti incrementino entrambe i posti
      // prima che l'indice univoco su bookingAttemptId possa intervenire.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${bookingAttemptId}, 0))`,
      );

      const [existingBooking] = await tx
        .select()
        .from(excursionBookingsTable)
        .where(eq(excursionBookingsTable.bookingAttemptId, bookingAttemptId))
        .limit(1);

      if (existingBooking) {
        const existingParticipants = await tx
          .select()
          .from(bookingParticipantsTable)
          .where(eq(bookingParticipantsTable.bookingId, existingBooking.id))
          .orderBy(asc(bookingParticipantsTable.sortOrder));
        const [mediaConsent] = await tx
          .select({ accepted: bookingConsentsTable.accepted })
          .from(bookingConsentsTable)
          .where(
            and(
              eq(bookingConsentsTable.bookingId, existingBooking.id),
              eq(bookingConsentsTable.consentType, "media"),
            ),
          )
          .limit(1);
        const [futureConsent] = await tx
          .select({ accepted: bookingConsentsTable.accepted })
          .from(bookingConsentsTable)
          .where(
            and(
              eq(bookingConsentsTable.bookingId, existingBooking.id),
              eq(bookingConsentsTable.consentType, "future_card_charge"),
            ),
          )
          .limit(1);

        const participantsMatch =
          existingParticipants.length === quote.participants.length &&
          existingParticipants.every((participant, index) => {
            const expected = quote.participants[index];
            const expectedIdentity = participantIdentities[index];
            const raw = participantInputs[index];
            const requestedPickupPointId = ctx.isRident
              ? (raw?.pickupPointId ?? null)
              : (body.pickupPointId ?? null);
            return (
              participant.sortOrder === expected?.sortOrder &&
              participant.participantType === expected?.type &&
              (participant.ageRangeId ?? null) ===
                (expected?.ageRangeId ?? null) &&
              (participant.pickupPointId ?? null) ===
                (expected?.pickupPointId ?? null) &&
              participant.finalPriceCents === expected?.finalPriceCents &&
              participant.firstName?.trim() === expectedIdentity?.firstName &&
              participant.lastName?.trim() === expectedIdentity?.lastName &&
              (!raw ||
                (participant.participantType === raw.type &&
                  (participant.ageRangeId ?? null) ===
                    (raw.ageRangeId ?? null) &&
                  (participant.pickupPointId ?? null) ===
                    requestedPickupPointId)) &&
              participant.dataCompleted === true
            );
          });
        const sameAttempt =
          existingBooking.excursionId === id &&
          existingBooking.customerName === customerName &&
          existingBooking.email === email &&
          existingBooking.phone === phone &&
          existingBooking.seats === quote.seats &&
          existingBooking.paymentType === paymentType &&
          existingBooking.paymentMethod === paymentMethod &&
          (noPaymentRequired ||
            existingBooking.paymentMethod === requestedPaymentMethod) &&
          existingBooking.totalAmountCents === quote.totalCents &&
          existingBooking.amountDueCents === quote.amountDueCents &&
          Boolean(existingBooking.servizioCasa) === homePickup.servizioCasa &&
          (existingBooking.homePickupAddress ?? null) ===
            homePickup.homePickupAddress &&
          (existingBooking.pickupPointId ?? null) ===
            (bookingPickupPointId ?? null) &&
          (mediaConsent?.accepted ?? false) === mediaAccepted &&
          (futureConsent?.accepted ?? false) ===
            (body.futureChargeConsent === true) &&
          participantsMatch;
        if (!sameAttempt) {
          return { kind: "attempt_conflict" as const };
        }
        if (
          existingBooking.cancelledAt ||
          existingBooking.seatStatus === "released" ||
          [
            "expired",
            "cancelled",
            "charge_skipped",
            "refund_required",
            "refunded",
          ].includes(existingBooking.paymentStatus)
        ) {
          return { kind: "attempt_expired" as const };
        }

        const [paymentRequest] = await tx
          .select()
          .from(paymentRequestsTable)
          .where(eq(paymentRequestsTable.bookingId, existingBooking.id))
          .orderBy(asc(paymentRequestsTable.createdAt))
          .limit(1);
        if (!paymentRequest) {
          throw new Error(
            "Tentativo di prenotazione esistente privo della richiesta di pagamento.",
          );
        }
        const replayDeadline =
          paymentRequest.graceUntil ?? paymentRequest.deadline;
        if (
          [
            "pending",
            "card_setup_pending",
            "action_required",
            "scheduled",
          ].includes(paymentRequest.status) &&
          ((!isDepartureOpenForBooking(excursion.departureAt, now) &&
            existingBooking.paymentStatus !== "paid") ||
            (replayDeadline !== null && replayDeadline < now))
        ) {
          return { kind: "attempt_expired" as const };
        }
        const [paymentAttempt] = await tx
          .select()
          .from(paymentAttemptsTable)
          .where(eq(paymentAttemptsTable.paymentRequestId, paymentRequest.id))
          .orderBy(asc(paymentAttemptsTable.createdAt))
          .limit(1);
        return {
          kind: "ok" as const,
          booking: existingBooking,
          paymentRequest,
          paymentAttempt: paymentAttempt ?? null,
          reused: true,
        };
      }

      const updated = await tx
        .update(excursionsTable)
        .set({
          adherentsCount: sql`${excursionsTable.adherentsCount} + ${quote.seats}`,
          ...(noPaymentRequired
            ? {
                balancesCount: sql`${excursionsTable.balancesCount} + ${quote.seats}`,
              }
            : {}),
          updatedAt: now,
        })
        .where(
          and(
            eq(excursionsTable.id, id),
            eq(excursionsTable.status, excursion.status),
            sql`${excursionsTable}.xmin::text = ${ctx.excursionRowVersion}`,
            ne(excursionsTable.status, "completed"),
            ne(excursionsTable.status, "cancelled"),
            ne(excursionsTable.status, "archived"),
            sql`${excursionsTable.departureAt} IS NOT NULL AND ${excursionsTable.departureAt} > CURRENT_TIMESTAMP`,
            or(
              eq(excursionsTable.currentCapacity, 0),
              sql`${excursionsTable.adherentsCount} + ${quote.seats} <= ${excursionsTable.currentCapacity}`,
            ),
          ),
        )
        .returning({ id: excursionsTable.id });

      if (updated.length === 0) {
        const [exists] = await tx
          .select({
            id: excursionsTable.id,
            status: excursionsTable.status,
            departureAt: excursionsTable.departureAt,
            currentCapacity: excursionsTable.currentCapacity,
            adherentsCount: excursionsTable.adherentsCount,
            rowVersion: sql<string>`${excursionsTable}.xmin::text`,
          })
          .from(excursionsTable)
          .where(eq(excursionsTable.id, id))
          .limit(1);
        return classifyPublicSeatReservationUpdateMiss({
          current: exists ?? null,
          expectedStatus: excursion.status,
          expectedRowVersion: ctx.excursionRowVersion,
          requestedSeats: quote.seats,
          now,
        });
      }

      const [existingCustomer] = await tx
        .select({ id: customersTable.id })
        .from(customersTable)
        .where(eq(customersTable.email, email))
        .limit(1);

      bookingCode = await allocateUniqueBookingCodeInTransaction(tx);

      const [booking] = await tx
        .insert(excursionBookingsTable)
        .values({
          excursionId: id,
          customerId: existingCustomer?.id ?? null,
          customerName,
          email,
          phone,
          seats: quote.seats,
          adults: adultsCount,
          children: childrenCount,
          paymentStatus,
          servizioCasa: homePickup.servizioCasa,
          homePickupAddress: homePickup.homePickupAddress,
          pickupPointId: bookingPickupPointId,
          bookingCode,
          paymentType,
          paymentMethod,
          totalAmountCents: quote.totalCents,
          amountDueCents: quote.amountDueCents,
          amountPaidCents: 0,
          paymentDeadline: bookingPaymentDeadline,
          workflowVersion: 3,
          bookingAttemptId,
          customerNotificationsEnabled: true,
          seatStatus: noPaymentRequired ? "confirmed" : "held",
          seatHoldExpiresAt,
        })
        .returning();

      await tx.insert(bookingParticipantsTable).values(
        quote.participants.map((p) => {
          const identity = participantIdentities[p.sortOrder];
          if (!identity) {
            // Difesa interna: buildQuote mantiene cardinalita e ordine, quindi
            // questa condizione indica una regressione e deve annullare la tx.
            throw new ParticipantDetailsError(
              "I dati anagrafici dei partecipanti non corrispondono al preventivo.",
            );
          }
          return {
            bookingId: booking.id,
            participantType: p.type,
            ageRangeId: p.ageRangeId,
            ageRangeLabel: p.ageRangeLabel,
            pickupPointId: p.pickupPointId,
            pickupPointName: p.pickupPointName,
            basePriceCents: p.basePriceCents,
            pickupSurchargeCents: p.pickupSurchargeCents,
            finalPriceCents: p.finalPriceCents,
            firstName: identity.firstName,
            lastName: identity.lastName,
            dataCompleted: true,
            sortOrder: p.sortOrder,
          };
        }),
      );

      const consentRows = [
        {
          bookingId: booking.id,
          consentType: "terms",
          accepted: true,
          policyVersion: settings.termsVersion,
        },
        {
          bookingId: booking.id,
          consentType: "privacy",
          accepted: true,
          policyVersion: settings.privacyVersion,
        },
        {
          bookingId: booking.id,
          consentType: "media",
          accepted: mediaAccepted,
          policyVersion: settings.mediaVersion,
        },
      ];
      if (saveCardForConfirmation) {
        consentRows.push({
          bookingId: booking.id,
          consentType: "future_card_charge",
          accepted: true,
          policyVersion: futureChargeConsentVersion!,
        });
      }
      await tx.insert(bookingConsentsTable).values(consentRows);

      const [paymentRequest] = await tx
        .insert(paymentRequestsTable)
        .values({
          bookingId: booking.id,
          type: paymentType,
          amountCents: quote.amountDueCents,
          status: noPaymentRequired
            ? "paid"
            : saveCardForConfirmation
              ? "card_setup_pending"
              : "pending",
          method: paymentMethod,
          deadline: bookingPaymentDeadline,
          graceUntil: paymentGraceUntil,
          paidAt: noPaymentRequired ? now : null,
          transactionReference: noPaymentRequired
            ? "no_payment_required"
            : null,
        })
        .returning();

      const [paymentAttempt] =
        paymentMethod === "card" &&
        !saveCardForConfirmation &&
        !noPaymentRequired
          ? await tx
              .insert(paymentAttemptsTable)
              .values({
                paymentRequestId: paymentRequest.id,
                amountCents: quote.amountDueCents,
                idempotencyKey: `pr-${paymentRequest.id}`,
                status: "pending",
              })
              .returning()
          : [null];

      return {
        kind: "ok" as const,
        booking,
        paymentRequest,
        paymentAttempt,
        reused: false,
      };
    });

    if (result.kind === "notfound") {
      res.status(404).json({ error: "Gita non trovata." });
      return;
    }
    if (result.kind === "closed") {
      res
        .status(400)
        .json({ error: "Le prenotazioni per questa gita sono chiuse." });
      return;
    }
    if (result.kind === "departed") {
      res.status(409).json({
        error: "Le prenotazioni sono chiuse: la gita è già partita.",
        code: "EXCURSION_DEPARTURE_UNAVAILABLE",
      });
      return;
    }
    if (result.kind === "changed") {
      res.status(409).json({
        error:
          "I dati della gita sono cambiati mentre confermavi. Verifica nuovamente disponibilità e prezzo.",
        code: "QUOTE_CHANGED",
      });
      return;
    }
    if (result.kind === "attempt_conflict") {
      res.status(409).json({
        error:
          "Questo tentativo di prenotazione e gia stato usato con dati diversi. Ricarica la pagina prima di continuare.",
      });
      return;
    }
    if (result.kind === "attempt_expired") {
      res.status(409).json({
        error:
          "Questo tentativo di prenotazione e scaduto o e gia stato annullato. Ricarica la pagina per iniziarne uno nuovo.",
      });
      return;
    }
    if (result.kind === "full") {
      res.status(400).json({
        error:
          result.remaining <= 0
            ? "Posti esauriti per questa gita."
            : `Sono rimasti solo ${result.remaining} posti disponibili.`,
      });
      return;
    }

    const resolvedBookingCode =
      result.booking.bookingCode ?? bookingCode ?? result.booking.id;
    const causale = `${resolvedBookingCode} - ${lastName} - ${excursion.name}`;
    const baseResponse = {
      id: result.booking.id,
      bookingCode: resolvedBookingCode,
      seats: result.booking.seats,
      totalCents: result.booking.totalAmountCents ?? quote.totalCents,
      amountDueCents: result.booking.amountDueCents ?? quote.amountDueCents,
      paymentType: result.booking.paymentType ?? paymentType,
      paymentMethod: result.booking.paymentMethod ?? paymentMethod,
      paymentStatus: result.booking.paymentStatus,
      paymentDeadline: result.booking.paymentDeadline?.toISOString() ?? null,
      paymentGraceUntil:
        result.paymentRequest.graceUntil?.toISOString() ?? null,
    };
    const bookingResponseStatus = result.reused ? 200 : 201;

    if (noPaymentRequired) {
      await Promise.all([
        dispatchPaymentReceivedEmailV2(
          result.booking.id,
          "full",
          result.paymentRequest.id,
        ),
        dispatchNewBookingAdminEmailV2(result.booking.id),
      ]);
      res.status(bookingResponseStatus).json({
        ...baseResponse,
        paymentMethod: null,
        paymentStatus: "paid",
        cardFlow: "no_payment_required",
        message:
          "Prenotazione confermata: il totale è pari a zero e non è richiesto alcun pagamento.",
      });
      return;
    }

    if (paymentMethod === "bank_transfer") {
      dispatchBookingInstructionsEmailsV2(result.booking.id);
      res.status(bookingResponseStatus).json({
        ...baseResponse,
        bank: {
          iban: settings.iban,
          beneficiary: settings.beneficiary,
          bank: settings.bank,
          causale,
        },
        message:
          paymentType === "deposit"
            ? "Prenotazione registrata. Versa l'acconto con bonifico entro la scadenza indicata per riservare il posto."
            : "Prenotazione registrata. Completa il bonifico entro la scadenza indicata.",
      });
      return;
    }

    if (paymentMethod === "office") {
      dispatchBookingInstructionsEmailsV2(result.booking.id);
      res.status(bookingResponseStatus).json({
        ...baseResponse,
        office: {
          address: settings.officeAddress,
          openingHours: settings.officeOpeningHours,
        },
        message:
          "Prenotazione registrata. Il posto è riservato temporaneamente fino alla scadenza indicata: passa in ufficio per completare il pagamento.",
      });
      return;
    }

    // --- Carta: SetupIntent senza addebito oppure PaymentIntent immediato ---
    const stripeClient = stripe;
    if (!stripeClient) {
      // Non dovrebbe accadere (methods.card era true), ma per sicurezza:
      if (!result.reused) await rollbackBooking(result.booking.id);
      res.status(503).json({ error: "Pagamenti con carta non configurati." });
      return;
    }
    const liveCardSettings = await getPaymentSettings();
    const liveCardAvailable = availablePaymentMethods(
      excursion,
      liveCardSettings,
      true,
    ).card;
    const liveFutureChargeAvailable =
      liveCardSettings.futureCardChargeEnabled &&
      Boolean(liveCardSettings.futureCardChargeConsentVersion?.trim());
    if (
      !liveCardAvailable ||
      (saveCardForConfirmation && !liveFutureChargeAvailable)
    ) {
      if (!result.reused) await rollbackBooking(result.booking.id);
      res.status(409).json({
        error:
          "I pagamenti con carta sono stati sospesi mentre preparavamo la prenotazione. Scegli un altro metodo.",
        code: "card_payments_disabled",
      });
      return;
    }

    if (saveCardForConfirmation) {
      let stripeCustomerId = result.booking.stripeCustomerId;
      let stripeSetupIntentId = result.booking.stripeSetupIntentId;
      let customerCreationAttempted = false;
      let setupIntentCreationAttempted = false;
      const createCustomer = () =>
        stripeClient.customers.create(
          {
            name: customerName,
            email,
            phone,
            metadata: {
              source: "elis-travel",
              bookingId: result.booking.id,
              bookingCode: resolvedBookingCode,
            },
          },
          { idempotencyKey: `booking-customer-${result.booking.id}` },
        );
      const createSetupIntent = (customerId: string) =>
        stripeClient.setupIntents.create(
          {
            customer: customerId,
            usage: "off_session",
            payment_method_types: ["card"],
            metadata: {
              source: "elis-travel",
              flow: "save_for_confirmation",
              type: "deposit",
              bookingId: result.booking.id,
              paymentRequestId: result.paymentRequest.id,
              bookingCode: resolvedBookingCode,
              consentVersion: futureChargeConsentVersion!,
            },
          },
          { idempotencyKey: `setup-${result.paymentRequest.id}` },
        );
      try {
        const customer = stripeCustomerId
          ? await stripeClient.customers.retrieve(stripeCustomerId)
          : await (async () => {
              customerCreationAttempted = true;
              return createCustomer();
            })();
        if (customer.deleted) {
          throw new Error("Customer Stripe del tentativo gia eliminato");
        }
        stripeCustomerId = customer.id;

        const setupIntent = stripeSetupIntentId
          ? await stripeClient.setupIntents.retrieve(stripeSetupIntentId)
          : await (async () => {
              setupIntentCreationAttempted = true;
              return createSetupIntent(customer.id);
            })();
        stripeSetupIntentId = setupIntent.id;

        const linkedBooking = await db
          .update(excursionBookingsTable)
          .set({
            stripeCustomerId: customer.id,
            stripeSetupIntentId: setupIntent.id,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(excursionBookingsTable.id, result.booking.id),
              eq(excursionBookingsTable.seatStatus, "held"),
              isNull(excursionBookingsTable.cancelledAt),
              or(
                isNull(excursionBookingsTable.cancellationRequestStatus),
                notInArray(excursionBookingsTable.cancellationRequestStatus, [
                  "pending",
                  "approved",
                ]),
              ),
              or(
                and(
                  eq(
                    excursionBookingsTable.paymentStatus,
                    "card_setup_pending",
                  ),
                  gt(excursionBookingsTable.seatHoldExpiresAt, new Date()),
                ),
                and(
                  eq(excursionBookingsTable.paymentStatus, "card_saved"),
                  isNull(excursionBookingsTable.seatHoldExpiresAt),
                ),
              ),
            ),
          )
          .returning({ id: excursionBookingsTable.id });
        if (linkedBooking.length === 0) {
          throw new Error(
            "Prenotazione non piu disponibile durante l'inizializzazione Stripe",
          );
        }

        const setupStillAllowed = await publicCheckoutStillAllowed({
          bookingId: result.booking.id,
          paymentRequestId: result.paymentRequest.id,
          requestStatuses: ["card_setup_pending", "scheduled"],
        });
        if (!setupStillAllowed) {
          await Promise.all([
            scheduleStripeCleanupWithFallback({
              bookingId: result.booking.id,
              operation: "cancel_setup_intent",
              stripeResourceId: setupIntent.id,
            }),
            scheduleStripeCleanupWithFallback({
              bookingId: result.booking.id,
              operation: "delete_customer",
              stripeResourceId: customer.id,
            }),
          ]);
          res.status(409).json({
            error:
              "Il salvataggio carta è stato sospeso mentre era in preparazione. Nessun client secret è stato restituito.",
            code: "booking_cancellation_in_progress",
          });
          return;
        }

        if (setupIntent.status === "succeeded") {
          const applied = await applySuccessfulCardSetup(setupIntent, {
            bookingId: result.booking.id,
            excursionId: id,
          });
          await dispatchCardSavedEmailV2(applied.bookingId);
          dispatchNewBookingAdminEmailV2(result.booking.id);
          res.status(bookingResponseStatus).json({
            ...baseResponse,
            paymentStatus: "card_saved",
            cardFlow: "save_for_confirmation",
            message:
              "Carta gia salvata: la prenotazione e registrata e non e stato effettuato alcun addebito.",
          });
          return;
        }
        if (setupIntent.status === "canceled") {
          res.status(409).json({
            error:
              "Il salvataggio carta di questo tentativo e scaduto. Ricarica la pagina per riprovare.",
          });
          return;
        }
        if (!setupIntent.client_secret) {
          throw new Error("SetupIntent privo di client_secret");
        }

        dispatchNewBookingAdminEmailV2(result.booking.id);
        res.status(bookingResponseStatus).json({
          ...baseResponse,
          cardFlow: "save_for_confirmation",
          stripeSetupClientSecret: setupIntent.client_secret,
          message:
            "Salva la carta per riservare il posto: non viene effettuato alcun addebito ora. L'acconto sara addebitato soltanto se la gita verra confermata.",
        });
      } catch (stripeErr) {
        logger.error(
          { stripeErr, bookingId: result.booking.id },
          "Stripe SetupIntent creation failed",
        );
        if (!stripeCustomerId && customerCreationAttempted) {
          try {
            const recoveredCustomer = await createCustomer();
            stripeCustomerId = recoveredCustomer.id;
          } catch (recoveryError) {
            logger.error(
              { recoveryError, bookingId: result.booking.id },
              "Customer Stripe con esito incerto non recuperato",
            );
          }
        }
        if (
          !stripeSetupIntentId &&
          setupIntentCreationAttempted &&
          stripeCustomerId
        ) {
          try {
            const recoveredSetupIntent =
              await createSetupIntent(stripeCustomerId);
            stripeSetupIntentId = recoveredSetupIntent.id;
          } catch (recoveryError) {
            logger.error(
              { recoveryError, bookingId: result.booking.id },
              "SetupIntent con esito incerto non recuperato",
            );
          }
        }
        const [authoritativeBooking] = await db
          .select()
          .from(excursionBookingsTable)
          .where(eq(excursionBookingsTable.id, result.booking.id))
          .limit(1);
        const now = new Date();
        const bookingCanStillUseSetup = Boolean(
          authoritativeBooking &&
          !publicCheckoutBlocked(authoritativeBooking) &&
          authoritativeBooking.seatStatus === "held" &&
          ["card_setup_pending", "card_saved"].includes(
            authoritativeBooking.paymentStatus,
          ) &&
          (!authoritativeBooking.seatHoldExpiresAt ||
            authoritativeBooking.seatHoldExpiresAt >= now),
        );
        const setupIsAuthoritativelyLinked = Boolean(
          stripeSetupIntentId &&
          authoritativeBooking?.stripeSetupIntentId === stripeSetupIntentId,
        );
        const customerIsAuthoritativelyLinked = Boolean(
          stripeCustomerId &&
          authoritativeBooking?.stripeCustomerId === stripeCustomerId,
        );

        // Anche un retry idempotente (`reused`) può aver recuperato risorse
        // Stripe create in una risposta persa ma mai collegate al DB. In quel
        // caso maintenance non potrebbe scoprirle: il cleanup dipende dallo
        // stato autorevole/link, non dal fatto che la booking sia nuova.
        if (
          stripeSetupIntentId &&
          shouldCleanupRecoveredStripeResource({
            bookingCanUseResource: bookingCanStillUseSetup,
            resourceIsAuthoritativelyLinked: setupIsAuthoritativelyLinked,
          })
        ) {
          await scheduleStripeCleanupWithFallback({
            bookingId: result.booking.id,
            operation: "cancel_setup_intent",
            stripeResourceId: stripeSetupIntentId,
          });
        }
        if (
          stripeCustomerId &&
          shouldCleanupRecoveredStripeResource({
            bookingCanUseResource: bookingCanStillUseSetup,
            resourceIsAuthoritativelyLinked: customerIsAuthoritativelyLinked,
          })
        ) {
          await scheduleStripeCleanupWithFallback({
            bookingId: result.booking.id,
            operation: "delete_customer",
            stripeResourceId: stripeCustomerId,
          });
        }
        if (
          shouldRollbackBookingAfterStripeSetupFailure({
            bookingWasReused: result.reused,
            bookingCanUseSetup: bookingCanStillUseSetup,
            setupIsAuthoritativelyLinked,
            customerIsAuthoritativelyLinked,
          })
        ) {
          await rollbackBooking(result.booking.id);
        }
        res
          .status(500)
          .json({ error: "Errore nel salvataggio della carta. Riprova." });
      }
      return;
    }

    const createPaymentIntent = () =>
      stripeClient.paymentIntents.create(
        {
          amount: result.paymentRequest.amountCents,
          currency: "eur",
          receipt_email: email,
          description: `${excursion.name} — ${causale}`,
          metadata: {
            bookingId: result.booking.id,
            paymentRequestId: result.paymentRequest.id,
            paymentAttemptId: result.paymentAttempt?.id ?? "",
            bookingCode: resolvedBookingCode,
            type: paymentType,
            source: "elis-travel",
          },
          automatic_payment_methods: { enabled: true },
        },
        { idempotencyKey: `pr-${result.paymentRequest.id}` },
      );
    let createdPaymentIntentId: string | null = null;
    let paymentIntentCreationAttempted = false;
    try {
      const intent = result.booking.stripePaymentIntentId
        ? await stripeClient.paymentIntents.retrieve(
            result.booking.stripePaymentIntentId,
          )
        : await (async () => {
            paymentIntentCreationAttempted = true;
            const created = await createPaymentIntent();
            createdPaymentIntentId = created.id;
            return created;
          })();

      if (intent.status === "succeeded") {
        const applied = await applySuccessfulCardPayment(intent);
        const disposition = cardPaymentApplicationDisposition(applied);
        if (disposition === "refund_initiated") {
          res.status(409).json({
            code: "PAYMENT_REFUND_INITIATED",
            refundStatus: applied?.refundStatus,
            error:
              "Il pagamento è arrivato quando il posto non era più confermabile ed è stato preso in carico per il rimborso. Non ripetere il pagamento.",
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
        dispatchNewBookingAdminEmailV2(result.booking.id);
        res.status(bookingResponseStatus).json({
          ...baseResponse,
          paymentStatus: "paid",
          cardFlow: "pay_now",
          message: "Pagamento gia completato e prenotazione confermata.",
        });
        return;
      }
      if (intent.status === "canceled") {
        res.status(409).json({
          error:
            "Il pagamento di questo tentativo e scaduto. Ricarica la pagina per riprovare.",
        });
        return;
      }
      if (!intent.client_secret) {
        throw new Error("PaymentIntent privo di client_secret");
      }

      const intentCreatedAt = new Date();
      const linked = await db.transaction(async (tx) => {
        const [currentBooking] = await tx
          .select()
          .from(excursionBookingsTable)
          .where(eq(excursionBookingsTable.id, result.booking.id))
          .for("update")
          .limit(1);
        if (
          !currentBooking ||
          publicCheckoutBlocked(currentBooking) ||
          currentBooking.paymentStatus !== "pending_card" ||
          (currentBooking.seatHoldExpiresAt !== null &&
            currentBooking.seatHoldExpiresAt < intentCreatedAt)
        ) {
          return false;
        }
        const [currentRequest] = await tx
          .select()
          .from(paymentRequestsTable)
          .where(
            and(
              eq(paymentRequestsTable.id, result.paymentRequest.id),
              eq(paymentRequestsTable.bookingId, currentBooking.id),
              eq(paymentRequestsTable.status, "pending"),
            ),
          )
          .for("update")
          .limit(1);
        const effectiveDeadline = currentRequest
          ? (currentRequest.graceUntil ?? currentRequest.deadline)
          : null;
        if (
          !currentRequest ||
          (effectiveDeadline !== null && effectiveDeadline < intentCreatedAt)
        ) {
          return false;
        }
        const linkedBooking = await tx
          .update(excursionBookingsTable)
          .set({ stripePaymentIntentId: intent.id, updatedAt: intentCreatedAt })
          .where(eq(excursionBookingsTable.id, currentBooking.id))
          .returning({ id: excursionBookingsTable.id });
        const linkedRequest = await tx
          .update(paymentRequestsTable)
          .set({ stripePaymentIntentId: intent.id, updatedAt: intentCreatedAt })
          .where(eq(paymentRequestsTable.id, currentRequest.id))
          .returning({ id: paymentRequestsTable.id });
        if (linkedBooking.length === 0 || linkedRequest.length === 0) {
          throw new Error(
            "Prenotazione rimossa durante il collegamento del PaymentIntent",
          );
        }
        if (result.paymentAttempt) {
          const linkedAttempt = await tx
            .update(paymentAttemptsTable)
            .set({
              stripePaymentIntentId: intent.id,
              status: "processing",
              updatedAt: intentCreatedAt,
            })
            .where(eq(paymentAttemptsTable.id, result.paymentAttempt.id))
            .returning({ id: paymentAttemptsTable.id });
          if (linkedAttempt.length === 0) {
            throw new Error(
              "Tentativo rimosso durante il collegamento del PaymentIntent",
            );
          }
        }
        return true;
      });
      if (!linked) {
        await recoverOrCleanupUnlinkedPaymentIntent({
          bookingId: result.booking.id,
          paymentIntentId: intent.id,
        });
        res.status(409).json({
          error:
            "Il pagamento è stato sospeso mentre era in preparazione. Nessun client secret è stato restituito.",
          code: "booking_cancellation_in_progress",
        });
        return;
      }

      dispatchNewBookingAdminEmailV2(result.booking.id);
      res.status(bookingResponseStatus).json({
        ...baseResponse,
        cardFlow: "pay_now",
        stripeClientSecret: intent.client_secret,
        message:
          "Completa il pagamento con carta per confermare la prenotazione.",
      });
    } catch (stripeErr) {
      logger.error(
        { stripeErr, bookingId: result.booking.id },
        "Stripe PaymentIntent creation failed",
      );
      let recovery:
        | "scheduled"
        | "compensated"
        | "reconciled"
        | "unresolved"
        | null = null;
      if (
        !result.booking.stripePaymentIntentId &&
        paymentIntentCreationAttempted
      ) {
        // Ripetere create con la stessa idempotency key recupera anche il caso
        // in cui Stripe ha creato il PI ma la risposta si e persa.
        if (!createdPaymentIntentId) {
          try {
            const recoveredIntent = await createPaymentIntent();
            createdPaymentIntentId = recoveredIntent.id;
          } catch (recoveryError) {
            logger.error(
              { recoveryError, bookingId: result.booking.id },
              "PaymentIntent con esito incerto non recuperato via idempotency key",
            );
          }
        }
        if (createdPaymentIntentId) {
          recovery = await recoverOrCleanupUnlinkedPaymentIntent({
            bookingId: result.booking.id,
            paymentIntentId: createdPaymentIntentId,
          });
        } else {
          recovery = "unresolved";
        }
      }
      if (
        !result.reused &&
        recovery !== "reconciled" &&
        recovery !== "unresolved" &&
        recovery !== "scheduled"
      ) {
        await rollbackBooking(result.booking.id);
      }
      res
        .status(500)
        .json({ error: "Errore nella creazione del pagamento. Riprova." });
    }
  } catch (err) {
    if (err instanceof QuoteError || err instanceof ParticipantDetailsError) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error("Public excursion booking failed:", err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

// Elimina la prenotazione appena creata e libera i posti (fallimento Stripe).
// Le righe collegate (partecipanti, consensi, richieste) cadono via cascade.
async function rollbackBooking(bookingId: string): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      const [booking] = await tx
        .select()
        .from(excursionBookingsTable)
        .where(eq(excursionBookingsTable.id, bookingId))
        .for("update")
        .limit(1);
      if (
        !booking ||
        publicCheckoutBlocked(booking) ||
        !["pending_card", "card_setup_pending"].includes(booking.paymentStatus)
      ) {
        return;
      }
      // La guardia su seatStatus rende il decremento idempotente anche se due
      // percorsi di errore tentano il rollback della stessa prenotazione.
      await releaseBookingSeatsInTransaction(
        tx,
        bookingId,
        "stripe_initialization_failed",
      );
      await tx
        .delete(excursionBookingsTable)
        .where(eq(excursionBookingsTable.id, bookingId));
    });
  } catch (rollbackErr) {
    logger.error({ rollbackErr, bookingId }, "Rollback prenotazione fallito");
  }
}

// Conferma in pagina dopo stripe.confirmPayment: verifica il PaymentIntent e
// applica il pagamento (idempotente col webhook, che resta la fonte primaria).
router.post(
  "/excursions/:id/book/:bookingId/payment-confirmed",
  async (req, res) => {
    try {
      const { bookingId } = req.params;
      const { paymentIntentId } = req.body as { paymentIntentId?: string };
      if (!paymentIntentId) {
        res.status(400).json({ error: "paymentIntentId mancante." });
        return;
      }
      if (!stripe) {
        res.status(503).json({ error: "Pagamenti non configurati." });
        return;
      }

      const [booking] = await db
        .select({
          id: excursionBookingsTable.id,
          stripePaymentIntentId: excursionBookingsTable.stripePaymentIntentId,
        })
        .from(excursionBookingsTable)
        .where(eq(excursionBookingsTable.id, bookingId))
        .limit(1);
      if (!booking) {
        res.status(404).json({ error: "Prenotazione non trovata." });
        return;
      }
      if (booking.stripePaymentIntentId !== paymentIntentId) {
        res.status(400).json({
          error: "Pagamento non riconosciuto per questa prenotazione.",
        });
        return;
      }

      const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (intent.status !== "succeeded") {
        res.status(400).json({ error: "Il pagamento non risulta completato." });
        return;
      }

      const applied = await applySuccessfulCardPayment(intent);
      const disposition = cardPaymentApplicationDisposition(applied);
      if (disposition === "not_applied") {
        res.status(409).json({
          ok: false,
          code: "PAYMENT_RECONCILIATION_PENDING",
          error:
            "Stripe ha ricevuto il pagamento, ma la prenotazione non è ancora riconciliata. Non ripetere il pagamento e contatta l'agenzia.",
        });
        return;
      }
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
      res.json({ ok: true, alreadyApplied: applied!.alreadyApplied });
    } catch (err) {
      logger.error({ err }, "payment-confirmed endpoint failed");
      res.status(500).json({ error: "Errore interno del server." });
    }
  },
);

// Conferma in pagina dopo stripe.confirmSetup. Le stesse verifiche vengono
// applicate dal webhook: ID SetupIntent, booking, richiesta, customer,
// metadata e consenso devono coincidere prima di rendere la carta utilizzabile.
router.post(
  "/excursions/:id/book/:bookingId/card-setup-confirmed",
  publicFormsLimiter,
  async (req, res) => {
    try {
      const { id: excursionId, bookingId } = req.params as {
        id: string;
        bookingId: string;
      };
      const { setupIntentId } = req.body as { setupIntentId?: string };
      if (!setupIntentId) {
        res.status(400).json({ error: "setupIntentId mancante." });
        return;
      }
      if (!stripe) {
        res.status(503).json({ error: "Pagamenti non configurati." });
        return;
      }

      const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
      const applied = await applySuccessfulCardSetup(setupIntent, {
        bookingId,
        excursionId,
      });
      await dispatchCardSavedEmailV2(applied.bookingId);
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof CardSetupVerificationError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      logger.error({ err }, "card-setup-confirmed endpoint failed");
      res.status(500).json({ error: "Errore interno del server." });
    }
  },
);

export default router;
