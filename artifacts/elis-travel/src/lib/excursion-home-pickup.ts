export function canRequestHomePickup(input: {
  tripType: "standard" | "rident";
  hasPickupPoints: boolean;
  /**
   * Interruttore generale dalle Impostazioni (`home_pickup_enabled`).
   *
   * Dal 2026-09-30 il servizio non e' ancora operativo e il blocco non deve
   * comparire nel modulo pubblico. Sta qui e non in un commento "riattivare
   * questa riga" perche' il ritorno in servizio dev'essere una spunta in
   * Impostazioni, non un deploy.
   *
   * Vale solo per le richieste NUOVE: una prenotazione che ha gia' il
   * trasporto da casa continua a mostrarlo ovunque — report di raccolta,
   * scheda admin, email — perche' spegnere un servizio non riscrive lo
   * storico.
   */
  globallyEnabled: boolean;
}): boolean {
  return input.globallyEnabled && input.hasPickupPoints;
}

export function buildHomePickupBookingFields(
  requested: boolean,
  address: string,
): { servizioCasa?: true; homePickupAddress?: string } {
  if (!requested) return {};
  return {
    servizioCasa: true,
    homePickupAddress: address.trim(),
  };
}
