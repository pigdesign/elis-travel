import { Router } from "express";
import { db } from "@workspace/db";
import { leadsTable, leadNotesTable, offersTable, excursionsTable } from "@workspace/db/schema";
import { eq, and, ne, desc } from "drizzle-orm";

const router = Router();

function slugify(input: string): string {
  return input
    .toString()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function getSiteOrigin(req: import("express").Request): string {
  const envOrigin = process.env.PUBLIC_SITE_URL;
  if (envOrigin) return envOrigin.replace(/\/$/, "");
  const forwardedHost = (req.headers["x-forwarded-host"] as string) || req.headers.host || "";
  const forwardedProto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  return `${forwardedProto}://${forwardedHost}`;
}

router.get("/sitemap.xml", async (req, res) => {
  try {
    const origin = getSiteOrigin(req);
    const offers = await db
      .select({ id: offersTable.id, name: offersTable.name, updatedAt: offersTable.updatedAt })
      .from(offersTable)
      .where(eq(offersTable.status, "published"));
    const excursions = await db
      .select({ id: excursionsTable.id, name: excursionsTable.name, updatedAt: excursionsTable.updatedAt })
      .from(excursionsTable)
      .where(eq(excursionsTable.status, "confirmed"));

    const staticUrls = [
      { loc: "/", priority: "1.0", changefreq: "daily" },
      { loc: "/offerte", priority: "0.9", changefreq: "daily" },
      { loc: "/gite", priority: "0.9", changefreq: "daily" },
      { loc: "/contatti", priority: "0.5", changefreq: "monthly" },
    ];

    const xmlEscape = (s: string) =>
      s.replace(/[<>&'"]/g, (c) =>
        c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === "'" ? "&apos;" : "&quot;",
      );

    const urls: string[] = [];
    for (const u of staticUrls) {
      urls.push(
        `  <url><loc>${xmlEscape(origin + u.loc)}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`,
      );
    }
    for (const o of offers) {
      const slug = slugify(o.name);
      const path = slug ? `/offerte/${slug}-${o.id}` : `/offerte/${o.id}`;
      const lastmod = o.updatedAt ? new Date(o.updatedAt).toISOString() : undefined;
      urls.push(
        `  <url><loc>${xmlEscape(origin + path)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}<changefreq>weekly</changefreq><priority>0.8</priority></url>`,
      );
    }
    for (const e of excursions) {
      const slug = slugify(e.name);
      const path = slug ? `/gite/${slug}-${e.id}` : `/gite/${e.id}`;
      const lastmod = e.updatedAt ? new Date(e.updatedAt).toISOString() : undefined;
      urls.push(
        `  <url><loc>${xmlEscape(origin + path)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}<changefreq>weekly</changefreq><priority>0.8</priority></url>`,
      );
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=600");
    res.send(xml);
  } catch (err) {
    console.error("Sitemap generation failed:", err);
    res.status(500).type("text/plain").send("Sitemap unavailable");
  }
});

router.get("/catalog/products", async (_req, res) => {
  try {
    const offers = await db
      .select({ id: offersTable.id, name: offersTable.name, destination: offersTable.destination, coverImageUrl: offersTable.coverImageUrl })
      .from(offersTable)
      .where(eq(offersTable.status, "published"))
      .orderBy(desc(offersTable.createdAt));

    const excursions = await db
      .select({ id: excursionsTable.id, name: excursionsTable.name, location: excursionsTable.location, date: excursionsTable.date, coverImageUrl: excursionsTable.coverImageUrl })
      .from(excursionsTable)
      .where(eq(excursionsTable.status, "confirmed"))
      .orderBy(desc(excursionsTable.date));

    res.json({ offers, excursions });
  } catch (err) {
    console.error("Public catalog fetch failed:", err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.get("/catalog/products/offers/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [offer] = await db
      .select({
        id: offersTable.id,
        name: offersTable.name,
        destination: offersTable.destination,
        tourOperator: offersTable.tourOperator,
        validFrom: offersTable.validFrom,
        validTo: offersTable.validTo,
        baseFormula: offersTable.baseFormula,
        departureCity: offersTable.departureCity,
        durationDays: offersTable.durationDays,
        durationNights: offersTable.durationNights,
        period: offersTable.period,
        publicPrice: offersTable.publicPrice,
        advertisingText: offersTable.advertisingText,
        servicesIncluded: offersTable.servicesIncluded,
        servicesExcluded: offersTable.servicesExcluded,
        highlights: offersTable.highlights,
        publicLink: offersTable.publicLink,
        coverImageUrl: offersTable.coverImageUrl,
        status: offersTable.status,
      })
      .from(offersTable)
      .where(and(eq(offersTable.id, id), eq(offersTable.status, "published")))
      .limit(1);

    if (!offer) {
      res.status(404).json({ error: "Offerta non trovata." });
      return;
    }

    const { status: _status, ...publicOffer } = offer;
    res.json(publicOffer);
  } catch (err) {
    console.error("Public offer detail fetch failed:", err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.get("/catalog/products/excursions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [excursion] = await db
      .select({
        id: excursionsTable.id,
        name: excursionsTable.name,
        location: excursionsTable.location,
        date: excursionsTable.date,
        pricePerPerson: excursionsTable.pricePerPerson,
        currentCapacity: excursionsTable.currentCapacity,
        minThreshold: excursionsTable.minThreshold,
        adherentsCount: excursionsTable.adherentsCount,
        coverImageUrl: excursionsTable.coverImageUrl,
        status: excursionsTable.status,
      })
      .from(excursionsTable)
      .where(and(eq(excursionsTable.id, id), eq(excursionsTable.status, "confirmed")))
      .limit(1);

    if (!excursion) {
      res.status(404).json({ error: "Gita non trovata." });
      return;
    }

    const { status: _status, ...publicExcursion } = excursion;
    res.json(publicExcursion);
  } catch (err) {
    console.error("Public excursion detail fetch failed:", err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.post("/leads", async (req, res) => {
  try {
    const {
      customerName,
      email,
      phone,
      message,
      productRef,
      offerId,
      excursionId,
    } = req.body as {
      customerName?: string;
      email?: string;
      phone?: string;
      message?: string;
      productRef?: string | null;
      offerId?: string | null;
      excursionId?: string | null;
    };

    if (!customerName?.trim() || !email?.trim()) {
      res.status(400).json({ error: "Nome e email sono obbligatori." });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      res.status(400).json({ error: "Indirizzo email non valido." });
      return;
    }

    if (customerName.length > 200 || email.length > 200) {
      res.status(400).json({ error: "Nome o email troppo lunghi." });
      return;
    }
    if (phone && phone.length > 40) {
      res.status(400).json({ error: "Numero di telefono troppo lungo." });
      return;
    }
    if (message && message.length > 2000) {
      res.status(400).json({ error: "Messaggio troppo lungo (max 2000 caratteri)." });
      return;
    }

    let parsedOfferId: string | null = offerId ?? null;
    let parsedExcursionId: string | null = excursionId ?? null;
    if (productRef && typeof productRef === "string" && productRef.includes(":")) {
      const [kind, refId] = productRef.split(":");
      if (kind === "offer") parsedOfferId = refId;
      else if (kind === "excursion") parsedExcursionId = refId;
    }

    let resolvedOfferId: string | null = null;
    let resolvedExcursionId: string | null = null;
    let type: "generic" | "offer" | "excursion" = "generic";

    if (parsedOfferId) {
      const [offer] = await db
        .select({ id: offersTable.id })
        .from(offersTable)
        .where(and(eq(offersTable.id, parsedOfferId), eq(offersTable.status, "published")))
        .limit(1);
      if (offer) {
        resolvedOfferId = offer.id;
        type = "offer";
      }
    } else if (parsedExcursionId) {
      const [excursion] = await db
        .select({ id: excursionsTable.id })
        .from(excursionsTable)
        .where(
          and(
            eq(excursionsTable.id, parsedExcursionId),
            ne(excursionsTable.status, "archived"),
            ne(excursionsTable.status, "completed"),
          ),
        )
        .limit(1);
      if (excursion) {
        resolvedExcursionId = excursion.id;
        type = "excursion";
      }
    }

    const [lead] = await db
      .insert(leadsTable)
      .values({
        customerName: customerName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        offerId: resolvedOfferId,
        excursionId: resolvedExcursionId,
        type,
        status: "new",
        channel: "website",
      })
      .returning();

    if (message?.trim()) {
      await db.insert(leadNotesTable).values({
        leadId: lead.id,
        text: `Messaggio dal form contatti:\n${message.trim()}`,
        authorName: customerName.trim(),
      });
    }

    res.status(201).json({
      id: lead.id,
      message: "Richiesta ricevuta. Ti contatteremo al più presto.",
    });
  } catch (err) {
    console.error("Public lead creation failed:", err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

export default router;
