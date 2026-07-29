import type {
  ExcursionDetail,
  ExcursionPickupPoint,
  OfferDetail,
  PublicExcursionDetail,
  ScheduleDay,
  SettingsResponse,
} from "@workspace/api-client-react";
import type { OfferGalleryImage } from "@workspace/api-client-react";
import { POSTER_THEMES, type PosterKind, type PosterTheme } from "./theme";

/** Riga della timeline giorni mostrata in copertina e nelle pagine interne. */
export interface PosterDay {
  dayNumber: number;
  /** Riga arancio: data calcolata (gite) o titolo giornata (offerte). */
  accentLine: string;
  /** Riga bianca: titolo giornata o sintesi attività. */
  mainLine: string;
  imageUrl: string | null;
  activities: { time: string | null; title: string; description: string | null }[];
}

export interface PosterPickupPoint {
  name: string;
  city: string;
  address: string | null;
  time: string | null;
}

/**
 * Modello unificato della locandina: normalizza gite (excursions) e
 * offerte (offers, categoria crociera|vacanza) in un'unica struttura
 * consumata dai template di copertina e pagine interne.
 */
export interface PosterModel {
  kind: PosterKind;
  theme: PosterTheme;
  title: string;
  /** Kicker verde, es. "GITA 3 GIORNI". */
  kicker: string;
  /** Testo riga data, es. "DAL 17 AL 19 APRILE 2026" (modificabile nel form). */
  dateLabel: string;
  /** Cifra del cartellino (es. "520€" o "DA 899€"); null = quota su richiesta. */
  priceLabel: string | null;
  coverImageUrl: string | null;
  days: PosterDay[];
  highlights: string[];
  included: string[];
  excluded: string[];
  /** Descrizione estesa per le pagine interne. */
  description: string | null;
  pickupPoints: PosterPickupPoint[];
  galleryImages: string[];
  /** Blocco "come prenotare" (pagine interne), da settings. */
  payment: {
    depositPercentage: string | null;
    iban: string | null;
    beneficiary: string | null;
    bank: string | null;
    notes: string | null;
  } | null;
}

const MONTHS_IT = [
  "GENNAIO", "FEBBRAIO", "MARZO", "APRILE", "MAGGIO", "GIUGNO",
  "LUGLIO", "AGOSTO", "SETTEMBRE", "OTTOBRE", "NOVEMBRE", "DICEMBRE",
];
const WEEKDAYS_IT = [
  "DOMENICA", "LUNEDÌ", "MARTEDÌ", "MERCOLEDÌ", "GIOVEDÌ", "VENERDÌ", "SABATO",
];

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** "VENERDÌ 17 APRILE" */
function formatWeekdayDate(d: Date): string {
  return `${WEEKDAYS_IT[d.getDay()]} ${d.getDate()} ${MONTHS_IT[d.getMonth()]}`;
}

/** "17 APRILE 2026" */
function formatLongDate(d: Date): string {
  return `${d.getDate()} ${MONTHS_IT[d.getMonth()]} ${d.getFullYear()}`;
}

/** "DAL 17 AL 19 APRILE 2026" (o data singola se il range è di un giorno). */
export function formatDateRange(start: Date, end: Date): string {
  if (start.getTime() === end.getTime()) {
    return `${WEEKDAYS_IT[start.getDay()]} ${formatLongDate(start)}`;
  }
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `DAL ${start.getDate()} AL ${end.getDate()} ${MONTHS_IT[start.getMonth()]} ${start.getFullYear()}`;
  }
  return `DAL ${formatLongDate(start)} AL ${formatLongDate(end)}`;
}

