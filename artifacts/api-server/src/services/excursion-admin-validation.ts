const MONEY_FIELDS = [
  ["pricePerPerson", "Prezzo per persona"],
  ["patientPrice", "Prezzo paziente"],
  ["companionPrice", "Prezzo accompagnatore"],
  ["vehicleFixedCost", "Costo mezzo"],
  ["mealCostPerPerson", "Costo pasto"],
  ["entranceCostPerPerson", "Costo ingressi"],
  ["extraCostPerPerson", "Costo extra"],
  ["switchVehicleAdditionalCost", "Costo aggiuntivo mezzo alternativo"],
] as const;

const INTEGER_FIELDS = [
  ["currentCapacity", "Capienza", 0, 1_000],
  ["minThreshold", "Soglia minima", 0, 1_000],
  ["switchThreshold", "Soglia cambio mezzo", 0, 1_000],
  ["balanceHoursOverride", "Ore scadenza saldo", 1, 8_760],
  ["bankTransferHoursOverride", "Ore scadenza bonifico", 1, 8_760],
  ["officeHoursOverride", "Ore scadenza ufficio", 1, 8_760],
  ["fullPaymentOnlyDaysBefore", "Giorni solo pagamento completo", 0, 3_650],
] as const;

export type ExcursionAdminValidationError = {
  field: string;
  message: string;
};

function isPresent(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

function decimalValue(value: unknown): number {
  return Number(
    typeof value === "string" ? value.trim().replace(",", ".") : value,
  );
}

function validMoney(value: unknown): boolean {
  const amount = decimalValue(value);
  return (
    Number.isFinite(amount) &&
    amount >= 0 &&
    Number.isSafeInteger(Math.round(amount * 100))
  );
}

/**
 * Il frontend aiuta l'utente, ma l'API resta la fonte autorevole: nessun costo,
 * prezzo, acconto o intervallo operativo negativo/non finito deve raggiungere
 * PostgreSQL o il calcolo in centesimi.
 */
export function validateExcursionAdminInput(
  input: Record<string, unknown>,
  effectiveDepositType: "percent" | "fixed",
): ExcursionAdminValidationError | null {
  for (const [field, label] of MONEY_FIELDS) {
    const value = input[field];
    if (!isPresent(value)) continue;
    if (!validMoney(value)) {
      return {
        field,
        message: `${label} non valido: inserisci un importo maggiore o uguale a zero.`,
      };
    }
  }

  if (isPresent(input.depositValue)) {
    const value = decimalValue(input.depositValue);
    if (
      !validMoney(input.depositValue) ||
      (effectiveDepositType === "percent" && value > 100)
    ) {
      return {
        field: "depositValue",
        message:
          effectiveDepositType === "percent"
            ? "Percentuale acconto non valida: usa un valore tra 0 e 100."
            : "Importo acconto non valido: usa un valore maggiore o uguale a zero.",
      };
    }
  }

  for (const [field, label, minimum, maximum] of INTEGER_FIELDS) {
    const value = input[field];
    if (!isPresent(value)) continue;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
      return {
        field,
        message: `${label} non valida: usa un intero tra ${minimum} e ${maximum}.`,
      };
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "extras")) {
    if (!Array.isArray(input.extras)) {
      return { field: "extras", message: "Elenco extra non valido." };
    }
    for (const item of input.extras) {
      if (!item || typeof item !== "object") {
        return { field: "extras", message: "Elenco extra non valido." };
      }
      const price = (item as Record<string, unknown>).price;
      if (isPresent(price) && !validMoney(price)) {
        return {
          field: "extras",
          message:
            "Il prezzo di ogni extra deve essere maggiore o uguale a zero.",
        };
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "provinceSurcharges")) {
    const surcharges = input.provinceSurcharges;
    if (
      !surcharges ||
      typeof surcharges !== "object" ||
      Array.isArray(surcharges)
    ) {
      return {
        field: "provinceSurcharges",
        message: "Supplementi provincia non validi.",
      };
    }
    for (const value of Object.values(surcharges as Record<string, unknown>)) {
      if (isPresent(value) && !validMoney(value)) {
        return {
          field: "provinceSurcharges",
          message:
            "Ogni supplemento provincia deve essere maggiore o uguale a zero.",
        };
      }
    }
  }

  return null;
}
