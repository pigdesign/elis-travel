export function canRequestHomePickup(input: {
  tripType: "standard" | "rident";
  hasPickupPoints: boolean;
}): boolean {
  return input.hasPickupPoints;
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
