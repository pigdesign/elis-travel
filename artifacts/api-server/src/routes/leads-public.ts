import { Router } from "express";
import { db } from "@workspace/db";
import { leadsTable, leadNotesTable, offersTable, excursionsTable, excursionBookingsTable, customersTable } from "@workspace/db/schema";
import { eq, and, ne, desc, sql, or } from "drizzle-orm";
import {
  dispatchExcursionBookingEmails,
  dispatchExcursionBookingCancellationEmails,
} from "../services/excursion-booking-emails";
import { verifyBookingCancellationToken } from "../services/booking-cancellation-token";

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

router.post("/excursions/:id/book", async (req, res) => {
  try {
    const { id } = req.params;
    const { customerName, email, phone, seats, paymentType } = req.body as {
      customerName?: string;
      email?: string;
      phone?: string;
      seats?: number;
      paymentType?: string;
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
    const seatsNum = Number(seats);
    if (!Number.isInteger(seatsNum) || seatsNum < 1 || seatsNum > 10) {
      res.status(400).json({ error: "Numero posti non valido (1-10)." });
      return;
    }
    if (paymentType !== "deposit" && paymentType !== "full") {
      res.status(400).json({ error: "Tipo di pagamento non valido." });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const paymentStatus = paymentType === "full" ? "paid" : "deposit";

    const result = await db.transaction(async (tx) => {
      const updated = await tx
        .update(excursionsTable)
        .set({
          adherentsCount: sql`${excursionsTable.adherentsCount} + ${seatsNum}`,
          depositsCount:
            paymentStatus === "deposit"
              ? sql`${excursionsTable.depositsCount} + ${seatsNum}`
              : excursionsTable.depositsCount,
          balancesCount:
            paymentStatus === "paid"
              ? sql`${excursionsTable.balancesCount} + ${seatsNum}`
              : excursionsTable.balancesCount,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(excursionsTable.id, id),
            ne(excursionsTable.status, "completed"),
            ne(excursionsTable.status, "cancelled"),
            ne(excursionsTable.status, "archived"),
            or(
              eq(excursionsTable.currentCapacity, 0),
              sql`${excursionsTable.adherentsCount} + ${seatsNum} <= ${excursionsTable.currentCapacity}`,
            ),
          ),
        )
        .returning();

      if (updated.length === 0) {
        const [exists] = await tx
          .select({
            id: excursionsTable.id,
            status: excursionsTable.status,
            currentCapacity: excursionsTable.currentCapacity,
            adherentsCount: excursionsTable.adherentsCount,
          })
          .from(excursionsTable)
          .where(eq(excursionsTable.id, id))
          .limit(1);

        if (!exists) return { kind: "notfound" as const };
        if (
          exists.status === "completed" ||
          exists.status === "cancelled" ||
          exists.status === "archived"
        ) {
          return { kind: "closed" as const };
        }
        const remaining = (exists.currentCapacity ?? 0) - (exists.adherentsCount ?? 0);
        return { kind: "full" as const, remaining: Math.max(0, remaining) };
      }

      const [existingCustomer] = await tx
        .select({ id: customersTable.id })
        .from(customersTable)
        .where(eq(customersTable.email, normalizedEmail))
        .limit(1);

      const [booking] = await tx
        .insert(excursionBookingsTable)
        .values({
          excursionId: id,
          customerId: existingCustomer?.id ?? null,
          customerName: customerName.trim(),
          email: normalizedEmail,
          phone: phone?.trim() || null,
          seats: seatsNum,
          paymentStatus,
        })
        .returning();

      const [excursionDetails] = await tx
        .select({
          id: excursionsTable.id,
          name: excursionsTable.name,
          location: excursionsTable.location,
          date: excursionsTable.date,
          pricePerPerson: excursionsTable.pricePerPerson,
        })
        .from(excursionsTable)
        .where(eq(excursionsTable.id, id))
        .limit(1);

      return { kind: "ok" as const, booking, excursion: excursionDetails };
    });

    if (result.kind === "notfound") {
      res.status(404).json({ error: "Gita non trovata." });
      return;
    }
    if (result.kind === "closed") {
      res.status(400).json({ error: "Le prenotazioni per questa gita sono chiuse." });
      return;
    }
    if (result.kind === "full") {
      res.status(400).json({
        error:
          result.remaining <= 0
            ? "Posti esauriti per questa gita."
            : `Sono rimasti solo ${result.remaining} posti disponibili.`,
      });
      return;
    }

    if (result.excursion) {
      dispatchExcursionBookingEmails({
        bookingId: result.booking.id,
        customerName: customerName.trim(),
        customerEmail: normalizedEmail,
        customerPhone: phone?.trim() || null,
        seats: seatsNum,
        paymentType: paymentType as "deposit" | "full",
        excursion: {
          id: result.excursion.id,
          name: result.excursion.name,
          location: result.excursion.location,
          date: result.excursion.date,
          pricePerPerson: result.excursion.pricePerPerson,
        },
      });
    }

    res.status(201).json({
      id: result.booking.id,
      seats: result.booking.seats,
      paymentStatus: result.booking.paymentStatus,
      message:
        paymentStatus === "paid"
          ? "Prenotazione confermata. Ti contatteremo per perfezionare il pagamento."
          : "Prenotazione registrata con acconto. Ti contatteremo per i dettagli del pagamento.",
    });
  } catch (err) {
    console.error("Public excursion booking failed:", err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

function escapeHtmlSimple(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderCancellationPage(opts: {
  status: number;
  title: string;
  heading: string;
  body: string;
  showForm?: { actionUrl: string; submitLabel: string } | null;
}): { status: number; html: string } {
  const formBlock = opts.showForm
    ? `<form method="POST" action="${escapeHtmlSimple(opts.showForm.actionUrl)}" style="margin-top:24px;">
        <button type="submit" style="display:inline-block;padding:12px 20px;background:#c0392b;color:#fff;border:none;border-radius:6px;font-weight:600;font-size:16px;cursor:pointer;">${escapeHtmlSimple(opts.showForm.submitLabel)}</button>
      </form>`
    : "";
  const html = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtmlSimple(opts.title)}</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;background:#f5f5f5;margin:0;padding:24px;">
  <div style="max-width:560px;margin:40px auto;background:#fff;padding:32px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.06);">
    <h1 style="margin:0 0 16px;font-size:22px;">${escapeHtmlSimple(opts.heading)}</h1>
    <div style="color:#444;line-height:1.5;">${opts.body}</div>
    ${formBlock}
  </div>
</body></html>`;
  return { status: opts.status, html };
}

router.get("/excursions/bookings/:id/cancel", async (req, res) => {
  try {
    const { id } = req.params;
    const token = (req.query.token as string) || "";
    if (!verifyBookingCancellationToken(id, token)) {
      const page = renderCancellationPage({
        status: 403,
        title: "Link non valido",
        heading: "Link di annullamento non valido",
        body: "<p>Il link che hai usato non è valido o è stato manomesso. Contatta l'agenzia per assistenza.</p>",
      });
      res.status(page.status).type("text/html").send(page.html);
      return;
    }
    const [booking] = await db
      .select({
        id: excursionBookingsTable.id,
        seats: excursionBookingsTable.seats,
        cancelledAt: excursionBookingsTable.cancelledAt,
        excursionName: excursionsTable.name,
        excursionLocation: excursionsTable.location,
        excursionDate: excursionsTable.date,
      })
      .from(excursionBookingsTable)
      .innerJoin(
        excursionsTable,
        eq(excursionBookingsTable.excursionId, excursionsTable.id),
      )
      .where(eq(excursionBookingsTable.id, id))
      .limit(1);

    if (!booking) {
      const page = renderCancellationPage({
        status: 404,
        title: "Prenotazione non trovata",
        heading: "Prenotazione non trovata",
        body: "<p>Non abbiamo trovato la prenotazione richiesta. Potrebbe essere già stata rimossa.</p>",
      });
      res.status(page.status).type("text/html").send(page.html);
      return;
    }
    if (booking.cancelledAt) {
      const page = renderCancellationPage({
        status: 200,
        title: "Prenotazione già annullata",
        heading: "Prenotazione già annullata",
        body: `<p>Questa prenotazione per <strong>${escapeHtmlSimple(booking.excursionName)}</strong> risulta già annullata.</p>`,
      });
      res.status(page.status).type("text/html").send(page.html);
      return;
    }

    const dateLabel = (() => {
      try {
        const d = new Date(booking.excursionDate);
        if (Number.isNaN(d.getTime())) return booking.excursionDate;
        return d.toLocaleDateString("it-IT", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        });
      } catch {
        return booking.excursionDate;
      }
    })();

    const page = renderCancellationPage({
      status: 200,
      title: "Conferma annullamento",
      heading: "Conferma annullamento prenotazione",
      body: `
        <p>Stai per annullare la prenotazione per:</p>
        <ul>
          <li><strong>${escapeHtmlSimple(booking.excursionName)}</strong></li>
          <li>${escapeHtmlSimple(booking.excursionLocation)} — ${escapeHtmlSimple(dateLabel)}</li>
          <li>Posti: <strong>${booking.seats}</strong></li>
        </ul>
        <p>L'operazione non è reversibile. I posti torneranno disponibili per altri clienti.</p>
      `,
      showForm: {
        actionUrl: `/api/excursions/bookings/${encodeURIComponent(id)}/cancel?token=${encodeURIComponent(token)}`,
        submitLabel: "Conferma annullamento",
      },
    });
    res.status(page.status).type("text/html").send(page.html);
  } catch (err) {
    console.error("Cancellation page render failed:", err);
    res.status(500).type("text/plain").send("Errore interno del server.");
  }
});

router.post("/excursions/bookings/:id/cancel", async (req, res) => {
  try {
    const { id } = req.params;
    const token = ((req.query.token as string) || (req.body?.token as string) || "");
    if (!verifyBookingCancellationToken(id, token)) {
      const page = renderCancellationPage({
        status: 403,
        title: "Link non valido",
        heading: "Link di annullamento non valido",
        body: "<p>Il link che hai usato non è valido o è stato manomesso. Contatta l'agenzia per assistenza.</p>",
      });
      res.status(page.status).type("text/html").send(page.html);
      return;
    }

    const result = await db.transaction(async (tx) => {
      const [booking] = await tx
        .select({
          id: excursionBookingsTable.id,
          excursionId: excursionBookingsTable.excursionId,
          seats: excursionBookingsTable.seats,
          paymentStatus: excursionBookingsTable.paymentStatus,
          cancelledAt: excursionBookingsTable.cancelledAt,
          customerName: excursionBookingsTable.customerName,
          email: excursionBookingsTable.email,
          phone: excursionBookingsTable.phone,
        })
        .from(excursionBookingsTable)
        .where(eq(excursionBookingsTable.id, id))
        .limit(1);

      if (!booking) return { kind: "notfound" as const };
      if (booking.cancelledAt) return { kind: "already" as const, booking };

      const now = new Date();
      const updatedBooking = await tx
        .update(excursionBookingsTable)
        .set({ cancelledAt: now, updatedAt: now })
        .where(
          and(
            eq(excursionBookingsTable.id, id),
            sql`${excursionBookingsTable.cancelledAt} IS NULL`,
          ),
        )
        .returning();

      if (updatedBooking.length === 0) {
        return { kind: "already" as const, booking };
      }

      const isDeposit = booking.paymentStatus === "deposit";
      const isPaid = booking.paymentStatus === "paid";

      const [excursion] = await tx
        .update(excursionsTable)
        .set({
          adherentsCount: sql`GREATEST(${excursionsTable.adherentsCount} - ${booking.seats}, 0)`,
          depositsCount: isDeposit
            ? sql`GREATEST(${excursionsTable.depositsCount} - ${booking.seats}, 0)`
            : excursionsTable.depositsCount,
          balancesCount: isPaid
            ? sql`GREATEST(${excursionsTable.balancesCount} - ${booking.seats}, 0)`
            : excursionsTable.balancesCount,
          updatedAt: now,
        })
        .where(eq(excursionsTable.id, booking.excursionId))
        .returning({
          id: excursionsTable.id,
          name: excursionsTable.name,
          location: excursionsTable.location,
          date: excursionsTable.date,
        });

      return { kind: "ok" as const, booking, excursion };
    });

    if (result.kind === "notfound") {
      const page = renderCancellationPage({
        status: 404,
        title: "Prenotazione non trovata",
        heading: "Prenotazione non trovata",
        body: "<p>Non abbiamo trovato la prenotazione richiesta.</p>",
      });
      res.status(page.status).type("text/html").send(page.html);
      return;
    }
    if (result.kind === "already") {
      const page = renderCancellationPage({
        status: 200,
        title: "Prenotazione già annullata",
        heading: "Prenotazione già annullata",
        body: "<p>Questa prenotazione risulta già annullata.</p>",
      });
      res.status(page.status).type("text/html").send(page.html);
      return;
    }

    if (result.excursion) {
      dispatchExcursionBookingCancellationEmails({
        bookingId: result.booking.id,
        customerName: result.booking.customerName,
        customerEmail: result.booking.email ?? null,
        customerPhone: result.booking.phone ?? null,
        seats: result.booking.seats,
        excursion: {
          id: result.excursion.id,
          name: result.excursion.name,
          location: result.excursion.location,
          date: result.excursion.date,
        },
      });
    }

    const excursionName = result.excursion?.name || "la tua gita";
    const page = renderCancellationPage({
      status: 200,
      title: "Prenotazione annullata",
      heading: "Prenotazione annullata",
      body: `<p>La prenotazione per <strong>${escapeHtmlSimple(excursionName)}</strong> è stata annullata correttamente. Riceverai una email di conferma.</p>`,
    });
    res.status(page.status).type("text/html").send(page.html);
  } catch (err) {
    console.error("Booking cancellation failed:", err);
    res.status(500).type("text/plain").send("Errore interno del server.");
  }
});

export default router;
