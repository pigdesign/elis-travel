import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyParticipantName,
  resizeParticipantNames,
  resizeStrings,
  syncUntouchedPrimaryParticipantName,
  updateParticipantName,
} from "./booking-participants";

test("il ridimensionamento conserva i dati per indice e inizializza solo le nuove righe", () => {
  const first = updateParticipantName(
    [emptyParticipantName()],
    0,
    "firstName",
    "Anna",
  );
  const grown = resizeParticipantNames(first, 3);

  assert.equal(grown[0]?.firstName, "Anna");
  assert.equal(grown[1]?.firstName, "");
  assert.deepEqual(resizeParticipantNames(grown, 1), first);
  assert.deepEqual(resizeStrings(["pickup-a"], 2), ["pickup-a", ""]);
});

test("il referente precompila solo il primo nome non modificato manualmente", () => {
  const initial = [emptyParticipantName(), emptyParticipantName()];
  const prefilled = syncUntouchedPrimaryParticipantName(
    initial,
    "firstName",
    "Anna",
  );
  assert.equal(prefilled[0]?.firstName, "Anna");
  assert.equal(prefilled[1]?.firstName, "");

  const edited = updateParticipantName(prefilled, 0, "firstName", "Maria");
  const afterContactChange = syncUntouchedPrimaryParticipantName(
    edited,
    "firstName",
    "Giulia",
  );
  assert.equal(afterContactChange[0]?.firstName, "Maria");
});
