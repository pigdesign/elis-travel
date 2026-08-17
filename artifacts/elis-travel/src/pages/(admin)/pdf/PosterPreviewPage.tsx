import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Printer,
  RectangleHorizontal,
  RectangleVertical,
} from "lucide-react";
import {
  useGetExcursion,
  useGetOffer,
  useGetOfferImages,
  useListExcursionPickupPoints,
  getGetExcursionQueryKey,
  getGetOfferQueryKey,
  getListExcursionPickupPointsQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { buildPosterFromExcursion, buildPosterFromOffer, type PosterModel } from "@/pdf/model";
import { PosterCover, type PosterOrientation } from "@/pdf/PosterCover";
import { PosterInnerPages } from "@/pdf/PosterInnerPages";
import "@/pdf/poster.css";

export type PosterSourceKind = "excursion" | "offer";

interface PosterPreviewPageProps {
  kind: PosterSourceKind;
  id: string;
}

/**
 * locandina  = sola copertina
 * scheda     = copertina + pagine interne
 * solo-scheda = pagine interne senza copertina, da inviare per conto loro
 *               (la testata della prima pagina interna riporta titolo,
 *               sottotitolo, luogo, date e prezzo)
 */
type PosterMode = "locandina" | "scheda" | "solo-scheda";

/**
 * Scelta dell'orientamento nascosta all'operatore: per ora esce solo il
 * formato verticale. Il layout orizzontale resta tutto al suo posto (rami
 * `.ph` in poster.css, ramo landscape in PosterCover/PosterInnerPages,
 * asset sfondo-h.png e onda-h-*.svg): per rimetterlo a disposizione basta
 * riportare questa costante a true.
 * NOTA: prima di riattivarlo serve la maschera orizzontale nuova del
 * grafico — sfondo-h.png è ancora quella vecchia col blu navy, che non
 * combacia col petrolio della copertina verticale.
 */
const ORIENTATION_SWITCH_ENABLED = false;

/**
 * Anteprima e stampa della locandina promozionale (fase 1: window.print →
 * "Salva come PDF"). Route admin fuori da AdminLayout per avere la pagina
 * pulita in stampa; replica la stessa guardia di autenticazione del layout.
 */
export function PosterPreviewPage({ kind, id }: PosterPreviewPageProps) {
  const [, navigate] = useLocation();
  const { state } = useAuth();

  const isExcursion = kind === "excursion";

  const excursionQuery = useGetExcursion(id, {
    query: { queryKey: getGetExcursionQueryKey(id), enabled: isExcursion },
  });
  const pickupPointsQuery = useListExcursionPickupPoints(id, {
    query: { queryKey: getListExcursionPickupPointsQueryKey(id), enabled: isExcursion },
  });
  const offerQuery = useGetOffer(id, {
    query: { queryKey: getGetOfferQueryKey(id), enabled: !isExcursion },
  });
  const offerImagesQuery = useGetOfferImages(id, { enabled: !isExcursion });

  const [orientation, setOrientation] = useState<PosterOrientation>("portrait");
  const [mode, setMode] = useState<PosterMode>("locandina");
  const [dateText, setDateText] = useState<string | null>(null);
  const [maxDays, setMaxDays] = useState<number | null>(null);

  useEffect(() => {
    if (state.status === "unauthenticated") {
      navigate("~/admin/login");
    }
  }, [state.status, navigate]);

  const model: PosterModel | null = useMemo(() => {
    if (isExcursion) {
      if (!excursionQuery.data) return null;
      return buildPosterFromExcursion(
        excursionQuery.data,
        pickupPointsQuery.data ?? [],
      );
    }
    if (!offerQuery.data) return null;
    return buildPosterFromOffer(offerQuery.data, offerImagesQuery.data ?? []);
  }, [
    isExcursion,
    excursionQuery.data,
    pickupPointsQuery.data,
    offerQuery.data,
    offerImagesQuery.data,
  ]);

  const isLoading = isExcursion
    ? excursionQuery.isLoading
    : offerQuery.isLoading;
  const isError = isExcursion ? excursionQuery.isError : offerQuery.isError;

  // Le gite Rident non hanno locandina: il tasto è già nascosto nella scheda,
  // ma questo indirizzo si raggiunge anche a mano.
  const isRidentExcursion =
    isExcursion && excursionQuery.data?.category === "rident";

  if (state.status === "loading" || state.status === "unauthenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !model || isRidentExcursion) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background text-center px-4">
        <p className="text-muted-foreground">
          {isRidentExcursion
            ? "Locandina non disponibile per le gite Rident."
            : isExcursion
              ? "Gita non trovata."
              : "Offerta non trovata."}
        </p>
        <button
          onClick={() => navigate(isExcursion ? "~/admin/excursions" : "~/admin/offers")}
          className="text-primary hover:underline text-sm"
        >
          Torna alla lista
        </button>
      </div>
    );
  }

  // Il programma si ridimensiona da solo per starci tutto (useFitDays), quindi
  // di default si mostrano tutti i giorni fino a 7; oltre, il taglio automatico
  // rimanda il resto alle pagine interne.
  const effectiveMaxDays = maxDays ?? Math.min(model.days.length || 7, 7);
  const effectiveDateLabel = dateText ?? model.dateLabel;

  // Offerta senza categoria: la locandina esce col tema di ripiego (VACANZA),
  // ma l'operatore deve saperlo prima di stampare.
  const missingCategory =
    !isExcursion &&
    offerQuery.data != null &&
    offerQuery.data.category !== "crociera" &&
    offerQuery.data.category !== "vacanza";

  const backPath = isExcursion ? `~/admin/excursions/${id}` : `~/admin/offers/${id}`;

  const themeVars = {
    "--pk": model.theme.color,
  } as React.CSSProperties;

  return (
    <div className="poster-root" style={themeVars}>
      {/* Regola @page dinamica in base all'orientamento scelto */}
      <style>{`@page { size: A4 ${orientation === "landscape" ? "landscape" : "portrait"}; margin: 0; }`}</style>

      {/* Toolbar di servizio: mai stampata */}
      <div className="no-print sticky top-0 z-50 bg-white border-b border-border shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <button
            onClick={() => navigate(backPath)}
            className="p-2 rounded-xl hover:bg-muted/50 transition-colors"
            title="Torna al dettaglio"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>

          <div className="font-bold text-foreground truncate max-w-[26ch]">
            Locandina — {model.title}
          </div>

          {ORIENTATION_SWITCH_ENABLED && (
            <div className="flex items-center gap-1 bg-muted rounded-xl p-1">
              <button
                onClick={() => setOrientation("portrait")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors",
                  orientation === "portrait"
                    ? "bg-white shadow text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <RectangleVertical className="w-4 h-4" />
                Verticale
              </button>
              <button
                onClick={() => setOrientation("landscape")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors",
                  orientation === "landscape"
                    ? "bg-white shadow text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <RectangleHorizontal className="w-4 h-4" />
                Orizzontale
              </button>
            </div>
          )}

          <div className="flex items-center gap-1 bg-muted rounded-xl p-1">
            <button
              onClick={() => setMode("locandina")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                mode === "locandina"
                  ? "bg-white shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Locandina
            </button>
            <button
              onClick={() => setMode("scheda")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                mode === "scheda"
                  ? "bg-white shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Scheda completa
            </button>
            <button
              onClick={() => setMode("solo-scheda")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                mode === "solo-scheda"
                  ? "bg-white shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Solo scheda
            </button>
          </div>

          <input
            type="text"
            value={effectiveDateLabel}
            onChange={(e) => setDateText(e.target.value)}
            placeholder="Testo data (es. DAL 17 AL 19 APRILE 2026)"
            className="px-3 py-1.5 border border-border rounded-xl text-sm w-64 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />

          {model.days.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Giorni in copertina
              <select
                value={effectiveMaxDays}
                onChange={(e) => setMaxDays(Number(e.target.value))}
                className="px-2 py-1.5 border border-border rounded-xl text-sm bg-white"
              >
                {Array.from({ length: Math.min(model.days.length, 10) }, (_, i) => i + 1).map(
                  (n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ),
                )}
              </select>
            </label>
          )}

          <div className="flex-1" />

          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-colors"
          >
            <Printer className="w-4 h-4" />
            Stampa / Salva PDF
          </button>
        </div>
        <div className="max-w-6xl mx-auto px-4 pb-2 text-xs text-muted-foreground">
          Nella finestra di stampa scegli "Salva come PDF", formato A4, margini "Nessuno" e
          attiva "Grafica di sfondo".
        </div>
        {missingCategory && (
          <div className="max-w-6xl mx-auto px-4 pb-3">
            <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                <strong>Questa offerta non ha una categoria impostata</strong> (crociera o
                vacanza): la locandina uscirà con il tema VACANZA. Per il tema corretto,
                imposta la categoria dal dettaglio offerta con "Modifica offerta".
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="poster-preview-stage">
        {mode !== "solo-scheda" && (
          <div className={mode === "scheda" ? "poster-break" : undefined}>
            <PosterCover
              model={model}
              orientation={orientation}
              dateLabel={effectiveDateLabel}
              maxDays={effectiveMaxDays}
            />
          </div>
        )}
        {mode !== "locandina" && (
          <PosterInnerPages model={model} orientation={orientation} />
        )}
      </div>
    </div>
  );
}
