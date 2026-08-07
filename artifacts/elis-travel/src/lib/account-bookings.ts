export type PendingAction =
  | { kind: "payment_due"; amountCents: number; deadline: string | null }
  | { kind: "cancellation_pending" };

export type AccountBooking = {
  bookingId: string;
  bookingCode: string | null;
  excursionName: string;
  location: string;
  departureAt: string | null;
  date: string;
  seats: number;
  totalAmountCents: number;
  amountPaidCents: number;
  residualCents: number;
  paymentStatus: string;
  seatStatus: string;
  cancelledAt: string | null;
  cancellationRequestStatus: string | null;
  pendingAction: PendingAction | null;
};

export function euro(cents: number): string {
  return (cents / 100).toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
  });
}

/**
 * Data di partenza leggibile. Con `departureAt` si mostra anche l'ora, che e
 * l'informazione che il cliente cerca la sera prima; senza, solo il giorno.
 */
export function formatDeparture(booking: {
  departureAt: string | null;
  date: string;
}): string {
  if (booking.departureAt) {
    return new Date(booking.departureAt).toLocaleString("it-IT", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  const d = new Date(`${booking.date}T12:00:00`);
  return d.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Giorni che mancano alla partenza, arrotondati al giorno di calendario.
 *
 * Il confronto e fra mezzogiorni e non fra istanti: altrimenti una partenza
 * domani alle 6 del mattino, vista stasera alle 22, risulterebbe "fra 0
 * giorni" invece che "domani".
 */
export function daysUntil(
  booking: { departureAt: string | null; date: string },
  now: Date = new Date(),
): number {
  const target = booking.departureAt
    ? new Date(booking.departureAt)
    : new Date(`${booking.date}T12:00:00`);
  const a = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

export function countdownLabel(days: number): string {
  if (days < 0) return "";
  if (days === 0) return "oggi";
  if (days === 1) return "domani";
  return `fra ${days} giorni`;
}

/** Etichetta della scadenza di pagamento, o null se non ce n'e una aperta. */
export function pendingActionLabel(
  booking: AccountBooking,
): { text: string; urgent: boolean } | null {
  const action = booking.pendingAction;
  if (!action) return null;

  if (action.kind === "cancellation_pending") {
    return {
      text: "Richiesta di annullamento in esame",
      urgent: false,
    };
  }

  if (!action.deadline) {
    return { text: `Da pagare: ${euro(action.amountCents)}`, urgent: false };
  }

  const scadenza = new Date(action.deadline);
  const giorni = Math.ceil((scadenza.getTime() - Date.now()) / 86400000);
  const quando =
    giorni < 0
      ? "scaduta"
      : giorni === 0
        ? "entro oggi"
        : giorni === 1
          ? "entro domani"
          : `entro il ${scadenza.toLocaleDateString("it-IT", { day: "numeric", month: "long" })}`;

  return {
    text: `Da pagare ${euro(action.amountCents)} ${quando}`,
    // Sotto i tre giorni l'avviso diventa rosso: e il momento in cui il posto
    // rischia davvero di essere rilasciato.
    urgent: giorni <= 3,
  };
}
