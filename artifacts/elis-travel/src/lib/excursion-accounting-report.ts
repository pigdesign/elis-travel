// Calcoli del prospetto incassi di una gita.
//
// Stanno qui e non dentro la pagina per la stessa ragione per cui ci sta
// pickup-report: su questo foglio si leggono soldi, e un errore silenzioso non
// produce una tabella storta ma telefonate a chi ha gia pagato. Separati, si
// possono provare senza montare mezzo pannello.
//
// Il prospetto risponde a una domanda sola — quanto ho incassato, quanto
// manca, da chi, entro quando — e deliberatamente NON ripete nulla del foglio
// di raccolta, che serve a bordo. In particolare la spunta di presenza resta
// solo li: se comparisse su due fogli, le presenze segnate su quello sbagliato
// andrebbero perse, perche nessuno le riporta.

export type AccountingBookingInput = {
  customerName: string;
  phone?: string | null;
  adults: number;
  children: number;
  bookingCode?: string | null;
  totalAmountCents?: number | null;
  amountPaidCents?: number | null;
  paymentMethod?: string | null;
  paymentDeadline?: string | null;
  paymentStatus: string;
  cancelledAt?: string | null;
};

export type AccountingRow = {
  bookingCode: string;
  name: string;
  phone: string;
  adults: number;
  children: number;
  /** Null quando l'importo non e mai stato calcolato: e un buco, non uno zero. */
  totalCents: number | null;
  paidCents: number;
  residualCents: number | null;
  method: string;
  deadline: string | null;
  overdue: boolean;
  statusLabel: string;
};

export type AccountingSummary = {
  totalCents: number;
  collectedCents: number;
  residualCents: number;
  /** Residuo per metodo, solo per chi deve ancora dare qualcosa. */
  residualByMethod: Record<string, number>;
  rowsWithoutTotal: number;
};

export type CancelledWithMoneyRow = {
  bookingCode: string;
  name: string;
  phone: string;
  paidCents: number;
  cancelledAt: string | null;
  statusLabel: string;
};

function residualOf(
  totalCents: number | null,
  paidCents: number,
): number | null {
  if (totalCents === null) return null;
  // Mai negativo: un incasso superiore al totale e un caso da rimborso, non un
  // residuo "meno cento" che falserebbe la somma della colonna.
  return Math.max(0, totalCents - paidCents);
}

export function buildAccountingRows(
  bookings: readonly AccountingBookingInput[],
  options: { now: number; statusLabel: (status: string) => string },
): AccountingRow[] {
  return bookings
    .map((b) => {
      const totalCents = b.totalAmountCents ?? null;
      const paidCents = b.amountPaidCents ?? 0;
      const residualCents = residualOf(totalCents, paidCents);
      const deadline = b.paymentDeadline ?? null;
      return {
        bookingCode: b.bookingCode ?? "",
        name: b.customerName,
        phone: b.phone ?? "",
        adults: b.adults,
        children: b.children,
        totalCents,
        paidCents,
        residualCents,
        method: b.paymentMethod ?? "",
        deadline,
        // Scaduta solo se c'e ancora qualcosa da incassare: una scadenza
        // passata su una prenotazione saldata non e un problema di nessuno.
        overdue:
          deadline !== null &&
          (residualCents ?? 0) > 0 &&
          new Date(deadline).getTime() < options.now,
        statusLabel: options.statusLabel(b.paymentStatus),
      };
    })
    // Prima chi deve ancora dare qualcosa, con le scadenze piu vecchie in
    // cima: e l'ordine in cui si fanno le telefonate.
    .sort((a, b) => {
      const aDebito = (a.residualCents ?? 0) > 0;
      const bDebito = (b.residualCents ?? 0) > 0;
      if (aDebito !== bDebito) return aDebito ? -1 : 1;
      if (aDebito && bDebito) {
        const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
        const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
        if (da !== db) return da - db;
      }
      return a.name.localeCompare(b.name, "it");
    });
}

export function summarizeAccounting(
  rows: readonly AccountingRow[],
): AccountingSummary {
  const residualByMethod: Record<string, number> = {};
  let totalCents = 0;
  let collectedCents = 0;
  let residualCents = 0;
  let rowsWithoutTotal = 0;

  for (const row of rows) {
    // Una riga senza totale non entra nelle somme: sommarla come zero
    // direbbe che non manca nulla proprio dove il dato manca.
    if (row.totalCents === null) rowsWithoutTotal += 1;
    else totalCents += row.totalCents;

    collectedCents += row.paidCents;

    const residuo = row.residualCents ?? 0;
    if (residuo > 0) {
      residualCents += residuo;
      const key = row.method || "non indicato";
      residualByMethod[key] = (residualByMethod[key] ?? 0) + residuo;
    }
  }

  return {
    totalCents,
    collectedCents,
    residualCents,
    residualByMethod,
    rowsWithoutTotal,
  };
}

/**
 * Prenotazioni annullate su cui il cliente ha gia versato qualcosa.
 *
 * E la cosa che si dimentica: spariscono dagli elenchi ordinari proprio
 * perche annullate, ma il denaro resta da restituire.
 */
export function buildCancelledWithMoney(
  bookings: readonly AccountingBookingInput[],
  options: { statusLabel: (status: string) => string },
): CancelledWithMoneyRow[] {
  return bookings
    .filter((b) => (b.amountPaidCents ?? 0) > 0)
    .map((b) => ({
      bookingCode: b.bookingCode ?? "",
      name: b.customerName,
      phone: b.phone ?? "",
      paidCents: b.amountPaidCents ?? 0,
      cancelledAt: b.cancelledAt ?? null,
      statusLabel: options.statusLabel(b.paymentStatus),
    }))
    .sort((a, b) => b.paidCents - a.paidCents);
}
