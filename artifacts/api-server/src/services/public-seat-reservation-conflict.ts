export type PublicSeatReservationSnapshot = {
  status: string;
  departureAt: Date | null;
  currentCapacity: number | null;
  adherentsCount: number | null;
  rowVersion: string;
};

export type PublicSeatReservationUpdateMiss =
  | { kind: "notfound" }
  | { kind: "closed" }
  | { kind: "departed" }
  | { kind: "changed" }
  | { kind: "full"; remaining: number };

/**
 * Classifica un UPDATE ottimistico che non ha modificato righe.
 *
 * `full` e riservato al caso in cui la versione letta per il preventivo e
 * ancora quella corrente e l'unica guardia fallita e la capienza. Se la riga
 * e cambiata, il client deve invece ricalcolare disponibilita e prezzo.
 */
export function classifyPublicSeatReservationUpdateMiss(input: {
  current: PublicSeatReservationSnapshot | null;
  expectedStatus: string;
  expectedRowVersion: string;
  requestedSeats: number;
  now: Date;
}): PublicSeatReservationUpdateMiss {
  const { current } = input;
  if (!current) return { kind: "notfound" };
  if (["completed", "cancelled", "archived"].includes(current.status)) {
    return { kind: "closed" };
  }
  if (!current.departureAt || current.departureAt <= input.now) {
    return { kind: "departed" };
  }
  if (
    current.status !== input.expectedStatus ||
    current.rowVersion !== input.expectedRowVersion
  ) {
    return { kind: "changed" };
  }

  const capacity = Math.max(0, current.currentCapacity ?? 0);
  const occupied = Math.max(0, current.adherentsCount ?? 0);
  // Zero mantiene la semantica esistente di capienza illimitata.
  if (capacity > 0 && occupied + input.requestedSeats > capacity) {
    return {
      kind: "full",
      remaining: Math.max(0, capacity - occupied),
    };
  }

  // Tutte le guardie note risultano valide: trattiamo il miss inatteso come
  // conflitto, senza inventare un falso messaggio di posti esauriti.
  return { kind: "changed" };
}
