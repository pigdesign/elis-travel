import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "..", "dist", "public");
const indexPath = path.join(distDir, "index.html");

const SITE_NAME = "Elis Travel";
const SITE_URL = (process.env.PUBLIC_SITE_URL || "").replace(/\/$/, "");
const DEFAULT_DESCRIPTION =
  "Elis Travel: agenzia viaggi con offerte, pacchetti vacanza e gite organizzate. Richiedi informazioni e prenota la tua prossima esperienza.";
const DEFAULT_IMAGE = "/opengraph.jpg";

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

function htmlEscape(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function truncate(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + "…";
}

interface SeoMeta {
  title: string;
  description: string;
  image?: string;
  type?: "website" | "product" | "article";
  canonicalPath: string;
}

function injectSeo(template: string, seo: SeoMeta): string {
  const fullTitle = seo.title === SITE_NAME ? seo.title : `${seo.title} | ${SITE_NAME}`;
  const image = seo.image || DEFAULT_IMAGE;
  const imageUrl = SITE_URL && image.startsWith("/") ? `${SITE_URL}${image}` : image;
  const canonical = SITE_URL ? `${SITE_URL}${seo.canonicalPath}` : seo.canonicalPath;
  const type = seo.type || "website";

  const metaBlock = `    <title>${htmlEscape(fullTitle)}</title>
    <meta name="description" content="${htmlEscape(seo.description)}" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${htmlEscape(canonical)}" />
    <meta property="og:site_name" content="${htmlEscape(SITE_NAME)}" />
    <meta property="og:type" content="${type}" />
    <meta property="og:title" content="${htmlEscape(fullTitle)}" />
    <meta property="og:description" content="${htmlEscape(seo.description)}" />
    <meta property="og:image" content="${htmlEscape(imageUrl)}" />
    <meta property="og:url" content="${htmlEscape(canonical)}" />
    <meta property="og:locale" content="it_IT" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${htmlEscape(fullTitle)}" />
    <meta name="twitter:description" content="${htmlEscape(seo.description)}" />
    <meta name="twitter:image" content="${htmlEscape(imageUrl)}" />`;

  let out = template;
  out = out.replace(/<title>[\s\S]*?<\/title>\s*/i, "");
  out = out.replace(/<meta\s+name="description"[^>]*>\s*/gi, "");
  out = out.replace(/<meta\s+name="robots"[^>]*>\s*/gi, "");
  out = out.replace(/<link\s+rel="canonical"[^>]*>\s*/gi, "");
  out = out.replace(/<meta\s+property="og:[^"]+"[^>]*>\s*/gi, "");
  out = out.replace(/<meta\s+name="twitter:[^"]+"[^>]*>\s*/gi, "");
  out = out.replace(/(<head[^>]*>)/i, `$1\n${metaBlock}\n`);
  return out;
}

async function writePage(routePath: string, html: string) {
  const targetDir =
    routePath === "/" ? distDir : path.join(distDir, ...routePath.split("/").filter(Boolean));
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(path.join(targetDir, "index.html"), html, "utf8");
}

async function main() {
  const template = await fs.readFile(indexPath, "utf8");

  const staticPages: Array<{ path: string; seo: SeoMeta }> = [
    {
      path: "/",
      seo: {
        title: "Elis Travel — Agenzia viaggi, offerte e gite organizzate",
        description: DEFAULT_DESCRIPTION,
        canonicalPath: "/",
      },
    },
    {
      path: "/offerte",
      seo: {
        title: "Offerte viaggio",
        description:
          "Esplora le offerte viaggio di Elis Travel: pacchetti vacanza, voli e soggiorni in Italia e nel mondo. Richiedi informazioni in un click.",
        canonicalPath: "/offerte",
      },
    },
    {
      path: "/gite",
      seo: {
        title: "Gite ed escursioni",
        description:
          "Gite ed escursioni organizzate da Elis Travel: esperienze in giornata e weekend in compagnia. Trova quella che fa per te.",
        canonicalPath: "/gite",
      },
    },
    {
      path: "/contatti",
      seo: {
        title: "Contatti",
        description:
          "Contatta Elis Travel per informazioni su offerte, gite e viaggi su misura. Compila il form: ti rispondiamo al più presto.",
        canonicalPath: "/contatti",
      },
    },
  ];

  let pageCount = 0;
  for (const p of staticPages) {
    await writePage(p.path, injectSeo(template, p.seo));
    pageCount++;
  }

  if (!process.env.DATABASE_URL) {
    console.warn(
      "[prerender] DATABASE_URL non impostato: salto la generazione delle pagine di dettaglio.",
    );
    console.log(`[prerender] Generate ${pageCount} pagine pre-renderizzate (solo statiche).`);
    return;
  }

  try {
    const [{ db }, schema, drizzle] = await Promise.all([
      import("@workspace/db"),
      import("@workspace/db/schema"),
      import("drizzle-orm"),
    ]);
    const { offersTable, excursionsTable } = schema;
    const { eq } = drizzle;
    const offers = await db
      .select({
        id: offersTable.id,
        name: offersTable.name,
        destination: offersTable.destination,
        advertisingText: offersTable.advertisingText,
        highlights: offersTable.highlights,
        period: offersTable.period,
      })
      .from(offersTable)
      .where(eq(offersTable.status, "published"));

    for (const o of offers) {
      const slug = slugify(o.name);
      const segment = slug ? `${slug}-${o.id}` : o.id;
      const seoTitle = `${o.name}${o.destination ? ` — ${o.destination}` : ""}`;
      const description = truncate(
        o.advertisingText ||
          o.highlights ||
          [o.name, o.destination, o.period].filter(Boolean).join(" — ") ||
          "Scopri questa offerta viaggio di Elis Travel.",
      );
      await writePage(`/offerte/${segment}`, injectSeo(template, {
        title: seoTitle,
        description,
        type: "product",
        canonicalPath: `/offerte/${segment}`,
      }));
      pageCount++;
    }

    const excursions = await db
      .select({
        id: excursionsTable.id,
        name: excursionsTable.name,
        location: excursionsTable.location,
        date: excursionsTable.date,
      })
      .from(excursionsTable)
      .where(eq(excursionsTable.status, "confirmed"));

    for (const e of excursions) {
      const slug = slugify(e.name);
      const segment = slug ? `${slug}-${e.id}` : e.id;
      const seoTitle = `${e.name}${e.location ? ` — ${e.location}` : ""}`;
      const dateLabel = e.date
        ? new Date(e.date).toLocaleDateString("it-IT", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : null;
      const description = truncate(
        [
          e.name,
          e.location ? `a ${e.location}` : null,
          dateLabel ? `il ${dateLabel}` : null,
          "— gita organizzata da Elis Travel. Richiedi info e prenota il tuo posto.",
        ]
          .filter(Boolean)
          .join(" "),
      );
      await writePage(`/gite/${segment}`, injectSeo(template, {
        title: seoTitle,
        description,
        type: "product",
        canonicalPath: `/gite/${segment}`,
      }));
      pageCount++;
    }
  } catch (err) {
    console.warn(
      "[prerender] Database non disponibile, prerendering solo per pagine statiche.",
      err instanceof Error ? err.message : err,
    );
  }

  console.log(`[prerender] Generate ${pageCount} pagine pre-renderizzate in ${distDir}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[prerender] Errore:", err);
    process.exit(1);
  });
