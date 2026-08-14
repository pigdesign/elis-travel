import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  TOLLERANZA_MS,
  azionePerEvento,
  verificaFirmaResend,
} from "./resend-webhook";

const SECRET = "whsec_" + Buffer.from("chiave-di-prova-per-i-test").toString("base64");
const ID = "msg_2abc";
const BODY = JSON.stringify({ type: "email.bounced", data: { to: ["a@b.it"] } });
const NOW = 1_770_000_000_000;
const TS = String(Math.floor(NOW / 1000));

function firma(body: string, ts = TS, id = ID, secret = SECRET): string {
  const chiave = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return (
    "v1," +
    createHmac("sha256", chiave).update(`${id}.${ts}.${body}`).digest("base64")
  );
}

const base = {
  secret: SECRET,
  body: BODY,
  svixId: ID,
  svixTimestamp: TS,
  now: NOW,
};

test("una firma corretta viene accettata", () => {
  const esito = verificaFirmaResend({ ...base, svixSignature: firma(BODY) });
  assert.equal(esito.valida, true);
});

test("un corpo alterato invalida la firma", () => {
  // È il caso che conta: qualcuno intercetta un evento vero e cambia
  // l'indirizzo per togliere l'accesso a un altro cliente.
  const alterato = JSON.stringify({
    type: "email.bounced",
    data: { to: ["vittima@esempio.it"] },
  });
  const esito = verificaFirmaResend({
    ...base,
    body: alterato,
    svixSignature: firma(BODY),
  });
  assert.equal(esito.valida, false);
});

test("un segreto diverso non passa", () => {
  const altro = "whsec_" + Buffer.from("segreto-sbagliato").toString("base64");
  const esito = verificaFirmaResend({
    ...base,
    svixSignature: firma(BODY, TS, ID, altro),
  });
  assert.equal(esito.valida, false);
});

test("un messaggio vecchio viene rifiutato anche se firmato bene", () => {
  // La firma resta valida per sempre: senza il controllo sul tempo, un
  // messaggio catturato oggi potrebbe essere rigiocato fra un mese.
  const vecchio = String(Math.floor((NOW - TOLLERANZA_MS - 60_000) / 1000));
  const esito = verificaFirmaResend({
    ...base,
    svixTimestamp: vecchio,
    svixSignature: firma(BODY, vecchio),
  });
  assert.equal(esito.valida, false);
  assert.match(esito.valida === false ? esito.motivo : "", /vecchio|futuro/);
});

test("intestazioni mancanti o segreto assente non passano", () => {
  assert.equal(
    verificaFirmaResend({ ...base, svixSignature: undefined }).valida,
    false,
  );
  assert.equal(
    verificaFirmaResend({ ...base, secret: "", svixSignature: firma(BODY) })
      .valida,
    false,
  );
});

test("con piu firme basta che una corrisponda", () => {
  // Durante la rotazione del segreto Resend invia entrambe le versioni.
  const doppia = `v1,${Buffer.from("firma-vecchia").toString("base64")} ${firma(BODY)}`;
  assert.equal(
    verificaFirmaResend({ ...base, svixSignature: doppia }).valida,
    true,
  );
});

// --- traduzione evento → azione -------------------------------------------

test("un rimbalzo segna l'indirizzo come non recapitabile", () => {
  const a = azionePerEvento({
    type: "email.bounced",
    data: { to: ["mario@esempio.it"] },
  });
  assert.equal(a.tipo, "segna_non_recapitabile");
  assert.equal(a.tipo === "segna_non_recapitabile" && a.email, "mario@esempio.it");
});

test("un reclamo per spam vale come un rimbalzo", () => {
  // Continuare a scrivere a chi ci ha segnalati danneggia la reputazione del
  // dominio, oltre a infastidire la persona.
  const a = azionePerEvento({
    type: "email.complained",
    data: { to: ["chi@esempio.it"] },
  });
  assert.equal(a.tipo, "segna_non_recapitabile");
});

test("una consegna riuscita rimuove il segnale", () => {
  const a = azionePerEvento({
    type: "email.delivered",
    data: { to: ["ok@esempio.it"] },
  });
  assert.equal(a.tipo, "segna_recapitabile");
});

test("gli altri eventi vengono ignorati senza errori", () => {
  // Resend puo aggiungere tipi nuovi: rispondere con errore lo farebbe
  // ritentare all'infinito per eventi che non ci riguardano.
  assert.equal(azionePerEvento({ type: "email.sent", data: { to: ["a@b.it"] } }).tipo, "ignora");
  assert.equal(azionePerEvento({ type: "email.opened", data: { to: ["a@b.it"] } }).tipo, "ignora");
  assert.equal(azionePerEvento(null).tipo, "ignora");
  assert.equal(azionePerEvento({ type: "email.bounced" }).tipo, "ignora");
});

test("il destinatario si legge sia da stringa sia da lista", () => {
  assert.equal(
    azionePerEvento({ type: "email.bounced", data: { to: "solo@esempio.it" } })
      .tipo,
    "segna_non_recapitabile",
  );
});
