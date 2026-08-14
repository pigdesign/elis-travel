import { useEffect, useMemo, useState } from "react";
import { useGetPublicExcursion } from "@workspace/api-client-react";
import { extractIdFromSlug } from "@/lib/seo";
import { buildPosterFromPublicExcursion, type PosterModel } from "@/pdf/model";
import { PosterCover } from "@/pdf/PosterCover";
import { PosterInnerPages } from "@/pdf/PosterInnerPages";
import "@/pdf/poster.css";

/**
 * Pagina "grezza" della scheda completa (copertina + pagine interne), stessi
 * template della locandina admin ma con i dati pubblici e senza toolbar.
 *
 * Non è pensata per la navigazione: la apre il generatore PDF lato server
 * (services/poster-pdf.ts) che la stampa in A4. Quando il documento è pronto
 * per lo scatto — font caricati, immagini decodificate, titolo auto-adattivo
 * già dimensionato — segnala lo stato su <html data-poster>, che il server
 * attende prima di generare il PDF.
 */

/** Valori di default della toolbar admin: il PDF pubblico usa questi. */
const ORIENTATION = "portrait" as const;
const MAX_DAYS_ON_COVER = 4;

interface ExcursionPosterPageProps {
  excursionIdOrSlug: string;
}

/** Attende che ogni <img> della pagina abbia finito di caricare (o fallito). */
function waitForImages(): Promise<unknown> {
  const images = Array.from(document.images);
  return Promise.all(
    images.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
            img.addEventListener("load", resolve, { once: true });
            img.addEventListener("error", resolve, { once: true });
          }),
    ),
  );
}

/** Due frame di margine: AutoFitTitle misura il DOM dopo il primo layout. */
function nextFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export function ExcursionPosterPage({ excursionIdOrSlug }: ExcursionPosterPageProps) {
  const excursionId = extractIdFromSlug(excursionIdOrSlug);
  const { data: excursion, isLoading, isError } = useGetPublicExcursion(excursionId);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  // Le gite Rident non hanno locandina: l'endpoint PDF le rifiuta già, ma
  // questa pagina è raggiungibile per conto suo e sarebbe stampabile a mano.
  const isRident = excursion?.category === "rident";

  const model: PosterModel | null = useMemo(
    () => (excursion ? buildPosterFromPublicExcursion(excursion) : null),
    [excursion],
  );

  useEffect(() => {
    if (isError || isRident) {
      setStatus("error");
      return;
    }
    if (!model) return;

    let cancelled = false;
    void (async () => {
      await document.fonts.ready;
      await waitForImages();
      await nextFrames();
      if (!cancelled) setStatus("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [model, isError]);

  // Il generatore PDF fa polling su questo attributo.
  useEffect(() => {
    document.documentElement.dataset.poster = status;
    return () => {
      delete document.documentElement.dataset.poster;
    };
  }, [status]);

  // Ripiego: se il PDF lato server non è disponibile, l'endpoint manda qui con
  // ?stampa=1 e il visitatore ottiene comunque il documento dalla finestra di
  // stampa del browser.
  useEffect(() => {
    if (status !== "ready") return;
    const wantsPrint = new URLSearchParams(window.location.search).has("stampa");
    if (wantsPrint) window.print();
  }, [status]);

  // Pagina di servizio: mai indicizzata.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);

  // La maschera che lascia a schermo il solo poster (.poster-standalone in
  // poster.css) va messa solo quando il poster c'è per davvero: nasconde
  // qualunque figlio che non sia .poster-root, quindi anche i messaggi di
  // errore, e la pagina resterebbe bianca senza spiegazione.
  const posterVisible = !isRident && !isError && model !== null;
  useEffect(() => {
    if (!posterVisible) return;
    document.body.classList.add("poster-standalone");
    return () => {
      document.body.classList.remove("poster-standalone");
    };
  }, [posterVisible]);

  if (isLoading) return null;

  if (isRident) {
    return (
      <div style={{ padding: 32, fontFamily: "sans-serif" }}>
        Locandina non disponibile per questa gita.
      </div>
    );
  }

  if (isError || !model) {
    return <div style={{ padding: 32, fontFamily: "sans-serif" }}>Gita non trovata.</div>;
  }

  const themeVars = { "--pk": model.theme.color } as React.CSSProperties;

  return (
    <div className="poster-root" style={themeVars}>
      <style>{`@page { size: A4 portrait; margin: 0; }`}</style>
      <div className="poster-preview-stage">
        <div className="poster-break">
          <PosterCover
            model={model}
            orientation={ORIENTATION}
            dateLabel={model.dateLabel}
            maxDays={MAX_DAYS_ON_COVER}
          />
        </div>
        <PosterInnerPages model={model} orientation={ORIENTATION} />
      </div>
    </div>
  );
}
