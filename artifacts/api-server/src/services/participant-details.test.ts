import assert from "node:assert/strict";
import test from "node:test";
import {
  PARTICIPANT_NAME_MAX_LENGTH,
  ParticipantDetailsError,
  normalizeBookingParticipantIdentities,
  normalizeRetainedParticipantIds,
} from "./participant-details";

test("normalizza nome e cognome senza modificare l'input", () => {
  const participants = [
    { type: "adult", firstName: "  Anna  ", lastName: " Rossi " },
    { type: "child", firstName: " Luca ", lastName: " Bianchi " },
  ];

  assert.deepEqual(normalizeBookingParticipantIdentities(participants), [
    { firstName: "Anna", lastName: "Rossi" },
    { firstName: "Luca", lastName: "Bianchi" },
  ]);
  assert.equal(participants[0]?.firstName, "  Anna  ");
});

test("rifiuta righe incomplete quando ci sono più partecipanti", () => {
  assert.throws(
    () =>
      normalizeBookingParticipantIdentities([
        { type: "adult", firstName: "Anna", lastName: "Rossi" },
        { type: "child", firstName: "", lastName: "Rossi" },
      ]),
    (error: unknown) =>
      error instanceof ParticipantDetailsError &&
      error.message.includes("bambino 2"),
  );
});

test("usa il referente solo per il fallback legacy di una persona", () => {
  assert.deepEqual(
    normalizeBookingParticipantIdentities([{ type: "patient" }], {
      firstName: " Maria ",
      lastName: " Verdi ",
    }),
    [{ firstName: "Maria", lastName: "Verdi" }],
  );
});

test("non usa un fallback parziale e applica il limite di lunghezza", () => {
  assert.throws(
    () =>
      normalizeBookingParticipantIdentities(
        [{ type: "adult", firstName: "Anna" }],
        { firstName: "Maria", lastName: "Verdi" },
      ),
    ParticipantDetailsError,
  );
  assert.throws(
    () =>
      normalizeBookingParticipantIdentities([
        {
          type: "adult",
          firstName: "A".repeat(PARTICIPANT_NAME_MAX_LENGTH + 1),
          lastName: "Rossi",
        },
      ]),
    ParticipantDetailsError,
  );
});

test("conserva gli id delle righe storiche anche quando vengono riordinate", () => {
  assert.deepEqual(
    normalizeRetainedParticipantIds(
      [{ id: "participant-b" }, { id: "participant-a" }, {}],
      ["participant-a", "participant-b"],
    ),
    ["participant-b", "participant-a", null],
  );
});

test("rifiuta la perdita, duplicazione o sostituzione di una riga storica", () => {
  assert.throws(
    () =>
      normalizeRetainedParticipantIds(
        [{ id: "participant-a" }, {}],
        ["participant-a", "participant-b"],
      ),
    ParticipantDetailsError,
  );
  assert.throws(
    () =>
      normalizeRetainedParticipantIds(
        [{ id: "participant-a" }, { id: "participant-a" }],
        ["participant-a"],
      ),
    ParticipantDetailsError,
  );
  assert.throws(
    () =>
      normalizeRetainedParticipantIds(
        [{ id: "participant-other" }],
        ["participant-a"],
      ),
    ParticipantDetailsError,
  );
});
