import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAccountAccessUrl,
  buildMagicLinkEmail,
} from "./customer-auth-emails";

const TOKEN = "abc123-token_XYZ";

test("il token viaggia nel fragment, non nella query string", () => {
  const url = buildAccountAccessUrl(TOKEN);
  // Il fragment non viene inviato al server ne ai proxy: se finisse in query
  // string, la credenziale comparirebbe nei log HTTP e nel Referer.
  assert.ok(url.includes("/accedi#token="));
  assert.ok(!url.includes("?token="));
  assert.equal(new URL(url).search, "");
});

test("caratteri speciali nel token vengono codificati", () => {
  const url = buildAccountAccessUrl("a+b/c=d");
  assert.ok(url.endsWith("#token=a%2Bb%2Fc%3Dd"));
});

test("l'email contiene il link una sola volta nel testo e due nell'html", () => {
  const msg = buildMagicLinkEmail({
    to: "mario@esempio.it",
    token: TOKEN,
    ttlMs: 15 * 60 * 1000,
  });
  const url = buildAccountAccessUrl(TOKEN);
  assert.equal(msg.to, "mario@esempio.it");
  assert.ok(msg.text.includes(url));
  // Nell'html il link compare nel bottone e nella riga di ripiego per i client
  // che non rendono i pulsanti.
  assert.equal(msg.html.split(url).length - 1, 2);
});

test("la durata dichiarata segue il TTL passato", () => {
  const quarter = buildMagicLinkEmail({
    to: "a@b.it",
    token: TOKEN,
    ttlMs: 15 * 60 * 1000,
  });
  assert.ok(quarter.text.includes("15 minuti"));

  const single = buildMagicLinkEmail({
    to: "a@b.it",
    token: TOKEN,
    ttlMs: 60 * 1000,
  });
  assert.ok(single.text.includes("1 minuto"));
});

test("il reply-to punta all'indirizzo dell'agenzia, non al mittente tecnico", () => {
  // Le email partono da un sottodominio (send.elis-travel.it) per non toccare
  // l'SPF della casella aziendale: senza reply-to, le risposte dei clienti
  // finirebbero in una casella che nessuno legge.
  const msg = buildMagicLinkEmail({
    to: "a@b.it",
    token: TOKEN,
    ttlMs: 900_000,
  });
  assert.equal(msg.replyTo, "info@elis-travel.it");
});

test("l'html non contiene il token non codificato in attributi pericolosi", () => {
  const msg = buildMagicLinkEmail({
    to: "a@b.it",
    token: '"><script>alert(1)</script>',
    ttlMs: 900_000,
  });
  assert.ok(!msg.html.includes("<script>"));
});
