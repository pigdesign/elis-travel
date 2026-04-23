import { Router } from "express";
import { db } from "@workspace/db";
import { offersTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

const router = Router();

const MUTABLE_FIELDS = [
  "name", "destination", "tourOperator", "status",
  "validFrom", "validTo", "baseFormula", "departureCity",
  "durationDays", "durationNights", "period", "publicPrice",
  "advertisingText", "servicesIncluded", "servicesExcluded",
  "highlights", "pricingNotes", "internalNotes", "publicLink",
  "mainSource",
] as const;

function pickMutable(body: Record<string, unknown>) {
  const allowed: Record<string, unknown> = {};
  for (const field of MUTABLE_FIELDS) {
    if (field in body) allowed[field] = body[field];
  }
  return allowed;
}

router.get("/offers", async (_req, res) => {
  try {
    const offers = await db
      .select()
      .from(offersTable)
      .orderBy(desc(offersTable.createdAt));
    res.json(offers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.post("/offers", async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;

    const [created] = await db
      .insert(offersTable)
      .values({
        name: (body.name as string) ?? "Nuova offerta",
        destination: (body.destination as string) ?? "",
        tourOperator: (body.tourOperator as string) ?? null,
        status: (body.status as string) ?? "draft",
        validFrom: body.validFrom ? new Date(body.validFrom as string) : null,
        validTo: body.validTo ? new Date(body.validTo as string) : null,
        baseFormula: (body.baseFormula as string) ?? null,
        departureCity: (body.departureCity as string) ?? null,
        durationDays: body.durationDays != null ? Number(body.durationDays) : null,
        durationNights: body.durationNights != null ? Number(body.durationNights) : null,
        period: (body.period as string) ?? null,
        publicPrice: body.publicPrice != null ? String(body.publicPrice) : null,
        advertisingText: (body.advertisingText as string) ?? null,
        servicesIncluded: (body.servicesIncluded as string) ?? null,
        servicesExcluded: (body.servicesExcluded as string) ?? null,
        highlights: (body.highlights as string) ?? null,
        pricingNotes: (body.pricingNotes as string) ?? null,
        internalNotes: (body.internalNotes as string) ?? null,
        publicLink: (body.publicLink as string) ?? null,
        mainSource: (body.mainSource as string) ?? null,
        leadsCount: 0,
      })
      .returning();

    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.get("/offers/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [offer] = await db
      .select()
      .from(offersTable)
      .where(eq(offersTable.id, id))
      .limit(1);

    if (!offer) {
      res.status(404).json({ error: "Offerta non trovata." });
      return;
    }

    res.json(offer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.patch("/offers/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;
    const allowed = pickMutable(body) as Partial<typeof offersTable.$inferInsert>;

    if (allowed.validFrom) allowed.validFrom = new Date(allowed.validFrom as unknown as string);
    if (allowed.validTo) allowed.validTo = new Date(allowed.validTo as unknown as string);

    const [updated] = await db
      .update(offersTable)
      .set({ ...allowed, updatedAt: new Date() })
      .where(eq(offersTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Offerta non trovata." });
      return;
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.delete("/offers/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [deleted] = await db
      .delete(offersTable)
      .where(eq(offersTable.id, id))
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "Offerta non trovata." });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.post("/offers/:id/duplicate", async (req, res) => {
  try {
    const { id } = req.params;
    const [original] = await db
      .select()
      .from(offersTable)
      .where(eq(offersTable.id, id))
      .limit(1);

    if (!original) {
      res.status(404).json({ error: "Offerta non trovata." });
      return;
    }

    const { id: _id, createdAt: _ca, updatedAt: _ua, leadsCount: _lc, lastInterestAt: _lia, ...rest } = original;

    const [duplicated] = await db
      .insert(offersTable)
      .values({
        ...rest,
        name: `${original.name} (copia)`,
        status: "draft",
        leadsCount: 0,
        lastInterestAt: null,
      })
      .returning();

    res.status(201).json(duplicated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

export default router;
