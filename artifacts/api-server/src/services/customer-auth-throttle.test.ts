import assert from "node:assert/strict";
import test from "node:test";
import {
  MAGIC_LINK_LIMITS,
  hashEmailForEvents,
  magicLinkThrottleDecision,
} from "./customer-auth-throttle";

const OK = { emailLastHour: 0, emailLastDay: 0, ipLastQuarterHour: 0 };

test("una richiesta normale passa", () => {
  assert.deepEqual(magicLinkThrottleDecision(OK), {
    allowed: true,
    blockedBy: null,
  });
});

test("il limite orario per indirizzo blocca al raggiungimento, non dopo", () => {
  const atLimit = {
    ...OK,
    emailLastHour: MAGIC_LINK_LIMITS.perEmailPerHour,
  };
  assert.deepEqual(magicLinkThrottleDecision(atLimit), {
    allowed: false,
    blockedBy: "email",
  });
  assert.equal(
    magicLinkThrottleDecision({
      ...OK,
      emailLastHour: MAGIC_LINK_LIMITS.perEmailPerHour - 1,
    }).allowed,
    true,
  );
});

test("il limite giornaliero per indirizzo vale anche se quello orario e libero", () => {
  // Caso reale: dieci richieste distribuite nella giornata, nessuna ora piena.
  const decision = magicLinkThrottleDecision({
    emailLastHour: 0,
    emailLastDay: MAGIC_LINK_LIMITS.perEmailPerDay,
    ipLastQuarterHour: 0,
  });
  assert.deepEqual(decision, { allowed: false, blockedBy: "email" });
});

test("il limite per IP ha la precedenza su quello per indirizzo", () => {
  // L'ordine conta: solo il blocco per IP puo essere comunicato all'utente,
  // perche non rivela nulla su uno specifico account. Se prevalesse l'altro,
  // risponderemmo in modo generico a un abuso che potevamo dichiarare.
  const decision = magicLinkThrottleDecision({
    emailLastHour: 99,
    emailLastDay: 99,
    ipLastQuarterHour: MAGIC_LINK_LIMITS.perIpPerQuarterHour,
  });
  assert.deepEqual(decision, { allowed: false, blockedBy: "ip" });
});

test("l'assenza di IP non blocca nulla da sola", () => {
  assert.equal(
    magicLinkThrottleDecision({ ...OK, ipLastQuarterHour: 0 }).allowed,
    true,
  );
});

test("l'hash dell'indirizzo normalizza maiuscole e spazi", () => {
  const canonical = hashEmailForEvents("mario.rossi@esempio.it");
  assert.equal(hashEmailForEvents("  Mario.Rossi@ESEMPIO.it  "), canonical);
  assert.notEqual(hashEmailForEvents("altro@esempio.it"), canonical);
});

test("l'hash non contiene l'indirizzo in chiaro", () => {
  const hash = hashEmailForEvents("mario.rossi@esempio.it");
  assert.ok(!hash.includes("mario"));
  assert.ok(!hash.includes("@"));
  assert.match(hash, /^[0-9a-f]{64}$/);
});
