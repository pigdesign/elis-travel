import { createHash } from "node:crypto";
import {
  normalizeBookingParticipantIdentities,
  type ParticipantIdentityInput,
} from "./participant-details";

export const MAX_MANUAL_BOOKING_PARTICIPANTS = 100;

export type ManualParticipantType = "adult" | "child" | "patient" | "companion";

export type ManualParticipantInput = ParticipantIdentityInput & {
  type?: unknown;
  ageRangeId?: unknown;
  pickupPointId?: unknown;
};

export type NormalizedManualParticipant = {
  type: ManualParticipantType;
  firstName: string;
  lastName: string;
  ageRangeId: string | null;
  ageRangeLabel: string | null;
  pickupPointId: string | null;
  pickupPointName: string | null;
  sortOrder: number;
};

export type NormalizedManualBookingParticipants = {
  participants: NormalizedManualParticipant[];
  seats: number;
  adults: number;
  children: number;
};

export type ExistingParticipantDetails = {
  participantType: string;
  ageRangeId: string | null;
  ageRangeLabel: string | null;
  pickupPointId: string | null;
  pickupPointName: string | null;
  firstName: string | null;
  lastName: string | null;
  dataCompleted: boolean;
  sortOrder: number;
};

export function manualParticipantDetailsAreUnchanged(
  existing: ExistingParticipantDetails[],
  normalized: NormalizedManualParticipant[],
): boolean {
  return (
    existing.length === normalized.length &&
    existing.every((participant, index) => {
      const expected = normalized[index];
      return (
        expected !== undefined &&
        participant.participantType === expected.type &&
        participant.ageRangeId === expected.ageRangeId &&
        participant.ageRangeLabel === expected.ageRangeLabel &&
        participant.pickupPointId === expected.pickupPointId &&
        participant.pickupPointName === expected.pickupPointName &&
        participant.firstName === expected.firstName &&
        participant.lastName === expected.lastName &&
        participant.dataCompleted === true &&
        participant.sortOrder === expected.sortOrder
      );
    })
  );
}

export class ManualBookingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualBookingValidationError";
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MANUAL_BOOKING_COMMAND_PREFIX = "admin:";
const MANUAL_BOOKING_FINGERPRINT_PREFIX = "admin-manual-booking:";

export function normalizeManualBookingClientCommandId(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) {
    throw new ManualBookingValidationError(
      "clientCommandId deve essere un UUID valido e stabile per il comando.",
    );
  }
  return `${MANUAL_BOOKING_COMMAND_PREFIX}${value.trim().toLowerCase()}`;
}

export function normalizeManualCustomerNotifications(
  value: unknown,
  email: string | null,
): boolean {
  const enabled = value === true;
  if (enabled && !email) {
    throw new ManualBookingValidationError(
      "Inserisci l'indirizzo email oppure disattiva l'invio automatico al cliente.",
    );
  }
  return enabled;
}

export type ManualBookingCommandFingerprintInput = {
  excursionId: string;
  customerName: string;
  customerId: string | null;
  email: string | null;
  phone: string | null;
  customerNotificationsEnabled: boolean;
  participants: NormalizedManualParticipant[];
  financial: NormalizedManualBookingFinancials;
  servizioCasa: boolean;
  homePickupAddress: string | null;
};

