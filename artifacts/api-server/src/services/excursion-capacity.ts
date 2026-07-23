export type ExcursionCapacityDecision = {
  allowed: boolean;
  capacity: number;
  occupiedSeats: number;
  additionalSeats: number;
  requiredSeats: number;
  remainingSeats: number | null;
};

function nonNegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

/**
 * Fonte pura per i guard di creazione prenotazione e cambio capienza.
 * Nel modello esistente currentCapacity=0 significa capienza non limitata.
 */
export function decideExcursionCapacity(input: {
  capacity: number;
  occupiedSeats: number;
  additionalSeats?: number;
}): ExcursionCapacityDecision {
  const capacity = nonNegativeInteger(input.capacity);
  const occupiedSeats = nonNegativeInteger(input.occupiedSeats);
  const additionalSeats = nonNegativeInteger(input.additionalSeats ?? 0);
  const requiredSeats = occupiedSeats + additionalSeats;
  const unlimited = capacity === 0;

  return {
    allowed: unlimited || requiredSeats <= capacity,
    capacity,
    occupiedSeats,
    additionalSeats,
    requiredSeats,
    remainingSeats: unlimited ? null : Math.max(0, capacity - occupiedSeats),
  };
}

/** Conserva il lato più prudente se il contatore denormalizzato è fuori sync. */
export function authoritativeOccupiedSeats(
  activeBookingSeats: number,
  adherentsCounter: number,
): number {
  return Math.max(
    nonNegativeInteger(activeBookingSeats),
    nonNegativeInteger(adherentsCounter),
  );
}
