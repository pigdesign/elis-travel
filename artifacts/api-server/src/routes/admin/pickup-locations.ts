import { Router } from "express";
import { db } from "@workspace/db";
import { pickupLocationsTable, excursionPickupPointsTable } from "@workspace/db/schema";
import { eq, asc, count } from "drizzle-orm";

const router = Router();

// Sigla provincia: 2 lettere maiuscole (es. "IM"); qualsiasi altro valore → null.
function normalizeProvince(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

router.get("/pickup-locations", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(pickupLocationsTable)
      .orderBy(asc(pickupLocationsTable.sortOrder), asc(pickupLocationsTable.name));
    res.json(rows);
  } catch (err) {
    console.error("Pickup locations fetch failed:", err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.post("/pickup-locations", async (req, res) => {
  try {
    const { name, city, address, province, sortOrder, active, mapsUrl, notes } = req.body as {
      name?: string;
      city?: string;
      address?: string;
      province?: string | null;
      sortOrder?: number;
      active?: boolean;
      mapsUrl?: string | null;
      notes?: string | null;
    };
    if (!name?.trim()) {
      res.status(400).json({ error: "Il nome è obbligatorio." });
      return;
    }
    if (!city?.trim()) {
      res.status(400).json({ error: "La città è obbligatoria." });
      return;
    }
    const [row] = await db
      .insert(pickupLocationsTable)
      .values({
        name: name.trim(),
        city: city.trim(),
        address: address?.trim() || null,
        province: normalizeProvince(province),
        sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
        active: active !== false,
        mapsUrl: mapsUrl?.trim() || null,
        notes: notes?.trim() || null,
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    console.error("Pickup location create failed:", err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.patch("/pickup-locations/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, city, address, province, sortOrder, active, mapsUrl, notes } = req.body as {
      name?: string;
      city?: string;
      address?: string | null;
      province?: string | null;
      sortOrder?: number;
      active?: boolean;
      mapsUrl?: string | null;
      notes?: string | null;
    };
    const updates: Partial<typeof pickupLocationsTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (name !== undefined) updates.name = name.trim();
    if (city !== undefined) updates.city = city.trim();
    if (address !== undefined) updates.address = address?.trim() || null;
    if (province !== undefined) updates.province = normalizeProvince(province);
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    if (active !== undefined) updates.active = active === true;
    if (mapsUrl !== undefined) updates.mapsUrl = mapsUrl?.trim() || null;
    if (notes !== undefined) updates.notes = notes?.trim() || null;

    const [row] = await db
      .update(pickupLocationsTable)
      .set(updates)
      .where(eq(pickupLocationsTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Punto di raccolta non trovato." });
      return;
    }
    res.json(row);
  } catch (err) {
    console.error("Pickup location update failed:", err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.delete("/pickup-locations/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [usage] = await db
      .select({ n: count() })
      .from(excursionPickupPointsTable)
      .where(eq(excursionPickupPointsTable.pickupLocationId, id));
    if (Number(usage.n) > 0) {
      res.status(409).json({
        error: "Il punto di raccolta è in uso in una o più gite e non può essere eliminato.",
      });
      return;
    }
    const [deleted] = await db
      .delete(pickupLocationsTable)
      .where(eq(pickupLocationsTable.id, id))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Punto di raccolta non trovato." });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("Pickup location delete failed:", err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

export default router;
