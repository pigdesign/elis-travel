export const HOME_PICKUP_ADDRESS_MAX_LENGTH = 500;

export class HomePickupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HomePickupValidationError";
  }
}

export function normalizeHomePickupRequest(
  input: {
    servizioCasa?: unknown;
    homePickupAddress?: unknown;
  },
  context: { available: boolean },
): { servizioCasa: boolean; homePickupAddress: string | null } {
  const servizioCasa = input.servizioCasa === true;
  if (!servizioCasa) {
    return { servizioCasa: false, homePickupAddress: null };
  }
  if (!context.available) {
    throw new HomePickupValidationError(
      "Il servizio sotto casa non è disponibile per questa gita.",
    );
  }
  if (typeof input.homePickupAddress !== "string") {
    throw new HomePickupValidationError(
      "Inserisci l'indirizzo completo per il servizio sotto casa.",
    );
  }
  const homePickupAddress = input.homePickupAddress.trim().replace(/\s+/g, " ");
  if (!homePickupAddress) {
    throw new HomePickupValidationError(
      "Inserisci l'indirizzo completo per il servizio sotto casa.",
    );
  }
  if (homePickupAddress.length > HOME_PICKUP_ADDRESS_MAX_LENGTH) {
    throw new HomePickupValidationError(
      `L'indirizzo per il servizio sotto casa non può superare ${HOME_PICKUP_ADDRESS_MAX_LENGTH} caratteri.`,
    );
  }
  return { servizioCasa: true, homePickupAddress };
}
