import { Router } from "express";
import { db } from "@workspace/db";
import { ageRangesTable, bookingParticipantsTable, excursionAgePricesTable } from "@workspace/db/schema";
import { eq, asc, count, and, inArray } from "drizzle-orm";

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

// ---- Prezzi per fascia della singola gita ----

// Elenco fasce attive con l'eventuale prezzo configurato per la gita.
router.get("/excursions/:id/age-prices", async (req, res) => {
  try {
    const { id } = req.params;
    const ranges = await db
      .select()
      .from(ageRangesTable)
      .where(eq(ageRangesTable.active, true))
      .orderBy(asc(ageRangesTable.sortOrder), asc(ageRangesTable.minAge));
    const prices = await db
      .select()
      .from(excursionAgePricesTable)
      .where(eq(excursionAgePricesTable.excursionId, id));
    const priceByRange = new Map(prices.map((p) => [p.ageRangeId, p.price]));
    res.json(
      ranges.map((r) => ({
        ageRangeId: r.id,
        label: r.label,
        minAge: r.minAge,
        maxAge: r.maxAge,
        // null = prezzo non configurato → vale il prezzo adulto pieno
        price: priceByRange.get(r.id) ?? null,
      })),
    );
  } catch (err) {
    console.error("Age prices fetch failed:", err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

// Upsert dei prezzi per fascia: price null/assente = torna al prezzo adulto.
router.put("/excursions/:id/age-prices", async (req, res) => {
  try {
    const { id } = req.params;
    const { prices } = req.body as {
      prices?: { ageRangeId?: string; price?: string | number | null }[];
    };
    if (!Array.isArray(prices)) {
      res.status(400).json({ error: "Formato prezzi non valido." });
      return;
    }
    const toSet: { ageRangeId: string; price: string }[] = [];
    const toClear: string[] = [];
    for (const row of prices) {
      if (!row.ageRangeId) continue;
      if (row.price === null || row.price === undefined || row.price === "") {
        toClear.push(row.ageRangeId);
        continue;
      }
      const n = Number(String(row.price).replace(",", "."));
      if (!Number.isFinite(n) || n < 0) {
        res.status(400).json({ error: "Prezzo fascia non valido (deve essere ≥ 0)." });
        return;
      }
      toSet.push({ ageRangeId: row.ageRangeId, price: n.toFixed(2) });
    }

    await db.transaction(async (tx) => {
      if (toClear.length > 0) {
        await tx
          .delete(excursionAgePricesTable)
          .where(
            and(
              eq(excursionAgePricesTable.excursionId, id),
              inArray(excursionAgePricesTable.ageRangeId, toClear),
            ),
          );
      }
      for (const row of toSet) {
        await tx
          .insert(excursionAgePricesTable)
          .values({ excursionId: id, ageRangeId: row.ageRangeId, price: row.price })
          .onConflictDoUpdate({
            target: [excursionAgePricesTable.excursionId, excursionAgePricesTable.ageRangeId],
            set: { price: row.price, updatedAt: new Date() },
          });
      }
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("Age prices update failed:", err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

export default router;
