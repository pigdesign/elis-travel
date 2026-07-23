import { db } from "@workspace/db";
import {
  excursionsTable,
  excursionPickupPointsTable,
  pickupLocationsTable,
  ageRangesTable,
  excursionAgePricesTable,
  settingsTable,
  type Excursion,
  type AgeRange,
} from "@workspace/db/schema";
import { eq, and, asc, inArray } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Motore di calcolo prezzi Gite v2.
// Unica fonte di verità per i totali: il frontend mostra un'anteprima ma ogni
// importo salvato o addebitato passa da qui. Tutti gli importi calcolati sono
// in centesimi; le configurazioni (numeric del DB) sono in euro.
// ---------------------------------------------------------------------------

export function eurosToCents(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export type ParticipantType = "adult" | "child" | "patient" | "companion";

export type QuoteParticipantInput = {
  type: ParticipantType;
  ageRangeId?: string | null;
  pickupPointId?: string | null;
};

export type QuoteInput = {
  participants: QuoteParticipantInput[];
  // Punto di raccolta unico della prenotazione (gite normali)
  pickupPointId?: string | null;
  paymentType: "deposit" | "full";
};

export type QuotedParticipant = {
  type: ParticipantType;
  ageRangeId: string | null;
  ageRangeLabel: string | null;
  pickupPointId: string | null;
  pickupPointName: string | null;
  basePriceCents: number;
  pickupSurchargeCents: number;
  finalPriceCents: number;
  sortOrder: number;
};

export type Quote = {
  participants: QuotedParticipant[];
  totalCents: number;
  depositCents: number;
  amountDueCents: number;
  paymentType: "deposit" | "full";
  depositAllowed: boolean;
  seats: number;
};

export type PricingPickupPoint = {
  id: string;
  name: string;
  city: string;
  province: string | null;
  pickupTime: string | null;
  sortOrder: number;
  surchargeCents: number;
  mapsUrl: string | null;
  active: boolean;
};

export type PricingContext = {
  excursion: Excursion;
  isRident: boolean;
  ageRanges: AgeRange[];
  // prezzo per fascia (cents); fascia assente = prezzo adulto pieno
  agePriceCents: Map<string, number>;
  pickupPoints: PricingPickupPoint[];
};

export class QuoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteError";
  }
}

// Differenza di prezzo del punto per la gita: dipende SOLO dalla provincia del
// punto (positivo = supplemento, negativo = sconto). Il prezzo si imposta una
// volta per provincia; non esiste più un valore per singolo punto.
export function pickupSurchargeCents(
  province: string | null,
  provinceSurcharges: Record<string, number> | null | undefined,
): number {
  if (!province) return 0;
  const n = Number(provinceSurcharges?.[province] ?? 0);
  return Number.isFinite(n) && n !== 0 ? Math.round(n * 100) : 0;
}

export async function loadPricingContext(excursionId: string): Promise<PricingContext | null> {
  const [excursion] = await db
    .select()
    .from(excursionsTable)
    .where(eq(excursionsTable.id, excursionId))
    .limit(1);
  if (!excursion) return null;

  const ageRanges = await db
    .select()
    .from(ageRangesTable)
    .where(eq(ageRangesTable.active, true))
    .orderBy(asc(ageRangesTable.sortOrder), asc(ageRangesTable.minAge));

  const agePriceCents = new Map<string, number>();
  if (ageRanges.length > 0) {
    const priceRows = await db
      .select()
      .from(excursionAgePricesTable)
      .where(
        and(
          eq(excursionAgePricesTable.excursionId, excursionId),
          inArray(
            excursionAgePricesTable.ageRangeId,
            ageRanges.map((r) => r.id),
          ),
        ),
      );
    for (const row of priceRows) {
      agePriceCents.set(row.ageRangeId, eurosToCents(row.price));
    }
  }

  const pointRows = await db
    .select({
      id: excursionPickupPointsTable.id,
      pickupTime: excursionPickupPointsTable.pickupTime,
      sortOrder: excursionPickupPointsTable.sortOrder,
      surcharge: excursionPickupPointsTable.surcharge,
      name: pickupLocationsTable.name,
      city: pickupLocationsTable.city,
      province: pickupLocationsTable.province,
      mapsUrl: pickupLocationsTable.mapsUrl,
      active: pickupLocationsTable.active,
    })
    .from(excursionPickupPointsTable)
    .innerJoin(
      pickupLocationsTable,
      eq(excursionPickupPointsTable.pickupLocationId, pickupLocationsTable.id),
    )
    .where(eq(excursionPickupPointsTable.excursionId, excursionId))
    .orderBy(asc(excursionPickupPointsTable.sortOrder));

  const pickupPoints: PricingPickupPoint[] = pointRows.map((p) => ({
    id: p.id,
    name: p.name,
    city: p.city,
    province: p.province,
    pickupTime: p.pickupTime,
    sortOrder: p.sortOrder,
    surchargeCents: pickupSurchargeCents(p.province, excursion.provinceSurcharges),
    mapsUrl: p.mapsUrl,
    active: p.active,
  }));

  return {
    excursion,
    isRident: excursion.category === "rident",
    ageRanges,
    agePriceCents,
    pickupPoints,
  };
}