export function manualBookingCommandFingerprint(
  input: ManualBookingCommandFingerprintInput,
): string {
  const canonical = {
    excursionId: input.excursionId,
    customerName: input.customerName,
    customerId: input.customerId,
    email: input.email,
    phone: input.phone,
    customerNotificationsEnabled: input.customerNotificationsEnabled,
    participants: input.participants.map((participant) => ({
      type: participant.type,
      firstName: participant.firstName,
      lastName: participant.lastName,
      ageRangeId: participant.ageRangeId,
      pickupPointId: participant.pickupPointId,
      sortOrder: participant.sortOrder,
    })),
    paymentStatus: input.financial.paymentStatus,
    paymentType: input.financial.paymentType,
    paymentMethod: input.financial.paymentMethod,
    totalAmountCents: input.financial.totalAmountCents,
    requestAmountCents: input.financial.requestAmountCents,
    paymentDeadline: input.financial.paymentDeadline?.toISOString() ?? null,
    transactionReference: input.financial.transactionReference,
    servizioCasa: input.servizioCasa,
    homePickupAddress: input.homePickupAddress,
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function manualBookingCommandNote(fingerprint: string): string {
  return `${MANUAL_BOOKING_FINGERPRINT_PREFIX}${fingerprint}`;
}

export type ManualParticipantAssignmentContext = {
  activePickupPoints?: ReadonlyMap<string, string>;
  activeAgeRanges?: ReadonlyMap<string, string>;
  standardPickupPointId?: unknown;
};

export type ManualBookingFinancialInput = {
  paymentStatus?: unknown;
  totalAmountCents?: unknown;
  paymentAmountCents?: unknown;
  paymentMethod?: unknown;
  paymentDeadline?: unknown;
  transactionReference?: unknown;
};

export type NormalizedManualBookingFinancials = {
  paymentStatus: "deposit_requested" | "full_requested" | "deposit" | "paid";
  paymentType: "deposit" | "full";
  paymentMethod: "bank_transfer" | "office" | null;
  totalAmountCents: number;
  requestAmountCents: number;
  amountPaidCents: number;
  amountDueCents: number;
  paymentDeadline: Date | null;
  graceUntil: Date | null;
  transactionReference: string | null;
  requestStatus: "pending" | "paid";
  paidAt: Date | null;
  seatStatus: "held" | "confirmed";
  seatHoldExpiresAt: Date | null;
  depositsDelta: number;
  balancesDelta: number;
};

export function isManuallyBookableExcursionStatus(status: string): boolean {
  return status === "open" || status === "confirmed";
}

export function manualBookingAccounting(
  paymentStatus: string,
  seats: number,
): {
  seatStatus: "held" | "confirmed";
  depositsDelta: number;
  balancesDelta: number;
} {
  const normalizedSeats = Number.isFinite(seats)
    ? Math.max(0, Math.trunc(seats))
    : 0;
  return {
    seatStatus:
      paymentStatus === "deposit" || paymentStatus === "paid"
        ? "confirmed"
        : "held",
    depositsDelta: paymentStatus === "deposit" ? normalizedSeats : 0,
    balancesDelta: paymentStatus === "paid" ? normalizedSeats : 0,
  };
}

function optionalIdentifier(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !value.trim()) {
    throw new ManualBookingValidationError(`${label} non valido.`);
  }
  return value.trim();
}

function positiveSafeInteger(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ManualBookingValidationError(`${label} non valido.`);
  }
  return parsed;
}

function nonNegativeSafeInteger(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new ManualBookingValidationError(`${label} non valido.`);
  }
  return parsed;
}

