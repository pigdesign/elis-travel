import { Bus, Ship, Plane, type LucideIcon } from "lucide-react";
import sfondoV from "@/assets/poster/sfondo-v.png";
import sfondoH from "@/assets/poster/sfondo-h.png";
import ondaVGita from "@/assets/poster/onda-v-gita.svg";
import ondaVCrociera from "@/assets/poster/onda-v-crociera.svg";
import ondaVVacanza from "@/assets/poster/onda-v-vacanza.svg";
import ondaHGita from "@/assets/poster/onda-h-gita.svg";
import ondaHCrociera from "@/assets/poster/onda-h-crociera.svg";
import ondaHVacanza from "@/assets/poster/onda-h-vacanza.svg";
import tagGita from "@/assets/poster/tag-gita.svg";
import tagCrociera from "@/assets/poster/tag-crociera.svg";
import tagVacanza from "@/assets/poster/tag-vacanza.svg";

/**
 * Temi grafici delle locandine PDF, uno per categoria commerciale.
 * Colori e forme arrivano dai file sorgente del grafico in
 * docs/pdf-design/pezzi/ (onda categoria, etichetta prezzo, sfondo
 * con finestra foto). Kicker sempre verde, cerchi giorni sempre arancio.
 */
export type PosterKind = "gita" | "crociera" | "vacanza";

export interface PosterTheme {
  kind: PosterKind;
  /** Etichetta categoria (usata nel badge delle pagine interne; in
   *  copertina è già disegnata dentro l'onda SVG). */
  label: string;
  /** Colore principale: fascia footer, titoli sezioni interne. */
  color: string;
  icon: LucideIcon;
  assets: {
    /** Onda superiore con icona + etichetta, layout verticale. */
    waveV: string;
    /** Onda superiore con icona + etichetta, layout orizzontale. */
    waveH: string;
    /** Etichetta prezzo vuota (con cordino e ombra). */
    tag: string;
  };
}

export const POSTER_THEMES: Record<PosterKind, PosterTheme> = {
  gita: {
    kind: "gita",
    label: "GITA",
    color: "#e17803",
    icon: Bus,
    assets: { waveV: ondaVGita, waveH: ondaHGita, tag: tagGita },
  },
  crociera: {
    kind: "crociera",
    label: "CROCIERA",
    color: "#0695ff",
    icon: Ship,
    assets: { waveV: ondaVCrociera, waveH: ondaHCrociera, tag: tagCrociera },
  },
  vacanza: {
    kind: "vacanza",
    label: "VACANZA",
    color: "#00979b",
    icon: Plane,
    assets: { waveV: ondaVVacanza, waveH: ondaHVacanza, tag: tagVacanza },
  },
};

/** Sfondi copertina del grafico: navy con finestra foto sfumata trasparente. */
export const POSTER_BACKGROUNDS = {
  /** PNG A4 verticale 300dpi, copre l'intera pagina. */
  portrait: sfondoV,
  /** PNG 300dpi che copre la zona a sinistra del pannello programma e sopra
   *  il footer (2447×2149px = 207.2×182mm). */
  landscape: sfondoH,
};

/** Colori fissi del layout, indipendenti dalla categoria. */
export const POSTER_COLORS = {
  /** Navy dello sfondo (campionato da sfondo-v.png). */
  navy: "#002949",
  /** Pannello laterale scuro (layout orizzontale). */
  navyDark: "#001d33",
  /** Kicker "GITA 3 GIORNI" — sempre verde come nei mockup. */
  green: "#3dae4a",
  /** Cerchi dei giorni e date del programma — sempre arancio. */
  orange: "#e17803",
} as const;

/**
 * Contatti/branding agenzia per il footer delle locandine.
 * Valori identici a quelli dei mockup e del footer del sito
 * (components/layout/Footer.tsx). Da spostare in settings se in
 * futuro dovranno essere modificabili dall'admin.
 */
export const POSTER_AGENCY = {
  name: "ELIS TRAVEL",
  tagline: "AGENZIA VIAGGI E TOUR OPERATOR",
  address: "VIA CAVOUR 59C - ANDORA SV",
  phones: "0182 64 64 47 - 391 17 17 007",
  email: "INFO@ELIS-TRAVEL.IT",
} as const;
