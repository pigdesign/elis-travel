export const PARTICIPANT_NAME_MAX_LENGTH = 100;

export type ParticipantNameDraft = {
  firstName: string;
  lastName: string;
  firstNameTouched: boolean;
  lastNameTouched: boolean;
};

export function emptyParticipantName(): ParticipantNameDraft {
  return {
    firstName: "",
    lastName: "",
    firstNameTouched: false,
    lastNameTouched: false,
  };
}

export function resizeParticipantNames(
  previous: ParticipantNameDraft[],
  count: number,
): ParticipantNameDraft[] {
  const next = previous.slice(0, count);
  while (next.length < count) next.push(emptyParticipantName());
  return next;
}

export function resizeStrings(previous: string[], count: number): string[] {
  const next = previous.slice(0, count);
  while (next.length < count) next.push("");
  return next;
}

export function updateParticipantName(
  previous: ParticipantNameDraft[],
  index: number,
  field: "firstName" | "lastName",
  value: string,
): ParticipantNameDraft[] {
  return previous.map((participant, participantIndex) =>
    participantIndex === index
      ? {
          ...participant,
          [field]: value,
          [field === "firstName" ? "firstNameTouched" : "lastNameTouched"]:
            true,
        }
      : participant,
  );
}

export function syncUntouchedPrimaryParticipantName(
  previous: ParticipantNameDraft[],
  field: "firstName" | "lastName",
  value: string,
): ParticipantNameDraft[] {
  return previous.map((participant, index) => {
    if (index !== 0) return participant;
    const wasTouched =
      field === "firstName"
        ? participant.firstNameTouched
        : participant.lastNameTouched;
    return wasTouched ? participant : { ...participant, [field]: value };
  });
}
