import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  excursionsTable,
  excursionBookingsTable,
  bookingParticipantsTable,
  bookingConsentsTable,
  paymentRequestsTable,
  customersTable,
} from "@workspace/db/schema";
import { eq, and, ne, or, sql } from "drizzle-orm";
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
  QuoteError,
  type QuoteParticipantInput,
} from "../services/excursion-pricing";
import { applySuccessfulCardPayment } from "../services/excursion-payments";
import {
  dispatchBookingInstructionsEmailsV2,
  dispatchNewBookingAdminEmailV2,
} from "../services/excursion-booking-emails-v2";

// ---------------------------------------------------------------------------
// Prenotazione pubblica Gite v2: partecipanti individuali, consensi separati,
// richiesta di pagamento con scadenza e tre metodi (carta con addebito
// immediato via PaymentIntent, bonifico con causale, pagamento in ufficio).
// Ogni importo è ricalcolato dal server; il totale del browser viene ignorato.
// ---------------------------------------------------------------------------

const router: IRouter = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type BookRequestBody = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  participants?: QuoteParticipantInput[];
  pickupPointId?: string | null;
  paymentType?: string;
  paymentMethod?: string;
  consents?: { terms?: boolean; privacy?: boolean; media?: boolean };
  servizioCasa?: boolean;
};