// ---------------------------------------------------------------------------
// Impostazioni pagamento globali con default sicuri
// ---------------------------------------------------------------------------

export type PaymentSettings = {
  depositPercentage: number | null;
  cardPaymentsEnabled: boolean;
  bankHours: number;
  officeHours: number;
  balanceHours: number;
  nearDepartureHours: number;
  fullOnlyDaysBefore: number;
  autoReleaseSeats: boolean;
  iban: string | null;
  beneficiary: string | null;
  bank: string | null;
  officeAddress: string | null;
  officeOpeningHours: string | null;
  termsVersion: string;
  privacyVersion: string;
  mediaVersion: string;
  adultMinAge: number;
};

const PAYMENT_SETTING_KEYS = [
  "deposit_percentage",
  "excursion_card_payments_enabled",
  "payment_deadline_bank_hours",
  "payment_deadline_office_hours",
  "payment_deadline_balance_hours",
  "payment_deadline_near_departure_hours",
  "full_payment_only_days_before",
  "auto_release_seats_on_expiry",
  "payment_iban",
  "payment_beneficiary",
  "payment_bank",
  "office_address",
  "office_opening_hours",
  "terms_policy_version",
  "privacy_policy_version",
  "media_policy_version",
  "adult_min_age",
] as const;

function intOr(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export async function getPaymentSettings(): Promise<PaymentSettings> {
  const rows = await db
    .select({ key: settingsTable.key, value: settingsTable.value })
    .from(settingsTable)
    .where(inArray(settingsTable.key, [...PAYMENT_SETTING_KEYS]));
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  const pct = Number(map.deposit_percentage);
  return {
    depositPercentage: Number.isFinite(pct) && pct > 0 && pct <= 100 ? pct : null,
    cardPaymentsEnabled: map.excursion_card_payments_enabled !== "false",
    bankHours: intOr(map.payment_deadline_bank_hours, 48),
    officeHours: intOr(map.payment_deadline_office_hours, 48),
    balanceHours: intOr(map.payment_deadline_balance_hours, 48),
    nearDepartureHours: intOr(map.payment_deadline_near_departure_hours, 48),
    fullOnlyDaysBefore: (() => {
      const n = Number(map.full_payment_only_days_before);
      return Number.isInteger(n) && n >= 0 ? n : 5;
    })(),
    autoReleaseSeats: map.auto_release_seats_on_expiry === "true",
    iban: map.payment_iban ?? null,
    beneficiary: map.payment_beneficiary ?? null,
    bank: map.payment_bank ?? null,
    officeAddress: map.office_address ?? null,
    officeOpeningHours: map.office_opening_hours ?? null,
    termsVersion: map.terms_policy_version || "1.0",
    privacyVersion: map.privacy_policy_version || "1.0",
    mediaVersion: map.media_policy_version || "1.0",
    adultMinAge: intOr(map.adult_min_age, 18),
  };
}

// ---------------------------------------------------------------------------
// Regole di disponibilità acconto / pagamento completo
// ---------------------------------------------------------------------------

function daysUntilDeparture(excursion: Excursion, now: Date): number {
  const departure = new Date(`${excursion.date}T00:00:00`);
  return Math.floor((departure.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

export function isDepositAvailable(
  excursion: Excursion,
  settings: PaymentSettings,
  now: Date = new Date(),
): boolean {
  if (!excursion.depositEnabled) return false;
  // Dopo la conferma l'acconto resta disponibile solo se configurato
  if (excursion.status === "confirmed" && !excursion.depositAvailableAfterConfirm) return false;
  // Data limite acconto della gita
  if (excursion.depositDeadlineDate && now > new Date(`${excursion.depositDeadlineDate}T23:59:59`)) {
    return false;
  }
  // Vicino alla partenza: solo pagamento completo
  const fullOnlyDays = excursion.fullPaymentOnlyDaysBefore ?? settings.fullOnlyDaysBefore;
  if (fullOnlyDays > 0 && daysUntilDeparture(excursion, now) < fullOnlyDays) return false;
  return true;
}

// Importo acconto per una prenotazione: fisso = euro a persona, percent = % del totale.
export function depositAmountCents(
  excursion: Excursion,
  settings: PaymentSettings,
  totalCents: number,
  seats: number,
): number {
  if (excursion.depositType === "fixed" && excursion.depositValue !== null) {
    const perPerson = eurosToCents(excursion.depositValue);
    return Math.min(perPerson * seats, totalCents);
  }
  const pct =
    excursion.depositValue !== null && Number(excursion.depositValue) > 0
      ? Number(excursion.depositValue)
      : settings.depositPercentage;
  if (!pct || pct <= 0) return totalCents;
  return Math.min(Math.round((totalCents * pct) / 100), totalCents);
}

// ---------------------------------------------------------------------------
// Scadenze: mai oltre partenza / chiusura prenotazioni / date limite gita
// ---------------------------------------------------------------------------

export function computePaymentDeadline(opts: {
  from: Date;
  hours: number;
  excursion: Excursion;
  // Data limite specifica (es. balanceDeadlineDate per il saldo)
  hardLimitDate?: string | null;
}): Date {
  const { from, hours, excursion, hardLimitDate } = opts;
  let deadline = new Date(from.getTime() + hours * 60 * 60 * 1000);

  const caps: Date[] = [new Date(`${excursion.date}T23:59:59`)];
  if (excursion.bookingCloseDate) caps.push(new Date(`${excursion.bookingCloseDate}T23:59:59`));
  if (hardLimitDate) caps.push(new Date(`${hardLimitDate}T23:59:59`));

  for (const cap of caps) {
    if (Number.isFinite(cap.getTime()) && cap < deadline) deadline = cap;
  }
  return deadline;
}

// ---------------------------------------------------------------------------
// Costruzione preventivo
// ---------------------------------------------------------------------------

const MAX_PARTICIPANTS_PER_BOOKING = 30;

export function buildQuote(
  ctx: PricingContext,
  input: QuoteInput,
  settings: PaymentSettings,
  now: Date = new Date(),
): Quote {
  const { excursion, isRident } = ctx;
  const participants = input.participants;

  if (!Array.isArray(participants) || participants.length === 0) {
    throw new QuoteError("Serve almeno un partecipante.");
  }
  if (participants.length > MAX_PARTICIPANTS_PER_BOOKING) {
    throw new QuoteError(`Massimo ${MAX_PARTICIPANTS_PER_BOOKING} partecipanti per prenotazione.`);
  }

  const pointById = new Map(ctx.pickupPoints.map((p) => [p.id, p]));
  const rangeById = new Map(ctx.ageRanges.map((r) => [r.id, r]));
  const adultPriceCents = eurosToCents(excursion.pricePerPerson);
  const hasPickupPoints = ctx.pickupPoints.length > 0;

  // Risolve+valida un punto di raccolta dal suo id.
  const resolvePoint = (rawId: string): PricingPickupPoint => {
    const pt = pointById.get(rawId);
    if (!pt) throw new QuoteError("Punto di raccolta non valido per questa gita.");
    if (!pt.active) throw new QuoteError("Uno dei punti di raccolta selezionati non è più disponibile.");
    return pt;
  };

  // Gite normali: "punti divisi" quando almeno un partecipante porta il proprio punto.
  // In tal caso ogni partecipante sceglie il suo (come le Rident); altrimenti vale
  // il punto unico della prenotazione (input.pickupPointId) per tutti.
  const perParticipantPickup = !isRident && participants.some((p) => !!p.pickupPointId);
  let bookingPoint: PricingPickupPoint | null = null;
  if (!isRident && hasPickupPoints && !perParticipantPickup) {
    if (!input.pickupPointId) {
      throw new QuoteError("Seleziona il punto di raccolta.");
    }
    bookingPoint = resolvePoint(input.pickupPointId);
  }

  const quoted: QuotedParticipant[] = participants.map((p, idx) => {
    let basePriceCents: number;
    let ageRangeId: string | null = null;
    let ageRangeLabel: string | null = null;

    if (isRident) {
      if (p.type !== "patient" && p.type !== "companion") {
        throw new QuoteError("Tipo partecipante non valido per una gita Rident.");
      }
      const configured = p.type === "patient" ? excursion.patientPrice : excursion.companionPrice;
      basePriceCents = configured !== null ? eurosToCents(configured) : adultPriceCents;
    } else {
      if (p.type === "adult") {
        basePriceCents = adultPriceCents;
      } else if (p.type === "child") {
        if (!p.ageRangeId) {
          throw new QuoteError(`Seleziona la fascia età per il bambino ${idx + 1}.`);
        }
        const range = rangeById.get(p.ageRangeId);
        if (!range) {
          throw new QuoteError("Fascia età non valida o non più attiva.");
        }
        ageRangeId = range.id;
        ageRangeLabel = range.label;
        basePriceCents = ctx.agePriceCents.get(range.id) ?? adultPriceCents;
      } else {
        throw new QuoteError("Tipo partecipante non valido per una gita normale.");
      }
    }

    // Punto di raccolta del partecipante:
    // - Rident o gite normali con "punti divisi": ognuno sceglie il suo (obbligatorio).
    // - Gite normali "tutti insieme": il punto unico della prenotazione.
    let point: PricingPickupPoint | null = bookingPoint;
    if (hasPickupPoints && (isRident || perParticipantPickup)) {
      if (!p.pickupPointId) {
        throw new QuoteError(`Seleziona il punto di raccolta per il partecipante ${idx + 1}.`);
      }
      point = resolvePoint(p.pickupPointId);
    }

    const pickupSurcharge = point?.surchargeCents ?? 0;
    return {
      type: p.type,
      ageRangeId,
      ageRangeLabel,
      pickupPointId: point?.id ?? null,
      pickupPointName: point?.name ?? null,
      basePriceCents,
      pickupSurchargeCents: pickupSurcharge,
      // Uno sconto sul punto non può portare il prezzo finale sotto zero.
      finalPriceCents: Math.max(0, basePriceCents + pickupSurcharge),
      sortOrder: idx,
    };
  });

  if (!isRident && !quoted.some((p) => p.type === "adult")) {
    throw new QuoteError("Almeno 1 adulto è obbligatorio.");
  }
  if (isRident && !quoted.some((p) => p.type === "patient")) {
    throw new QuoteError("Almeno 1 paziente è obbligatorio.");
  }

  const totalCents = quoted.reduce((sum, p) => sum + p.finalPriceCents, 0);
  const depositAllowed = isDepositAvailable(excursion, settings, now);
  const depositCents = depositAmountCents(excursion, settings, totalCents, quoted.length);

  let paymentType = input.paymentType;
  if (paymentType !== "deposit" && paymentType !== "full") {
    throw new QuoteError("Tipo di pagamento non valido.");
  }
  if (paymentType === "deposit" && !depositAllowed) {
    throw new QuoteError("L'acconto non è più disponibile per questa gita: è richiesto il pagamento completo.");
  }

  const amountDueCents = paymentType === "deposit" ? depositCents : totalCents;

  return {
    participants: quoted,
    totalCents,
    depositCents,
    amountDueCents,
    paymentType,
    depositAllowed,
    seats: quoted.length,
  };
}

// Metodi di pagamento disponibili per la gita (interseca config gita e globali).
export function availablePaymentMethods(
  excursion: Excursion,
  settings: PaymentSettings,
  stripeConfigured: boolean,
): { card: boolean; bankTransfer: boolean; office: boolean } {
  return {
    card: excursion.payCardEnabled && settings.cardPaymentsEnabled && stripeConfigured,
    bankTransfer: excursion.payBankTransferEnabled,
    office: excursion.payOfficeEnabled,
  };
}

// Codice prenotazione breve per causale bonifico ed email (es. "ET-7K4F9Q").
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // senza 0/O/1/I
export function generateBookingCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `ET-${code}`;
}
