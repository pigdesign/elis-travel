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

export type MissingParticipantDetails = PickupReportBookingSnapshot & {
  referente: string;
  participantsDetailed: false;
  warning: string;
};

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
export function buildMissingParticipantDetails(
  activeBookings: readonly PickupReportBookingSnapshot[],
  participants: readonly PickupReportParticipantSnapshot[],
): MissingParticipantDetails[] {
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
