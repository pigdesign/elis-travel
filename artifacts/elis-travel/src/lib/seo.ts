import { useEffect } from "react";

export interface SeoOptions {
  title: string;
  description?: string;
  image?: string;
  type?: "website" | "article" | "product";
  canonicalPath?: string;
  noindex?: boolean;
}

const SITE_NAME = "Elis Travel";
const DEFAULT_DESCRIPTION =
  "Elis Travel: agenzia viaggi con offerte, pacchetti vacanza e gite organizzate. Richiedi informazioni e prenota la tua prossima esperienza.";
const DEFAULT_IMAGE = "/opengraph.jpg";

function setMetaByName(name: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setMetaByProperty(property: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(
    `meta[property="${property}"]`,
  );
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (typeof window === "undefined") return pathOrUrl;
  const origin = window.location.origin;
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${origin}${path}`;
}

export function useSeo(opts: SeoOptions) {
  const {
    title,
    description = DEFAULT_DESCRIPTION,
    image = DEFAULT_IMAGE,
    type = "website",
    canonicalPath,
    noindex = false,
  } = opts;

  useEffect(() => {
    const fullTitle =
      title === SITE_NAME ? title : `${title} | ${SITE_NAME}`;
    document.title = fullTitle;

    const url =
      typeof window !== "undefined"
        ? canonicalPath
          ? absoluteUrl(canonicalPath)
          : window.location.href.split("?")[0]
        : canonicalPath ?? "";
    const imageUrl = absoluteUrl(image);

    setMetaByName("description", description);
    setMetaByName("robots", noindex ? "noindex, nofollow" : "index, follow");

    setMetaByProperty("og:site_name", SITE_NAME);
    setMetaByProperty("og:type", type);
    setMetaByProperty("og:title", fullTitle);
    setMetaByProperty("og:description", description);
    setMetaByProperty("og:image", imageUrl);
    if (url) setMetaByProperty("og:url", url);
    setMetaByProperty("og:locale", "it_IT");

    setMetaByName("twitter:card", "summary_large_image");
    setMetaByName("twitter:title", fullTitle);
    setMetaByName("twitter:description", description);
    setMetaByName("twitter:image", imageUrl);

    if (url) setLink("canonical", url);
  }, [title, description, image, type, canonicalPath, noindex]);
}

export function slugify(input: string): string {
  return input
    .toString()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function extractIdFromSlug(param: string): string {
  const decoded = decodeURIComponent(param);
  const m = decoded.match(UUID_RE);
  return m ? m[0] : decoded;
}

export function buildSlugUrl(
  base: "offerte" | "gite",
  id: string,
  name?: string | null,
): string {
  const slug = name ? slugify(name) : "";
  return slug ? `/${base}/${slug}-${id}` : `/${base}/${id}`;
}

export function truncate(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + "…";
}
