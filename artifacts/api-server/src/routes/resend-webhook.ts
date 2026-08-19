import { type Request, type Response } from "express";
import { db } from "@workspace/db";
import { customerAccountsTable } from "@workspace/db/schema";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { recordAccountEvent } from "../services/customer-auth-throttle";
import {
  azionePerEvento,
  verificaFirmaResend,
} from "../services/resend-webhook";

/**
 * Ricezione degli eventi di consegna da Resend.
 *
 * Perche serve: al lancio l'unico modo di entrare nell'area clienti e il link
 * via email. Se l'indirizzo di un cliente smette di ricevere — casella chiusa,
 * dominio scaduto, filtro che rifiuta — l'account diventa irraggiungibile e
 * nessuno se ne accorge, perche dal nostro lato l'invio risulta riuscito.
 * Questo endpoint e cio che rende quel silenzio visibile in backoffice.
 *
 * Registrato PRIMA di express.json() e con corpo grezzo: la firma si calcola
 * sui byte esatti ricevuti.
 */
export async function resendWebhookHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const secret = process.env.RESEND_WEBHOOK_SECRET ?? "";
  const body = Buffer.isBuffer(req.body)
    ? req.body.toString("utf8")
    : typeof req.body === "string"
      ? req.body
      : "";

  const esito = verificaFirmaResend({
    secret,
    body,
    svixId: req.header("svix-id"),
    svixTimestamp: req.header("svix-timestamp"),
    svixSignature: req.header("svix-signature"),
  });

  if (!esito.valida) {
    logger.warn({ motivo: esito.motivo }, "Webhook Resend rifiutato");
    res.status(400).json({ error: "Firma non valida." });
    return;
  }

  let evento: unknown;
  try {
    evento = JSON.parse(body);
  } catch {
    res.status(400).json({ error: "Corpo non valido." });
    return;
  }

  const azione = azionePerEvento(evento);

  // Si risponde 200 anche quando non c'e nulla da fare: un errore farebbe
  // ritentare Resend all'infinito per eventi che non ci interessano.
  if (azione.tipo === "ignora") {
    res.json({ ok: true, ignorato: azione.motivo });
    return;
  }

  // Guasto passeggero: va visto, ma NON deve cambiare lo stato dell'account.
  // Un rifiuto temporaneo del provider di destinazione non dice nulla sulla
  // validita dell'indirizzo.
  if (azione.tipo === "solo_segnalazione") {
    logger.warn(
      {
        destinatario: azione.email.trim().toLowerCase(),
        motivo: azione.motivo,
        provider: azione.dettaglio ?? null,
      },
      "Consegna fallita temporaneamente: nessuna modifica all'account",
    );
    res.json({ ok: true, segnalato: azione.motivo });
    return;
  }

  const emailNormalizzata = azione.email.trim().toLowerCase();

  try {
    if (azione.tipo === "segna_non_recapitabile") {
      const [aggiornato] = await db
        .update(customerAccountsTable)
        .set({
          emailStatus: "bounced",
          emailBouncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          sql`lower(btrim(${customerAccountsTable.email})) = ${emailNormalizzata}`,
        )
        .returning({ id: customerAccountsTable.id });

      if (aggiornato) {
        await recordAccountEvent({
          eventType: "email_bounced",
          accountId: aggiornato.id,
          detail: { motivo: azione.motivo, provider: azione.dettaglio ?? null },
        });
        logger.warn(
          { accountId: aggiornato.id, motivo: azione.motivo },
          "Indirizzo non recapitabile: account segnalato in backoffice",
        );
      } else {
        // Nessun account con quell'indirizzo: e un destinatario interno, cioe
        // una delle caselle in ADMIN_NOTIFICATION_EMAILS. Non c'e una riga da
        // aggiornare, ma il fatto va reso visibile: un indirizzo interno che
        // rimbalza e piu grave di uno cliente, perche nessuno se ne accorge —
        // il cliente almeno telefona.
        logger.error(
          {
            destinatario: emailNormalizzata,
            motivo: azione.motivo,
            // Il messaggio grezzo del server di destinazione: e cio che
            // distingue "casella inesistente" da "messaggio rifiutato".
            provider: azione.dettaglio ?? null,
          },
          "RIMBALZO SU INDIRIZZO INTERNO: le notifiche all'amministrazione non vengono recapitate",
        );
      }
    } else {
      // Consegna riuscita: se l'indirizzo era segnato come non recapitabile,
      // qualcuno l'ha rimesso in funzione e il segnale va tolto.
      await db
        .update(customerAccountsTable)
        .set({
          emailStatus: "deliverable",
          emailBouncedAt: null,
          updatedAt: new Date(),
        })
        .where(
          sql`lower(btrim(${customerAccountsTable.email})) = ${emailNormalizzata}
              and ${customerAccountsTable.emailStatus} <> 'deliverable'`,
        );
    }
  } catch (error) {
    logger.error({ err: error }, "Aggiornamento stato email fallito");
    // 500 cosi Resend ritenta: perdere un rimbalzo significa lasciare un
    // account irraggiungibile senza che nessuno lo sappia.
    res.status(500).json({ error: "Errore interno." });
    return;
  }

  res.json({ ok: true });
}
