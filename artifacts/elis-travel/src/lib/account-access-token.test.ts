import assert from "node:assert/strict";
import test from "node:test";
import { readAccountTokenFromLocation } from "./account-access-token";

test("il token viene letto dal fragment", () => {
  assert.equal(
    readAccountTokenFromLocation({ hash: "#token=abcd1234efgh", search: "" }),
    "abcd1234efgh",
  );
  // Senza cancelletto iniziale: alcuni ambienti lo omettono.
  assert.equal(
    readAccountTokenFromLocation({ hash: "token=abcd1234efgh", search: "" }),
    "abcd1234efgh",
  );
});

test("la query string e solo un ripiego e il fragment ha la precedenza", () => {
  // Alcuni client di posta riscrivono i link per tracciarli e possono spostare
  // il fragment in query string: accettarla evita accessi impossibili.
  assert.equal(
    readAccountTokenFromLocation({ hash: "", search: "?token=daQueryString1" }),
    "daQueryString1",
  );
  assert.equal(
    readAccountTokenFromLocation({
      hash: "#token=dalFragment12",
      search: "?token=daQueryString1",
    }),
    "dalFragment12",
  );
});

test("valori non plausibili vengono scartati", () => {
  assert.equal(
    readAccountTokenFromLocation({ hash: "#token=corto", search: "" }),
    "",
  );
  assert.equal(readAccountTokenFromLocation({ hash: "#token=", search: "" }), "");
  assert.equal(
    readAccountTokenFromLocation({ hash: "#token=con spazio dentro", search: "" }),
    "",
  );
  assert.equal(
    readAccountTokenFromLocation({
      hash: `#token=${"a".repeat(513)}`,
      search: "",
    }),
    "",
  );
});

test("senza token si ottiene stringa vuota", () => {
  assert.equal(readAccountTokenFromLocation({ hash: "", search: "" }), "");
  assert.equal(
    readAccountTokenFromLocation({ hash: "#altro=valore", search: "?x=1" }),
    "",
  );
});

test("i caratteri percent-encoded vengono decodificati", () => {
  // buildAccountAccessUrl codifica il token base64url: +, / e = diventano
  // %2B, %2F e %3D. Senza decodifica il confronto con l'hash fallirebbe.
  assert.equal(
    readAccountTokenFromLocation({ hash: "#token=a%2Bb%2Fc%3Dd12345", search: "" }),
    "a+b/c=d12345",
  );
});
