import { Router } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

const SETTING_KEYS = [
  "payment_iban",
  "payment_beneficiary",
  "payment_bank",
  "payment_notes",
  "deposit_percentage",
  "excursion_card_payments_enabled",
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

export default router;
