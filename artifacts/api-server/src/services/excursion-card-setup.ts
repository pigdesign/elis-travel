import type Stripe from "stripe";
import { db } from "@workspace/db";
import {
  bookingConsentsTable,
  excursionBookingsTable,
  excursionsTable,
  paymentRequestsTable,
} from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import type { CardSavedEmailData } from "./excursion-booking-emails";
import { recoverConfirmedBookingWorkflow } from "./excursion-confirmation";
import { isPaymentBlockedByCancellation } from "./booking-cancellation-guard";

export type CardSetupVerificationCode =
  | "not_found"
  | "not_succeeded"
  | "invalid_metadata"
  | "reference_mismatch"
  | "invalid_state";

export class CardSetupVerificationError extends Error {
  constructor(
    public readonly code: CardSetupVerificationCode,
    message: string,
    public readonly statusCode: 400 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = "CardSetupVerificationError";
  }
}

function stripeResourceId(value: string | { id: string } | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

export type SuccessfulCardSetupResult = {
  bookingId: string;
  paymentRequestId: string;
  paymentMethodId: string;
  alreadyApplied: boolean;
  customerEmail: CardSavedEmailData | null;
  confirmationRecovery:
    | "paid"
    | "paid_balance_created"
    | "balance_created"
    | "action_required"
    | "skipped";
};

/**
 * Applica un SetupIntent riuscito soltanto quando tutte le referenze Stripe e
 * database coincidono. Questa e l'unica funzione usata sia dagli endpoint
 * pubblici sia dal webhook, in modo che il callback browser non abbia un
 * percorso meno rigoroso della sorgente asincrona.
 */
export async function applySuccessfulCardSetup(
  setupIntent: Stripe.SetupIntent,
  expected?: { bookingId?: string; excursionId?: string },
): Promise<SuccessfulCardSetupResult> {
  if (setupIntent.status !== "succeeded") {
    throw new CardSetupVerificationError(
      "not_succeeded",
      "La carta non risulta ancora salvata correttamente.",
    );
  }
  if (setupIntent.usage !== "off_session") {
    throw new CardSetupVerificationError(
      "invalid_metadata",
      "Autorizzazione carta non valida per questo flusso.",
    );
  }

  const metadata = setupIntent.metadata ?? {};
  const bookingId = metadata.bookingId?.trim();
  const paymentRequestId = metadata.paymentRequestId?.trim();
  const consentVersion = metadata.consentVersion?.trim();
  if (
    metadata.source !== "elis-travel" ||
    metadata.flow !== "save_for_confirmation" ||
    metadata.type !== "deposit" ||
    !bookingId ||
    !paymentRequestId ||
    !consentVersion
  ) {
    throw new CardSetupVerificationError(
      "invalid_metadata",
      "Autorizzazione carta non riconosciuta.",
    );
  }
  if (expected?.bookingId && expected.bookingId !== bookingId) {
    throw new CardSetupVerificationError(
      "reference_mismatch",
      "Autorizzazione carta non associata a questa prenotazione.",
    );
  }

  const customerId = stripeResourceId(setupIntent.customer);
  const paymentMethodId = stripeResourceId(setupIntent.payment_method);
  if (!customerId || !paymentMethodId) {
    throw new CardSetupVerificationError(
      "reference_mismatch",
      "Cliente o metodo di pagamento Stripe mancanti.",
    );
  }

  const applied = await db.transaction(async (tx) => {
    const [booking] = await tx
      .select()
      .from(excursionBookingsTable)
      .where(eq(excursionBookingsTable.id, bookingId))
      .for("update")
      .limit(1);
    if (!booking) {
      throw new CardSetupVerificationError(
        "not_found",
        "Prenotazione non trovata.",
        404,
      );
    }
    if (expected?.excursionId && expected.excursionId !== booking.excursionId) {
      throw new CardSetupVerificationError(
        "reference_mismatch",
        "Prenotazione non associata a questa gita.",
      );
    }
    if (
      booking.stripeSetupIntentId !== setupIntent.id ||
      booking.stripeCustomerId !== customerId
    ) {
      throw new CardSetupVerificationError(
        "reference_mismatch",
        "Autorizzazione Stripe non associata a questa prenotazione.",
      );
    }

    const [paymentRequest] = await tx
      .select()
      .from(paymentRequestsTable)
      .where(
        and(
          eq(paymentRequestsTable.id, paymentRequestId),
          eq(paymentRequestsTable.bookingId, booking.id),
        ),
      )
      .for("update")
      .limit(1);
    if (
      !paymentRequest ||
      paymentRequest.type !== "deposit" ||
      paymentRequest.method !== "card"
    ) {
      throw new CardSetupVerificationError(
        "reference_mismatch",
        "Richiesta di pagamento non associata alla prenotazione.",
      );
    }

    const [consent] = await tx
      .select({
        accepted: bookingConsentsTable.accepted,
        policyVersion: bookingConsentsTable.policyVersion,
      })
      .from(bookingConsentsTable)
      .where(
        and(
          eq(bookingConsentsTable.bookingId, booking.id),
          eq(bookingConsentsTable.consentType, "future_card_charge"),
        ),
      )
      .limit(1);
    if (!consent?.accepted || consent.policyVersion !== consentVersion) {
      throw new CardSetupVerificationError(
        "reference_mismatch",
        "Consenso all'addebito futuro mancante o non corrispondente.",
      );
    }

    // Il SetupIntent era gia stato applicato e nel frattempo la conferma della
    // gita puo aver fatto avanzare ulteriormente gli stati economici.
    if (
      booking.stripePaymentMethodId === paymentMethodId &&
      booking.paymentStatus !== "card_setup_pending" &&
      paymentRequest.status !== "card_setup_pending"
    ) {
      return {
        bookingId: booking.id,
        paymentRequestId: paymentRequest.id,
        paymentMethodId,
        alreadyApplied: true,
        customerEmail: null,
      };
    }

    const now = new Date();
    if (
      isPaymentBlockedByCancellation(booking) ||
      booking.seatStatus !== "held" ||
      (booking.seatHoldExpiresAt !== null && booking.seatHoldExpiresAt <= now) ||
      booking.paymentStatus !== "card_setup_pending" ||
      paymentRequest.status !== "card_setup_pending"
    ) {
      throw new CardSetupVerificationError(
        "invalid_state",
        "La prenotazione non e piu in attesa del salvataggio carta.",
        409,
      );
    }
    if (
      booking.stripePaymentMethodId &&
      booking.stripePaymentMethodId !== paymentMethodId
    ) {
      throw new CardSetupVerificationError(
        "reference_mismatch",
        "Metodo di pagamento Stripe non corrispondente.",
      );
    }

    await tx
      .update(excursionBookingsTable)
      .set({
        stripePaymentMethodId: paymentMethodId,
        paymentStatus: "card_saved",
        paymentDeadline: null,
        seatHoldExpiresAt: null,
        updatedAt: now,
      })
      .where(eq(excursionBookingsTable.id, booking.id));
    await tx
      .update(paymentRequestsTable)
      .set({
        status: "scheduled",
        deadline: null,
        graceUntil: null,
        updatedAt: now,
      })
      .where(eq(paymentRequestsTable.id, paymentRequest.id));

    const [excursion] = await tx
      .select({
        id: excursionsTable.id,
        name: excursionsTable.name,
        location: excursionsTable.location,
        date: excursionsTable.date,
        pricePerPerson: excursionsTable.pricePerPerson,
      })
      .from(excursionsTable)
      .where(eq(excursionsTable.id, booking.excursionId))
      .limit(1);
    const customerEmail = booking.email && excursion
      ? {
          bookingId: booking.id,
          customerName: booking.customerName,
          customerEmail: booking.email,
          customerPhone: booking.phone,
          seats: booking.seats,
          adults: booking.adults,
          children: booking.children,
          servizioCasa: booking.servizioCasa,
          amountDueCents: booking.amountDueCents ?? 0,
          excursion,
        }
      : null;

    return {
      bookingId: booking.id,
      paymentRequestId: paymentRequest.id,
      paymentMethodId,
      alreadyApplied: false,
      customerEmail,
    };
  });
  const confirmationRecovery = await recoverConfirmedBookingWorkflow(
    applied.bookingId,
  );
  return { ...applied, confirmationRecovery };
}
