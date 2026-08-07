import assert from "node:assert/strict";
import test from "node:test";
import { shouldUseToken } from "./booking-access";

test("il token, quando c'e, ha sempre la precedenza", () => {
  // I link gia inviati devono continuare a funzionare identici anche per chi
  // nel frattempo si e creato un account.
  assert.equal(
    shouldUseToken({
      token: "v1.abc.123.firma",
      bookingId: "11111111-1111-1111-1111-111111111111",
      accountId: "22222222-2222-2222-2222-222222222222",
    }),
    true,
  );
});

test("senza token si passa alla sessione solo se c'e anche la prenotazione", () => {
  assert.equal(
    shouldUseToken({
      token: "",
      bookingId: "11111111-1111-1111-1111-111111111111",
      accountId: "22222222-2222-2222-2222-222222222222",
    }),
    false, // → ramo sessione
  );
});

test("sessione senza prenotazione indicata ricade sul token (che manca) e fallisce", () => {
  // Meglio negare che indovinare quale prenotazione intendesse: senza
  // identificativo non c'e nulla su cui verificare la proprieta.
  assert.equal(
    shouldUseToken({
      token: "",
      bookingId: null,
      accountId: "22222222-2222-2222-2222-222222222222",
    }),
    true,
  );
});

test("prenotazione indicata senza sessione non apre nessuna via", () => {
  // E' il tentativo piu ovvio: passare un id di prenotazione altrui senza
  // essere autenticati. Deve finire sul ramo token, che senza token nega.
  assert.equal(
    shouldUseToken({
      token: "",
      bookingId: "11111111-1111-1111-1111-111111111111",
      accountId: null,
    }),
    true,
  );
});

test("richiesta completamente vuota", () => {
  assert.equal(
    shouldUseToken({ token: "", bookingId: null, accountId: null }),
    true,
  );
});