router.post("/excursions/:id/book", publicFormsLimiter, async (req, res) => {
  try {
    const id = req.params.id as string;
    const body = req.body as BookRequestBody;

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
    if (firstName.length > 100 || lastName.length > 100 || email.length > 200 || phone.length > 40) {
      res.status(400).json({ error: "Dati referente troppo lunghi." });
      return;
    }

    // --- Consensi: termini e privacy obbligatori, foto/video facoltativo ---
    const consents = body.consents ?? {};
    if (consents.terms !== true) {
      res.status(400).json({ error: "Devi accettare i Termini e Condizioni per prenotare." });
      return;
    }
    if (consents.privacy !== true) {
      res.status(400).json({ error: "Devi accettare l'Informativa Privacy per prenotare." });
      return;
    }
    const mediaAccepted = consents.media === true;

    // --- Tipo e metodo di pagamento ---
    const paymentType = body.paymentType === "deposit" ? "deposit" : body.paymentType === "full" ? "full" : null;
    if (!paymentType) {
      res.status(400).json({ error: "Tipo di pagamento non valido." });
      return;
    }
    const paymentMethod =
      body.paymentMethod === "card" || body.paymentMethod === "bank_transfer" || body.paymentMethod === "office"
        ? body.paymentMethod
        : null;
    if (!paymentMethod) {
      res.status(400).json({ error: "Metodo di pagamento non valido." });
      return;
    }

    // --- Contesto gita ---
    const ctx = await loadPricingContext(id);
    if (!ctx) {
      res.status(404).json({ error: "Gita non trovata." });
      return;
    }
    const { excursion } = ctx;
    if (excursion.status !== "open" && excursion.status !== "confirmed") {
      res.status(400).json({ error: "Le prenotazioni per questa gita sono chiuse." });
      return;
    }
    if (excursion.bookingCloseDate && new Date() > new Date(`${excursion.bookingCloseDate}T23:59:59`)) {
      res.status(400).json({ error: "Le prenotazioni per questa gita sono chiuse." });
      return;
    }

    const settings = await getPaymentSettings();
    const methods = availablePaymentMethods(excursion, settings, Boolean(stripe));
    const methodAvailable =
      paymentMethod === "card" ? methods.card : paymentMethod === "bank_transfer" ? methods.bankTransfer : methods.office;
    if (!methodAvailable) {
      res.status(400).json({ error: "Metodo di pagamento non disponibile per questa gita." });
      return;
    }

    // --- Preventivo server-side (valida partecipanti, fasce, punti, acconto) ---
    const quote = buildQuote(
      ctx,
      {
        participants: body.participants ?? [],
        pickupPointId: body.pickupPointId ?? null,
        paymentType,
      },
      settings,
    );

    // --- Scadenza pagamento ---
    const now = new Date();
    let deadlineHours =
      paymentMethod === "bank_transfer"
        ? (excursion.bankTransferHoursOverride ?? settings.bankHours)
        : paymentMethod === "office"
          ? (excursion.officeHoursOverride ?? settings.officeHours)
          : 24; // carta: finestra per completare l'addebito in pagina
    const fullOnlyDays = excursion.fullPaymentOnlyDaysBefore ?? settings.fullOnlyDaysBefore;
    const departure = new Date(`${excursion.date}T00:00:00`);
    const daysLeft = Math.floor((departure.getTime() - now.getTime()) / 86400000);
    if (fullOnlyDays > 0 && daysLeft < fullOnlyDays) {
      deadlineHours = Math.min(deadlineHours, settings.nearDepartureHours);
    }
    const paymentDeadline = computePaymentDeadline({
      from: now,
      hours: deadlineHours,
      excursion,
      hardLimitDate: paymentType === "deposit" ? excursion.depositDeadlineDate : null,
    });

    const bookingCode = generateBookingCode();
    const customerName = `${firstName} ${lastName}`;
    const paymentStatus =
      paymentMethod === "card" ? "pending_card" : paymentType === "deposit" ? "deposit_requested" : "full_requested";

    const adultsCount = quote.participants.filter((p) => p.type === "adult" || p.type === "patient" || p.type === "companion").length;
    const childrenCount = quote.participants.filter((p) => p.type === "child").length;
    // Gite normali: il punto unico della prenotazione resta anche sulla colonna legacy
    // Punto a livello prenotazione solo se TUTTI i partecipanti condividono lo stesso
    // (gite normali "tutti insieme"); se i punti differiscono resta null → "punti divisi",
    // e i punti restano per-partecipante in booking_participants.
    const distinctPickups = new Set(quote.participants.map((p) => p.pickupPointId ?? ""));
    const bookingPickupPointId =
      ctx.isRident || distinctPickups.size !== 1
        ? null
        : (quote.participants[0]?.pickupPointId ?? null);

    const result = await db.transaction(async (tx) => {
      const updated = await tx
        .update(excursionsTable)
        .set({
          adherentsCount: sql`${excursionsTable.adherentsCount} + ${quote.seats}`,
          updatedAt: now,
        })
        .where(
          and(
            eq(excursionsTable.id, id),
            ne(excursionsTable.status, "completed"),
            ne(excursionsTable.status, "cancelled"),
            ne(excursionsTable.status, "archived"),
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
            currentCapacity: excursionsTable.currentCapacity,
            adherentsCount: excursionsTable.adherentsCount,
          })
          .from(excursionsTable)
          .where(eq(excursionsTable.id, id))
          .limit(1);
        if (!exists) return { kind: "notfound" as const };
        if (["completed", "cancelled", "archived"].includes(exists.status)) {
          return { kind: "closed" as const };
        }
        const remaining = (exists.currentCapacity ?? 0) - (exists.adherentsCount ?? 0);
        return { kind: "full" as const, remaining: Math.max(0, remaining) };
      }

      const [existingCustomer] = await tx
        .select({ id: customersTable.id })
        .from(customersTable)
        .where(eq(customersTable.email, email))
        .limit(1);

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
          servizioCasa: body.servizioCasa === true,
          pickupPointId: bookingPickupPointId,
          bookingCode,
          paymentType,
          paymentMethod,
          totalAmountCents: quote.totalCents,
          amountDueCents: quote.amountDueCents,
          amountPaidCents: 0,
          paymentDeadline,
        })
        .returning();

      await tx.insert(bookingParticipantsTable).values(
        quote.participants.map((p) => ({
          bookingId: booking.id,
          participantType: p.type,
          ageRangeId: p.ageRangeId,
          ageRangeLabel: p.ageRangeLabel,
          pickupPointId: p.pickupPointId,
          pickupPointName: p.pickupPointName,
          basePriceCents: p.basePriceCents,
          pickupSurchargeCents: p.pickupSurchargeCents,
          finalPriceCents: p.finalPriceCents,
          sortOrder: p.sortOrder,
        })),
      );

      await tx.insert(bookingConsentsTable).values([
        { bookingId: booking.id, consentType: "terms", accepted: true, policyVersion: settings.termsVersion },
        { bookingId: booking.id, consentType: "privacy", accepted: true, policyVersion: settings.privacyVersion },
        { bookingId: booking.id, consentType: "media", accepted: mediaAccepted, policyVersion: settings.mediaVersion },
      ]);

      const [paymentRequest] = await tx
        .insert(paymentRequestsTable)
        .values({
          bookingId: booking.id,
          type: paymentType,
          amountCents: quote.amountDueCents,
          status: "pending",
          method: paymentMethod,
          deadline: paymentDeadline,
        })
        .returning();

      return { kind: "ok" as const, booking, paymentRequest };
    });

    if (result.kind === "notfound") {
      res.status(404).json({ error: "Gita non trovata." });
      return;
    }
    if (result.kind === "closed") {
      res.status(400).json({ error: "Le prenotazioni per questa gita sono chiuse." });
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

    const causale = `${bookingCode} - ${lastName} - ${excursion.name}`;
    const baseResponse = {
      id: result.booking.id,
      bookingCode,
      seats: quote.seats,
      totalCents: quote.totalCents,
      amountDueCents: quote.amountDueCents,
      paymentType,
      paymentMethod,
      paymentStatus: result.booking.paymentStatus,
      paymentDeadline: paymentDeadline.toISOString(),
    };

    if (paymentMethod === "bank_transfer") {
      dispatchBookingInstructionsEmailsV2(result.booking.id);
      res.status(201).json({
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
      res.status(201).json({
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

    // --- Carta: addebito immediato con PaymentIntent ---
    const stripeClient = stripe;
    if (!stripeClient) {
      // Non dovrebbe accadere (methods.card era true), ma per sicurezza:
      await rollbackBooking(result.booking.id, id, quote.seats);
      res.status(503).json({ error: "Pagamenti con carta non configurati." });
      return;
    }

    try {
      const intent = await stripeClient.paymentIntents.create(
        {
          amount: quote.amountDueCents,
          currency: "eur",
          receipt_email: email,
          description: `${excursion.name} — ${causale}`,
          metadata: {
            bookingId: result.booking.id,
            paymentRequestId: result.paymentRequest.id,
            bookingCode,
            type: paymentType,
            source: "elis-travel",
          },
          automatic_payment_methods: { enabled: true },
        },
        { idempotencyKey: `pr-${result.paymentRequest.id}` },
      );

      await db
        .update(excursionBookingsTable)
        .set({ stripePaymentIntentId: intent.id, updatedAt: new Date() })
        .where(eq(excursionBookingsTable.id, result.booking.id));
      await db
        .update(paymentRequestsTable)
        .set({ stripePaymentIntentId: intent.id, updatedAt: new Date() })
        .where(eq(paymentRequestsTable.id, result.paymentRequest.id));

      dispatchNewBookingAdminEmailV2(result.booking.id);
      res.status(201).json({
        ...baseResponse,
        stripeClientSecret: intent.client_secret,
        message: "Completa il pagamento con carta per confermare la prenotazione.",
      });
    } catch (stripeErr) {
      logger.error({ stripeErr, bookingId: result.booking.id }, "Stripe PaymentIntent creation failed");
      await rollbackBooking(result.booking.id, id, quote.seats);
      res.status(500).json({ error: "Errore nella creazione del pagamento. Riprova." });
    }
  } catch (err) {
    if (err instanceof QuoteError) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error("Public excursion booking failed:", err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

// Elimina la prenotazione appena creata e libera i posti (fallimento Stripe).
// Le righe collegate (partecipanti, consensi, richieste) cadono via cascade.
async function rollbackBooking(bookingId: string, excursionId: string, seats: number): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await tx.delete(excursionBookingsTable).where(eq(excursionBookingsTable.id, bookingId));
      await tx
        .update(excursionsTable)
        .set({
          adherentsCount: sql`GREATEST(${excursionsTable.adherentsCount} - ${seats}, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(excursionsTable.id, excursionId));
    });
  } catch (rollbackErr) {
    logger.error({ rollbackErr, bookingId }, "Rollback prenotazione fallito");
  }
}

// Conferma in pagina dopo stripe.confirmPayment: verifica il PaymentIntent e
// applica il pagamento (idempotente col webhook, che resta la fonte primaria).
router.post("/excursions/:id/book/:bookingId/payment-confirmed", async (req, res) => {
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
        cancelledAt: excursionBookingsTable.cancelledAt,
      })
      .from(excursionBookingsTable)
      .where(eq(excursionBookingsTable.id, bookingId))
      .limit(1);
    if (!booking) {
      res.status(404).json({ error: "Prenotazione non trovata." });
      return;
    }
    if (booking.cancelledAt) {
      res.status(400).json({ error: "Prenotazione annullata." });
      return;
    }
    if (booking.stripePaymentIntentId !== paymentIntentId) {
      res.status(400).json({ error: "Pagamento non riconosciuto per questa prenotazione." });
      return;
    }

    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== "succeeded") {
      res.status(400).json({ error: "Il pagamento non risulta completato." });
      return;
    }

    await applySuccessfulCardPayment(intent);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "payment-confirmed endpoint failed");
    res.status(500).json({ error: "Errore interno del server." });
  }
});

export default router;
