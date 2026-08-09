/**
 * Conto economico di una gita.
 *
 * I ricavi NON sono `prezzo base × posti occupati`: il prezzo davvero pagato da
 * un partecipante dipende dalla fascia età, dal tipo Rident (paziente /
 * accompagnatore) e dalla variazione di prezzo della provincia, tutte cose che
 * `buildQuote` mette già dentro lo snapshot `totalAmountCents` della
 * prenotazione. Qui si sommano quegli snapshot.
 */

export type ExcursionRevenue = {
  /** Somma degli snapshot `totalAmountCents` delle prenotazioni che occupano un posto. */
  totalCents: number;
  /**
   * Posti delle prenotazioni precedenti a Gite v2, che non hanno lo snapshot:
   * si valorizzano al prezzo base, l'unica cosa che si sa di loro.
   */
  legacySeats: number;
};

export type ExcursionFinancialInput = {
  pricePerPerson: string | null;
  mealCostPerPerson: string | null;
  entranceCostPerPerson: string | null;
  extraCostPerPerson: string | null;
  vehicleFixedCost: string | null;
  otherCostsTotal: string | null;
  adherentsCount: number;
};

export type ExcursionFinancials = {
  ricaviStimati: number;
  costiVariabili: number;
  costiTotali: number;
  margineNetto: number;
};

export function calcFinancials(
  e: ExcursionFinancialInput,
  revenue: ExcursionRevenue,
): ExcursionFinancials {
  const price = parseFloat(e.pricePerPerson ?? "0");
  const meal = parseFloat(e.mealCostPerPerson ?? "0");
  const entrance = parseFloat(e.entranceCostPerPerson ?? "0");
  const extra = parseFloat(e.extraCostPerPerson ?? "0");
  const vehicleCost = parseFloat(e.vehicleFixedCost ?? "0");
  // Altri costi: fissi a carico dell'agenzia, sottratti UNA sola volta (NON per persona).
  const otherCosts = parseFloat(e.otherCostsTotal ?? "0");
  // I costi per persona restano legati ai posti occupati: pasto e ingresso li
  // consuma anche chi paga meno (bambini) o di più (supplemento provincia).
  const count = e.adherentsCount;

  const ricaviStimati = revenue.totalCents / 100 + price * revenue.legacySeats;
  const costiVariabili = (meal + entrance + extra) * count;
  const costiTotali = costiVariabili + vehicleCost + otherCosts;
  const margineNetto = ricaviStimati - costiTotali;

  return { ricaviStimati, costiVariabili, costiTotali, margineNetto };
}
