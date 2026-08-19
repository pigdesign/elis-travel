import { Router } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import {
  getCurrentTermsVersion,
  resetTermsVersionCache,
} from "../../services/iubenda-terms";

const router = Router();

const SETTING_KEYS = [
  "payment_iban",
  "payment_beneficiary",
  "payment_bank",
  "payment_notes",
  "deposit_percentage",
  "excursion_card_payments_enabled",
  // Addebito futuro carta: attivo solo con una versione consenso esplicita.
  "future_card_charge_enabled",
  "future_card_charge_consent_version",
  // Durata checkout carta abbandonato e tolleranza amministrativa globale.
  "card_checkout_hold_minutes",
  "payment_grace_minutes",
  // Gite v2 — scadenze pagamento in ore (override per gita sulle colonne excursions)
  "payment_deadline_bank_hours",
  "payment_deadline_office_hours",
  "payment_deadline_balance_hours",
  "payment_deadline_near_departure_hours",
  // Giorni prima della partenza da cui è ammesso solo il pagamento completo
  "full_payment_only_days_before",
  // Libera automaticamente i posti alla scadenza pagamento ("true"/"false", default no)
  "auto_release_seats_on_expiry",
  // Pagamento in ufficio
  "office_address",
  "office_opening_hours",
  // Versioni dei testi di consenso (snapshot su booking_consents)
  "terms_policy_version",
  "privacy_policy_version",
  "media_policy_version",
  // Età minima adulto per l'etichetta pubblica (es. "Adulti (18+ anni)")
  "adult_min_age",
] as const;

type SettingKey = (typeof SETTING_KEYS)[number];

router.get("/settings", async (_req, res) => {
  try {
    const rows = await db.select().from(settingsTable);
    const result: Record<string, string | null> = Object.fromEntries(
      SETTING_KEYS.map((k) => [k, null]),
    );
    for (const row of rows) {
      if (SETTING_KEYS.includes(row.key as SettingKey)) {
        result[row.key] = row.value;
      }
    }
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.put("/settings", async (req, res) => {
  try {
    const body = req.body as Partial<Record<SettingKey, string>>;
    const updates: { key: string; value: string }[] = [];

    for (const key of SETTING_KEYS) {
      if (key in body && typeof body[key] === "string") {
        updates.push({ key, value: body[key]! });
      }
    }

    if (updates.length > 0) {
      await db.transaction(async (tx) => {
        for (const { key, value } of updates) {
          await tx
            .insert(settingsTable)
            .values({ key, value, updatedAt: new Date() })
            .onConflictDoUpdate({
              target: settingsTable.key,
              set: { value, updatedAt: new Date() },
            });
        }
      });
    }

    const rows = await db.select().from(settingsTable);
    const result: Record<string, string | null> = Object.fromEntries(
      SETTING_KEYS.map((k) => [k, null]),
    );
    for (const row of rows) {
      if (SETTING_KEYS.includes(row.key as SettingKey)) {
        result[row.key] = row.value;
      }
    }
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

/**
 * Versione dei Termini e Condizioni in vigore, letta da Iubenda.
 *
 * La risposta arriva dalla cache (un'ora). Con `?refresh=1` la cache viene
 * svuotata e il documento riletto: serve subito dopo aver pubblicato una
 * modifica su Iubenda, altrimenti il gestionale continuerebbe a registrare i
 * consensi con la data precedente fino alla scadenza della cache.
 */
router.get("/terms-version", async (req, res) => {
  try {
    if (req.query.refresh === "1") resetTermsVersionCache();
    const version = await getCurrentTermsVersion();
    res.json({ version: version ?? null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

export default router;
