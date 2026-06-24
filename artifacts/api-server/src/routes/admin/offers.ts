import { Router } from "express";
import { db } from "@workspace/db";
import { offersTable, offerImagesTable } from "@workspace/db/schema";
import { eq, desc, asc } from "drizzle-orm";

const router = Router();

const ALLOWED_CATEGORIES = new Set(["crociera", "vacanza"]);

function sanitizeCategory(value: unknown): string | null {
  if (!value || typeof value !== "string") return null;
  return ALLOWED_CATEGORIES.has(value) ? value : null;
}

const MUTABLE_FIELDS = [
  "name", "destination", "tourOperator", "status",
  "validFrom", "validTo", "baseFormula", "departureCity",
  "durationDays", "durationNights", "period", "publicPrice",
  "advertisingText", "servicesIncluded", "servicesExcluded",
  "highlights", "pricingNotes", "internalNotes", "publicLink",
  "mainSource", "coverImageUrl", "schedule", "category", "featured", "lastMinute",
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
        coverImageUrl: (body.coverImageUrl as string) ?? null,
        schedule: body.schedule ?? null,
        category: sanitizeCategory(body.category),
        featured: typeof body.featured === "boolean" ? body.featured : false,
        lastMinute: typeof body.lastMinute === "boolean" ? body.lastMinute : false,
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
    if ("category" in allowed) allowed.category = sanitizeCategory(allowed.category);

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

// --- Gallery immagini offerta ---

router.get("/offers/:id/images", async (req, res) => {
  try {
    const { id } = req.params;
    const images = await db
      .select()
      .from(offerImagesTable)
      .where(eq(offerImagesTable.offerId, id))
      .orderBy(asc(offerImagesTable.sortOrder), asc(offerImagesTable.createdAt));
    res.json(images);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.post("/offers/:id/images", async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body as { imageUrl?: string; sortOrder?: number };

    if (!body.imageUrl || typeof body.imageUrl !== "string") {
      res.status(400).json({ error: "imageUrl è obbligatorio." });
      return;
    }

    const existing = await db
      .select({ count: offerImagesTable.id })
      .from(offerImagesTable)
      .where(eq(offerImagesTable.offerId, id));

    const [created] = await db
      .insert(offerImagesTable)
      .values({
        offerId: id,
        imageUrl: body.imageUrl,
        sortOrder: body.sortOrder ?? existing.length,
      })
      .returning();

    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.delete("/offers/:id/images/:imageId", async (req, res) => {
  try {
    const { id, imageId } = req.params;
    const [deleted] = await db
      .delete(offerImagesTable)
      .where(eq(offerImagesTable.id, imageId))
      .returning();

    if (!deleted || deleted.offerId !== id) {
      res.status(404).json({ error: "Immagine non trovata." });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.patch("/offers/:id/images/reorder", async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body as { order?: string[] };

    if (!Array.isArray(body.order)) {
      res.status(400).json({ error: "order deve essere un array di ID." });
      return;
    }

    await Promise.all(
      body.order.map((imageId, idx) =>
        db
          .update(offerImagesTable)
          .set({ sortOrder: idx })
          .where(eq(offerImagesTable.id, imageId))
      )
    );

    const images = await db
      .select()
      .from(offerImagesTable)
      .where(eq(offerImagesTable.offerId, id))
      .orderBy(asc(offerImagesTable.sortOrder), asc(offerImagesTable.createdAt));

    res.json(images);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

export default router;
