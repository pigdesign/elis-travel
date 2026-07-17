import { Router } from "express";
import { db } from "@workspace/db";
import { ageRangesTable, bookingParticipantsTable, excursionAgePricesTable } from "@workspace/db/schema";
import { eq, asc, count } from "drizzle-orm";

const router = Router();

function parseAge(input: unknown): number | null {
  const n = Number(input);
  return Number.isInteger(n) && n >= 0 && n <= 120 ? n : null;
}

router.get("/age-ranges", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(ageRangesTable)
      .orderBy(asc(ageRangesTable.sortOrder), asc(ageRangesTable.minAge));
    res.json(rows);
  } catch (err) {
    console.error("Age ranges fetch failed:", err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.post("/age-ranges", async (req, res) => {
  try {
    const { label, minAge, maxAge, active, sortOrder } = req.body as {
      label?: string;
      minAge?: number;
      maxAge?: number;
      active?: boolean;
      sortOrder?: number;
    };
    if (!label?.trim()) {
      res.status(400).json({ error: "L'etichetta è obbligatoria." });
      return;
    }
    const min = parseAge(minAge);
    const max = parseAge(maxAge);
    if (min === null || max === null || min > max) {
      res.status(400).json({ error: "Età minima e massima non valide (min ≤ max)." });
      return;
    }
    const [row] = await db
      .insert(ageRangesTable)
      .values({
        label: label.trim(),
        minAge: min,
        maxAge: max,
        active: active !== false,
        sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    console.error("Age range create failed:", err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.patch("/age-ranges/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { label, minAge, maxAge, active, sortOrder } = req.body as {
      label?: string;
      minAge?: number;
      maxAge?: number;
      active?: boolean;
      sortOrder?: number;
    };
    const updates: Partial<typeof ageRangesTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (label !== undefined) {
      if (!label.trim()) {
        res.status(400).json({ error: "L'etichetta è obbligatoria." });
        return;
      }
      updates.label = label.trim();
    }
    if (minAge !== undefined) {
      const min = parseAge(minAge);
      if (min === null) {
        res.status(400).json({ error: "Età minima non valida." });
        return;
      }
      updates.minAge = min;
    }
    if (maxAge !== undefined) {
      const max = parseAge(maxAge);
      if (max === null) {
        res.status(400).json({ error: "Età massima non valida." });
        return;
      }
      updates.maxAge = max;
    }
    if (active !== undefined) updates.active = active === true;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;

    const [row] = await db
      .update(ageRangesTable)
      .set(updates)
      .where(eq(ageRangesTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Fascia età non trovata." });
      return;
    }
    if (row.minAge > row.maxAge) {
      res.status(400).json({ error: "Età minima maggiore della massima." });
      return;
    }
    res.json(row);
  } catch (err) {
    console.error("Age range update failed:", err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.delete("/age-ranges/:id", async (req, res) => {
  try {
    const { id } = req.params;
    // Se la fascia è usata da partecipanti o da prezzi gita, va disattivata, non eliminata:
    // eliminarla cancellerebbe i prezzi configurati sulle gite.
    const [participantUsage] = await db
      .select({ n: count() })
      .from(bookingParticipantsTable)
      .where(eq(bookingParticipantsTable.ageRangeId, id));
    const [priceUsage] = await db
      .select({ n: count() })
      .from(excursionAgePricesTable)
      .where(eq(excursionAgePricesTable.ageRangeId, id));
    if (Number(participantUsage.n) > 0 || Number(priceUsage.n) > 0) {
      res.status(409).json({
        error:
          "La fascia è usata da prenotazioni o prezzi gita: disattivala invece di eliminarla.",
      });
      return;
    }
    const [deleted] = await db
      .delete(ageRangesTable)
      .where(eq(ageRangesTable.id, id))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Fascia età non trovata." });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("Age range delete failed:", err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

export default router;
