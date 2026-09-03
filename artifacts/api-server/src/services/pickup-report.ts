export const MISSING_PARTICIPANT_DETAILS_WARNING =
  "Dettagli partecipanti mancanti o incompleti: verificare questa prenotazione attiva prima della partenza.";

export type PickupReportBookingSnapshot = {
  bookingId: string;
  bookingCode: string | null;
  customerName: string;
  phone: string | null;
  seats: number;
  servizioCasa: boolean;
  homePickupAddress: string | null;
};

export type MissingParticipantAnnotation = {
  referente: string;
  participantsDetailed: false;
  warning: string;
};

export type MissingParticipantDetails = PickupReportBookingSnapshot &
  MissingParticipantAnnotation;

export type PickupReportParticipantSnapshot = {
  bookingId: string;
  firstName: string | null;
  lastName: string | null;
  dataCompleted: boolean;
};

export function hasCompletePickupReportParticipant<
  T extends PickupReportParticipantSnapshot,
>(
  participant: T,
): participant is T & {
  firstName: string;
  lastName: string;
  dataCompleted: true;
} {
  return (
    participant.dataCompleted === true &&
    Boolean(participant.firstName?.trim()) &&
    Boolean(participant.lastName?.trim())
  );
}

/**
 * Evidenzia le prenotazioni che non possono essere rappresentate nei gruppi
 * operativi in modo completo: numero righe diverso dai posti oppure almeno
 * una riga anagrafica incompleta. Non genera persone o punti di raccolta
 * sintetici: conserva soltanto i dati reali del referente.
 */
export function buildMissingParticipantDetails<
  TBooking extends PickupReportBookingSnapshot,
>(
  activeBookings: readonly TBooking[],
  participants: readonly PickupReportParticipantSnapshot[],
): (TBooking & MissingParticipantAnnotation)[] {
  const detailsByBooking = new Map<
    string,
    { rows: number; incompleteRows: number }
  >();
  for (const participant of participants) {
    const details = detailsByBooking.get(participant.bookingId) ?? {
      rows: 0,
      incompleteRows: 0,
    };
    details.rows += 1;
    if (!hasCompletePickupReportParticipant(participant)) {
      details.incompleteRows += 1;
    }
    detailsByBooking.set(participant.bookingId, details);
  }

  return activeBookings.flatMap((booking) => {
    const details = detailsByBooking.get(booking.bookingId) ?? {
      rows: 0,
      incompleteRows: 0,
    };
    if (details.rows === booking.seats && details.incompleteRows === 0) {
      return [];
    }

    const reasons: string[] = [];
    if (details.rows !== booking.seats) {
      reasons.push(
        `Sono presenti ${details.rows} nominativi per ${booking.seats} posti.`,
      );
    }
    if (details.incompleteRows > 0) {
      reasons.push(
        `${details.incompleteRows} ${details.incompleteRows === 1 ? "riga ha" : "righe hanno"} nome, cognome o stato di completamento mancanti.`,
      );
    }

    return [
      {
        ...booking,
        referente: booking.customerName,
        participantsDetailed: false as const,
        warning: `${MISSING_PARTICIPANT_DETAILS_WARNING} ${reasons.join(" ")}`,
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// Incassi a bordo: chi sale con il saldo ancora da versare.
// ---------------------------------------------------------------------------

export type OnBusCollectionInput = {
  bookingId: string;
  bookingCode: string | null;
  referente: string;
  phone: string | null;
  seats: number;
  requestAmountCents: number;
  totalAmountCents: number | null;
  amountPaidCents: number;
};

export type OnBusCollection = {
  bookingId: string;
  bookingCode: string | null;
  referente: string;
  phone: string | null;
  seats: number;
  amountCents: number;
};

/**
 * L'importo da chiedere a bordo e il residuo effettivo, non quello congelato
 * nella richiesta: un versamento parziale arrivato nel frattempo deve ridurre
 * quanto l'accompagnatore incassa alla partenza.
 */
export function onBusCollectionAmountCents(input: {
  requestAmountCents: number;
  totalAmountCents: number | null;
  amountPaidCents: number;
}): number {
  const residual =
    input.totalAmountCents === null
      ? input.requestAmountCents
      : input.totalAmountCents - input.amountPaidCents;
  return Math.max(Math.min(input.requestAmountCents, residual), 0);
}

export function buildOnBusCollections(rows: readonly OnBusCollectionInput[]): {
  collections: OnBusCollection[];
  totalCents: number;
} {
  const collections = rows.flatMap((row) => {
    const amountCents = onBusCollectionAmountCents(row);
    if (amountCents <= 0) return [];
    return [
      {
        bookingId: row.bookingId,
        bookingCode: row.bookingCode,
        referente: row.referente,
        phone: row.phone,
        seats: row.seats,
        amountCents,
      },
    ];
  });
  return {
    collections,
    totalCents: collections.reduce((sum, item) => sum + item.amountCents, 0),
  };
}

// ---------------------------------------------------------------------------
// Stato economico riportato accanto a ogni persona del report.
// ---------------------------------------------------------------------------

export type PickupReportPaymentInput = {
  paymentStatus: string;
  paymentMethod: string | null;
  totalAmountCents: number | null;
  amountPaidCents: number;
  // Quota che l'accompagnatore incassa alla partenza (0 se non prevista).
  onBusCents: number;
};

export type PickupReportPayment = {
  // "paid": non deve nulla · "due_on_bus": si incassa alla partenza ·
  // "due": deve saldare altrove · "unknown": importi non registrati
  state: "paid" | "due_on_bus" | "due" | "unknown";
  // Residuo dell'intera prenotazione, non della singola persona.
  dueCents: number;
  onBusCents: number;
  totalCents: number | null;
  paidCents: number;
  method: string | null;
};

/**
 * Traduce gli importi della prenotazione nella riga che l'accompagnatore legge
 * a bordo. Il residuo resta quello della prenotazione (il denaro si incassa dal
 * referente, non dal singolo passeggero) e non viene mai reso negativo.
 */
export function buildPickupReportPayment(
  input: PickupReportPaymentInput,
): PickupReportPayment {
  const paidCents = Math.max(input.amountPaidCents, 0);
  const totalCents = input.totalAmountCents;
  const residualCents =
    totalCents === null ? null : Math.max(totalCents - paidCents, 0);
  const onBusCents = Math.max(input.onBusCents, 0);

  // Senza totale registrato non si puo dedurre un residuo: si dichiara solo
  // cio che e certo, altrimenti a bordo si chiederebbero soldi inventati.
  if (residualCents === null) {
    const state = input.paymentStatus === "paid" ? "paid" : "unknown";
    return {
      state: onBusCents > 0 ? "due_on_bus" : state,
      dueCents: onBusCents,
      onBusCents,
      totalCents,
      paidCents,
      method: input.paymentMethod,
    };
  }

  const state =
    onBusCents > 0 ? "due_on_bus" : residualCents > 0 ? "due" : "paid";
  return {
    state,
    dueCents: residualCents,
    onBusCents,
    totalCents,
    paidCents,
    method: input.paymentMethod,
  };
}