export function normalizeManualBookingFinancials(
  raw: ManualBookingFinancialInput,
  context: {
    excursionStatus: string;
    departureAt: Date;
    graceMinutes: number;
    now?: Date;
    seats: number;
  },
): NormalizedManualBookingFinancials {
  const allowedStatuses = new Set([
    "deposit_requested",
    "full_requested",
    "deposit",
    "paid",
  ]);
  if (
    typeof raw.paymentStatus !== "string" ||
    !allowedStatuses.has(raw.paymentStatus)
  ) {
    throw new ManualBookingValidationError(
      "Seleziona una richiesta o un pagamento amministrativo valido.",
    );
  }
  const paymentStatus = raw.paymentStatus as
    | "deposit_requested"
    | "full_requested"
    | "deposit"
    | "paid";
  if (
    context.excursionStatus === "confirmed" &&
    (paymentStatus === "deposit_requested" || paymentStatus === "deposit")
  ) {
    throw new ManualBookingValidationError(
      "Per una gita già confermata la prenotazione manuale deve richiedere o registrare il totale.",
    );
  }

  const totalAmountCents = nonNegativeSafeInteger(
    raw.totalAmountCents,
    "Importo totale",
  );
  const now = context.now ?? new Date();
  if (totalAmountCents === 0) {
    if (
      paymentStatus !== "paid" ||
      nonNegativeSafeInteger(
        raw.paymentAmountCents,
        "Importo della richiesta",
      ) !== 0
    ) {
      throw new ManualBookingValidationError(
        "Una prenotazione gratuita deve essere registrata come saldata con importo richiesto pari a zero.",
      );
    }
    if (
      raw.paymentMethod !== undefined &&
      raw.paymentMethod !== null &&
      raw.paymentMethod !== ""
    ) {
      throw new ManualBookingValidationError(
        "Una prenotazione gratuita non deve avere un metodo di pagamento.",
      );
    }
    const accounting = manualBookingAccounting("paid", context.seats);
    return {
      paymentStatus: "paid",
      paymentType: "full",
      paymentMethod: null,
      totalAmountCents: 0,
      requestAmountCents: 0,
      amountPaidCents: 0,
      amountDueCents: 0,
      paymentDeadline: null,
      graceUntil: null,
      transactionReference: null,
      requestStatus: "paid",
      paidAt: now,
      seatStatus: accounting.seatStatus,
      seatHoldExpiresAt: null,
      depositsDelta: 0,
      balancesDelta: accounting.balancesDelta,
    };
  }

  if (raw.paymentMethod !== "bank_transfer" && raw.paymentMethod !== "office") {
    throw new ManualBookingValidationError(
      "Le prenotazioni manuali accettano soltanto bonifico o pagamento in ufficio.",
    );
  }
  const paymentMethod = raw.paymentMethod;
  const requestAmountCents = positiveSafeInteger(
    raw.paymentAmountCents,
    "Importo della richiesta",
  );
  const isDeposit =
    paymentStatus === "deposit_requested" || paymentStatus === "deposit";
  if (isDeposit && requestAmountCents >= totalAmountCents) {
    throw new ManualBookingValidationError(
      "L'acconto deve essere inferiore al totale della prenotazione.",
    );
  }
  if (!isDeposit && requestAmountCents !== totalAmountCents) {
    throw new ManualBookingValidationError(
      "Per il pagamento totale l'importo richiesto deve coincidere con il totale.",
    );
  }

  const isPaid = paymentStatus === "deposit" || paymentStatus === "paid";
  const transactionReference =
    typeof raw.transactionReference === "string"
      ? raw.transactionReference.trim().slice(0, 500)
      : "";
  if (isPaid && !transactionReference) {
    throw new ManualBookingValidationError(
      "Inserisci il riferimento del bonifico o dell'incasso in ufficio.",
    );
  }

  let paymentDeadline: Date | null = null;
  let graceUntil: Date | null = null;
  if (!isPaid) {
    paymentDeadline =
      typeof raw.paymentDeadline === "string"
        ? new Date(raw.paymentDeadline)
        : null;
    if (!paymentDeadline || !Number.isFinite(paymentDeadline.getTime())) {
      throw new ManualBookingValidationError(
        "Inserisci una scadenza valida per la richiesta di pagamento.",
      );
    }
    if (paymentDeadline <= now) {
      throw new ManualBookingValidationError(
        "La scadenza della richiesta deve essere futura.",
      );
    }
    if (paymentDeadline >= context.departureAt) {
      throw new ManualBookingValidationError(
        "La scadenza della richiesta deve precedere la partenza.",
      );
    }
    graceUntil = new Date(
      Math.min(
        paymentDeadline.getTime() + Math.max(0, context.graceMinutes) * 60_000,
        context.departureAt.getTime(),
      ),
    );
  }

  const accounting = manualBookingAccounting(paymentStatus, context.seats);
  return {
    paymentStatus,
    paymentType: isDeposit ? "deposit" : "full",
    paymentMethod,
    totalAmountCents,
    requestAmountCents,
    amountPaidCents: isPaid ? requestAmountCents : 0,
    amountDueCents: isPaid ? 0 : requestAmountCents,
    paymentDeadline,
    graceUntil,
    transactionReference: isPaid ? transactionReference : null,
    requestStatus: isPaid ? "paid" : "pending",
    paidAt: isPaid ? now : null,
    seatStatus: accounting.seatStatus,
    seatHoldExpiresAt: isPaid ? null : graceUntil,
    depositsDelta: accounting.depositsDelta,
    balancesDelta: accounting.balancesDelta,
  };
}

