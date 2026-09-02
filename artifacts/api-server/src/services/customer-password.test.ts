import assert from "node:assert/strict";
import test from "node:test";
import {
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  checkPasswordPolicy,
  hashPassword,
  verifyPassword,
} from "./customer-password";
import {
  PASSWORD_LOGIN_LIMITS,
  passwordLoginThrottleDecision,
} from "./customer-auth-throttle";

test("una password di lunghezza sufficiente e accettata", () => {
  assert.deepEqual(checkPasswordPolicy("gitainpullman"), { ok: true });
});

test("sotto il minimo viene rifiutata, al minimo no", () => {
  assert.equal(checkPasswordPolicy("a".repeat(PASSWORD_MIN_LENGTH)).ok, true);
  assert.equal(
    checkPasswordPolicy("a".repeat(PASSWORD_MIN_LENGTH - 1)).ok,
    false,
  );
});

test("oltre 72 byte viene rifiutata invece di essere troncata in silenzio", () => {
  // bcrypt ignora tutto cio che eccede: accettarla significherebbe che due
  // password diverse con lo stesso prefisso aprono lo stesso account.
  assert.equal(checkPasswordPolicy("a".repeat(PASSWORD_MAX_BYTES)).ok, true);
  assert.equal(
    checkPasswordPolicy("a".repeat(PASSWORD_MAX_BYTES + 1)).ok,
    false,
  );
});

test("il limite e sui BYTE, non sui caratteri", () => {
  // Ogni emoji vale quattro byte: venti stanno sotto i 72 caratteri ma sopra
  // i 72 byte, ed e li che bcrypt taglierebbe.
  const emoji = "🚌".repeat(20);
  assert.ok(emoji.length < PASSWORD_MAX_BYTES);
  assert.equal(checkPasswordPolicy(emoji).ok, false);
});

test("quel che non e una stringa non e una password", () => {
  assert.equal(checkPasswordPolicy(undefined).ok, false);
  assert.equal(checkPasswordPolicy(12345678).ok, false);
  assert.equal(checkPasswordPolicy({ password: "gitainpullman" }).ok, false);
});

test("la verifica riconosce la password giusta e rifiuta quella sbagliata", async () => {
  const hash = await hashPassword("gitainpullman");
  assert.equal(await verifyPassword("gitainpullman", hash), true);
  assert.equal(await verifyPassword("gitainpullmano", hash), false);
});

test("senza hash la verifica fallisce comunque, senza sollevare", async () => {
  // E il caso dell'indirizzo inesistente e dell'account senza password: deve
  // rispondere 'no', non esplodere e non scorciare il tempo di risposta.
  assert.equal(await verifyPassword("gitainpullman", null), false);
});

test("il limite per indirizzo scatta al raggiungimento, non dopo", () => {
  const soglia = PASSWORD_LOGIN_LIMITS.perEmailPerQuarterHour;
  assert.deepEqual(
    passwordLoginThrottleDecision({
      emailLastQuarterHour: soglia,
      ipLastQuarterHour: 0,
    }),
    { allowed: false, blockedBy: "email" },
  );
  assert.equal(
    passwordLoginThrottleDecision({
      emailLastQuarterHour: soglia - 1,
      ipLastQuarterHour: 0,
    }).allowed,
    true,
  );
});

test("il limite per IP ha la precedenza su quello per indirizzo", () => {
  assert.deepEqual(
    passwordLoginThrottleDecision({
      emailLastQuarterHour: PASSWORD_LOGIN_LIMITS.perEmailPerQuarterHour,
      ipLastQuarterHour: PASSWORD_LOGIN_LIMITS.perIpPerQuarterHour,
    }),
    { allowed: false, blockedBy: "ip" },
  );
});
