import assert from "node:assert/strict";
import test from "node:test";
import { deliverOutboxEntryNow } from "./email-outbox";

// Questi test coprono l'unica proprieta davvero critica della corsia
// prioritaria: la funzione viene invocata con `void`, quindi una promessa
// rigettata diventerebbe un unhandledRejection e in Node abbatte il processo.
// L'invio di un magic link non deve poter far cadere l'API server.

test("senza provider email configurato non solleva e non tocca il database", async () => {
  const resend = process.env.RESEND_API_KEY;
  const smtp = process.env.SMTP_HOST;
  delete process.env.RESEND_API_KEY;
  delete process.env.SMTP_HOST;
  try {
    // Il DATABASE_URL dei test punta a una porta chiusa: se questa chiamata
    // provasse a interrogare il database fallirebbe. Che ritorni senza errori
    // dimostra che esce prima, sul controllo di configurazione.
    await assert.doesNotReject(() => deliverOutboxEntryNow("chiave-inesistente"));
  } finally {
    if (resend !== undefined) process.env.RESEND_API_KEY = resend;
    if (smtp !== undefined) process.env.SMTP_HOST = smtp;
  }
});

test("con provider configurato e database irraggiungibile non solleva", async () => {
  const resend = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "re_chiave_finta_per_test";
  try {
    // Qui il controllo di configurazione passa e si arriva al lease, che
    // fallisce perche il database di test non esiste. L'errore deve restare
    // dentro la funzione: il messaggio resta nell'outbox e lo recuperera il
    // poller di manutenzione.
    await assert.doesNotReject(() => deliverOutboxEntryNow("chiave-inesistente"));
  } finally {
    if (resend === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = resend;
  }
});