export function normalizeManualBookingParticipants(
  rawParticipants: unknown,
  isRident: boolean,
  assignmentContext: ManualParticipantAssignmentContext = {},
): NormalizedManualBookingParticipants {
  if (!Array.isArray(rawParticipants) || rawParticipants.length === 0) {
    throw new ManualBookingValidationError(
      "Inserisci almeno un partecipante con nome e cognome.",
    );
  }
  if (rawParticipants.length > MAX_MANUAL_BOOKING_PARTICIPANTS) {
    throw new ManualBookingValidationError(
      `Massimo ${MAX_MANUAL_BOOKING_PARTICIPANTS} partecipanti per prenotazione manuale.`,
    );
  }

  const identities = normalizeBookingParticipantIdentities(rawParticipants);
  const allowedTypes = isRident
    ? new Set<ManualParticipantType>(["patient", "companion"])
    : new Set<ManualParticipantType>(["adult", "child"]);
  const activePickupPoints =
    assignmentContext.activePickupPoints ?? new Map<string, string>();
  const activeAgeRanges =
    assignmentContext.activeAgeRanges ?? new Map<string, string>();
  const standardPickupPointId = optionalIdentifier(
    assignmentContext.standardPickupPointId,
    "Punto di raccolta comune",
  );
  if (isRident && standardPickupPointId) {
    throw new ManualBookingValidationError(
      "Per RIDENT il punto di raccolta va scelto per ciascun partecipante.",
    );
  }
  if (!isRident && activePickupPoints.size > 0 && !standardPickupPointId) {
    throw new ManualBookingValidationError(
      "Seleziona il punto di raccolta comune della prenotazione.",
    );
  }
  if (
    !isRident &&
    standardPickupPointId &&
    !activePickupPoints.has(standardPickupPointId)
  ) {
    throw new ManualBookingValidationError(
      "Il punto di raccolta non è attivo o non appartiene alla gita.",
    );
  }

  const participants = rawParticipants.map((raw, index) => {
    const type =
      raw && typeof raw === "object"
        ? (raw as ManualParticipantInput).type
        : null;
    if (
      typeof type !== "string" ||
      !allowedTypes.has(type as ManualParticipantType)
    ) {
      throw new ManualBookingValidationError(
        isRident
          ? "Per una gita RIDENT sono ammessi soltanto pazienti e accompagnatori."
          : "Per una gita standard sono ammessi soltanto adulti e bambini.",
      );
    }
    const identity = identities[index];
    if (!identity) {
      throw new ManualBookingValidationError(
        "I dati dei partecipanti non sono coerenti.",
      );
    }
    const participantInput = raw as ManualParticipantInput;
    const rawPickupPointId = optionalIdentifier(
      participantInput.pickupPointId,
      `Punto di raccolta del partecipante ${index + 1}`,
    );
    const pickupPointId = isRident ? rawPickupPointId : standardPickupPointId;
    if (isRident && activePickupPoints.size > 0 && !pickupPointId) {
      throw new ManualBookingValidationError(
        `Seleziona il punto di raccolta del partecipante ${index + 1}.`,
      );
    }
    if (pickupPointId && !activePickupPoints.has(pickupPointId)) {
      throw new ManualBookingValidationError(
        `Il punto di raccolta del partecipante ${index + 1} non è attivo o non appartiene alla gita.`,
      );
    }
    if (
      !isRident &&
      rawPickupPointId &&
      rawPickupPointId !== standardPickupPointId
    ) {
      throw new ManualBookingValidationError(
        "Per una gita standard tutti i partecipanti devono usare il punto comune.",
      );
    }

    const rawAgeRangeId = optionalIdentifier(
      participantInput.ageRangeId,
      `Fascia età del partecipante ${index + 1}`,
    );
    const isChild = type === "child";
    if (isChild && activeAgeRanges.size > 0 && !rawAgeRangeId) {
      throw new ManualBookingValidationError(
        `Seleziona la fascia età del bambino ${index + 1}.`,
      );
    }
    if (rawAgeRangeId && (!isChild || !activeAgeRanges.has(rawAgeRangeId))) {
      throw new ManualBookingValidationError(
        `La fascia età del partecipante ${index + 1} non è attiva o non è applicabile.`,
      );
    }

    return {
      type: type as ManualParticipantType,
      firstName: identity.firstName,
      lastName: identity.lastName,
      ageRangeId: rawAgeRangeId,
      ageRangeLabel: rawAgeRangeId
        ? (activeAgeRanges.get(rawAgeRangeId) ?? null)
        : null,
      pickupPointId,
      pickupPointName: pickupPointId
        ? (activePickupPoints.get(pickupPointId) ?? null)
        : null,
      sortOrder: index,
    };
  });

  if (
    isRident &&
    !participants.some((participant) => participant.type === "patient")
  ) {
    throw new ManualBookingValidationError(
      "Serve almeno un paziente per una prenotazione RIDENT.",
    );
  }
  if (
    !isRident &&
    !participants.some((participant) => participant.type === "adult")
  ) {
    throw new ManualBookingValidationError(
      "Serve almeno un adulto per una prenotazione standard.",
    );
  }

  return {
    participants,
    seats: participants.length,
    adults: participants.filter((participant) => participant.type !== "child")
      .length,
    children: participants.filter((participant) => participant.type === "child")
      .length,
  };
}
