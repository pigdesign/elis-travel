export const PARTICIPANT_NAME_MAX_LENGTH = 100;

export type ParticipantIdentityInput = {
  type?: unknown;
  firstName?: unknown;
  lastName?: unknown;
};

export type NormalizedParticipantIdentity = {
  firstName: string;
  lastName: string;
};

export class ParticipantDetailsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParticipantDetailsError";
  }
}

function participantLabel(
  input: ParticipantIdentityInput,
  index: number,
): string {
  const ordinal = index + 1;
  switch (input.type) {
    case "adult":
      return `adulto ${ordinal}`;
    case "child":
      return `bambino ${ordinal}`;
    case "patient":
      return `paziente ${ordinal}`;
    case "companion":
      return `accompagnatore ${ordinal}`;
    default:
      return `partecipante ${ordinal}`;
  }
}

function normalizedNamePart(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Valida e normalizza l'anagrafica usata per creare una prenotazione.
 *
 * Il fallback del referente e volutamente limitato a una prenotazione con una
 * sola persona: consente a una vecchia pagina gia aperta di completare il caso
 * semplice senza creare righe anonime. Con due o piu persone i nomi restano
 * sempre obbligatori e il client deve essere aggiornato/ricaricato.
 */
export function normalizeBookingParticipantIdentities(
  participants: unknown,
  singleParticipantFallback?: NormalizedParticipantIdentity,
): NormalizedParticipantIdentity[] {
  if (!Array.isArray(participants)) {
    throw new ParticipantDetailsError(
      "L'elenco dei partecipanti non è valido.",
    );
  }

  return participants.map((raw, index) => {
    const input =
      raw && typeof raw === "object"
        ? (raw as ParticipantIdentityInput)
        : ({} as ParticipantIdentityInput);
    let firstName = normalizedNamePart(input.firstName);
    let lastName = normalizedNamePart(input.lastName);

    if (
      participants.length === 1 &&
      !firstName &&
      !lastName &&
      singleParticipantFallback
    ) {
      firstName = singleParticipantFallback.firstName.trim();
      lastName = singleParticipantFallback.lastName.trim();
    }

    const label = participantLabel(input, index);
    if (!firstName || !lastName) {
      throw new ParticipantDetailsError(
        `Inserisci nome e cognome per ${label}. Se la pagina era già aperta, ricaricala e riprova.`,
      );
    }
    if (
      firstName.length > PARTICIPANT_NAME_MAX_LENGTH ||
      lastName.length > PARTICIPANT_NAME_MAX_LENGTH
    ) {
      throw new ParticipantDetailsError(
        `Nome o cognome troppo lungo per ${label} (massimo ${PARTICIPANT_NAME_MAX_LENGTH} caratteri).`,
      );
    }

    return { firstName, lastName };
  });
}

/**
 * Conserva l'identità tecnica delle righe già persistite durante una correzione
 * amministrativa. Le righe senza id sono ammesse soltanto per completare posti
 * legacy che non hanno ancora un partecipante; ogni id esistente deve invece
 * comparire esattamente una volta.
 */
export function normalizeRetainedParticipantIds(
  participants: readonly { id?: unknown }[],
  existingParticipantIds: readonly string[],
): Array<string | null> {
  const existingIds = new Set(existingParticipantIds);
  const seenIds = new Set<string>();
  const normalizedIds = participants.map((participant) => {
    if (participant.id == null) return null;
    if (typeof participant.id !== "string") {
      throw new ParticipantDetailsError(
        "L'identificativo di un partecipante esistente non è valido.",
      );
    }
    const participantId = participant.id.trim();
    if (
      !participantId ||
      seenIds.has(participantId) ||
      !existingIds.has(participantId)
    ) {
      throw new ParticipantDetailsError(
        "I partecipanti esistenti devono conservare un identificativo valido e univoco.",
      );
    }
    seenIds.add(participantId);
    return participantId;
  });

  if (seenIds.size !== existingIds.size) {
    throw new ParticipantDetailsError(
      "La correzione non può sostituire o eliminare partecipanti già registrati. Ricarica il dettaglio e riprova.",
    );
  }
  return normalizedIds;
}