/** "520€", "1.250€"; null se il prezzo manca o non è un numero. */
export function formatPosterPrice(value?: string | null): string | null {
  if (!value) return null;
  const n = Number(value);
  if (Number.isNaN(n) || n <= 0) return null;
  const formatted = new Intl.NumberFormat("it-IT", {
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
  return `${formatted}€`;
}

function splitLines(text?: string | null): string[] {
  return (text ?? "")
    .split("\n")
    .map((line) => line.trim().replace(/^[-•▪]\s*/, ""))
    .filter(Boolean);
}

function summarizeActivities(day: ScheduleDay): string {
  const titles = day.activities.map((a) => a.title.trim()).filter(Boolean);
  return titles.slice(0, 3).join(" - ");
}

function normalizeDays(
  schedule: ScheduleDay[] | null | undefined,
  startDate: Date | null,
): PosterDay[] {
  const days = schedule ?? [];
  return days.map((day, i) => {
    const dayDate = startDate ? addDays(startDate, i) : null;
    const title = day.title?.trim() || "";
    const summary = summarizeActivities(day);
    return {
      dayNumber: day.dayNumber ?? i + 1,
      accentLine: dayDate ? formatWeekdayDate(dayDate) : title || `GIORNO ${i + 1}`,
      mainLine: dayDate ? title || summary : summary,
      imageUrl: day.imageUrl ?? null,
      activities: day.activities.map((a) => ({
        time: a.time?.trim() || null,
        title: a.title,
        description: a.description?.trim() || null,
      })),
    };
  });
}

function normalizePayment(settings?: SettingsResponse): PosterModel["payment"] {
  if (!settings) return null;
  const payment = {
    depositPercentage: settings.deposit_percentage ?? null,
    iban: settings.payment_iban ?? null,
    beneficiary: settings.payment_beneficiary ?? null,
    bank: settings.payment_bank ?? null,
    notes: settings.payment_notes ?? null,
  };
  const hasData = Object.values(payment).some((v) => v && v.trim().length > 0);
  return hasData ? payment : null;
}

/**
 * Campi della gita che finiscono in locandina, comuni al tipo admin
 * (ExcursionDetail) e a quello pubblico (PublicExcursionDetail).
 */
interface ExcursionPosterSource {
  name: string;
  date?: string | null;
  pricePerPerson?: string | null;
  coverImageUrl?: string | null;
  schedule?: ScheduleDay[] | null;
  included?: string | null;
  excluded?: string | null;
  generalInfo?: string | null;
}

/**
 * Corpo condiviso dalle due varianti (admin e pubblica): garantisce che la
 * locandina scaricata dal sito sia identica a quella stampata dall'admin.
 */
function buildExcursionPoster(
  excursion: ExcursionPosterSource,
  pickupPoints: PosterPickupPoint[],
  payment: PosterModel["payment"],
): PosterModel {
  const startDate = parseDate(excursion.date);
  const days = normalizeDays(excursion.schedule, startDate);
  const dayCount = Math.max(days.length, 1);
  const endDate = startDate ? addDays(startDate, dayCount - 1) : null;

  return {
    kind: "gita",
    theme: POSTER_THEMES.gita,
    title: excursion.name,
    kicker: dayCount > 1 ? `GITA ${dayCount} GIORNI` : "GITA DI 1 GIORNO",
    dateLabel: startDate && endDate ? formatDateRange(startDate, endDate) : "",
    priceLabel: formatPosterPrice(excursion.pricePerPerson),
    coverImageUrl: excursion.coverImageUrl ?? null,
    days,
    highlights: [],
    included: splitLines(excursion.included),
    excluded: splitLines(excursion.excluded),
    description: excursion.generalInfo?.trim() || null,
    pickupPoints,
    galleryImages: [],
    payment,
  };
}

export function buildPosterFromExcursion(
  excursion: ExcursionDetail,
  pickupPoints: ExcursionPickupPoint[],
  settings?: SettingsResponse,
): PosterModel {
  return buildExcursionPoster(
    excursion,
    [...pickupPoints]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((pp) => ({
        name: pp.location.name,
        city: pp.location.city,
        address: pp.location.address ?? null,
        time: pp.pickupTime ?? null,
      })),
    normalizePayment(settings),
  );
}

/**
 * Variante pubblica: stessi template e stesso layout, dati presi dall'endpoint
 * pubblico della gita. Il blocco "come prenotare" resta fuori perché IBAN e
 * beneficiario non sono esposti sull'API pubblica.
 */
export function buildPosterFromPublicExcursion(
  excursion: PublicExcursionDetail,
): PosterModel {
  return buildExcursionPoster(
    excursion,
    [...(excursion.pickupPoints ?? [])]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((pp) => ({
        name: pp.name,
        city: pp.city,
        address: pp.address ?? null,
        time: pp.pickupTime ?? null,
      })),
    null,
  );
}

export function buildPosterFromOffer(
  offer: OfferDetail,
  galleryImages: OfferGalleryImage[],
  settings?: SettingsResponse,
): PosterModel {
  const kind: PosterKind = offer.category === "crociera" ? "crociera" : "vacanza";
  const theme = POSTER_THEMES[kind];

  // Le offerte non hanno una data di partenza puntuale: validFrom è l'inizio
  // validità, non il giorno 1 — quindi niente date calcolate sulla timeline.
  const days = normalizeDays(offer.schedule, null);
  const dayCount = offer.durationDays ?? (days.length || null);

  const validFrom = parseDate(offer.validFrom);
  const validTo = parseDate(offer.validTo);
  const dateLabel =
    offer.period?.trim().toUpperCase() ||
    (validFrom && validTo ? formatDateRange(validFrom, validTo) : "");

  const price = formatPosterPrice(offer.publicPrice);

  const durationParts: string[] = [];
  if (dayCount) durationParts.push(`${dayCount} GIORNI`);
  if (offer.durationNights) durationParts.push(`${offer.durationNights} NOTTI`);

  return {
    kind,
    theme,
    title: offer.name,
    kicker: durationParts.length > 0 ? `${theme.label} ${durationParts.join(" / ")}` : theme.label,
    dateLabel,
    // Le offerte hanno un prezzo "a partire da": prefisso DA sul cartellino.
    priceLabel: price ? `DA ${price}` : null,
    coverImageUrl: offer.coverImageUrl ?? null,
    days,
    highlights: splitLines(offer.highlights),
    included: splitLines(offer.servicesIncluded),
    excluded: splitLines(offer.servicesExcluded),
    description: offer.advertisingText?.trim() || null,
    pickupPoints: [],
    galleryImages: [...galleryImages]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((img) => img.imageUrl),
    payment: normalizePayment(settings),
  };
}
