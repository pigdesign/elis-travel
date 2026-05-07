import { useState } from "react";
import { useLocation } from "wouter";
import { Plus, MapPin, Users, Clock, Star, ExternalLink, ArrowRight, Calendar, ImageOff, Filter, X } from "lucide-react";
import { useListOffers } from "@workspace/api-client-react";
import type { OfferSummary } from "@workspace/api-client-react";
import { Button } from "@/components/shared/Button";
import { cn } from "@/lib/utils";
import { OfferFormModal } from "./OfferFormModal";

const STATUS_OPTIONS = [
  { value: "", label: "Tutti gli stati" },
  { value: "published", label: "Pubblicata" },
  { value: "draft", label: "Bozza" },
  { value: "archived", label: "Archiviata" },
];

const CATEGORY_OPTIONS = [
  { value: "", label: "Tutte le tipologie" },
  { value: "crociera", label: "Crociere" },
  { value: "vacanza", label: "Vacanze" },
];

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: "Bozza", className: "bg-muted text-muted-foreground" },
  published: { label: "Pubblicata", className: "bg-primary/10 text-primary" },
  archived: { label: "Archiviata", className: "bg-stone-100 text-stone-500" },
};

function formatDate(ts: string | null | undefined) {
  if (!ts) return "–";
  return new Date(ts).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

function formatPrice(p: string | null | undefined) {
  if (!p) return "–";
  const n = parseFloat(p);
  return isNaN(n) ? "–" : n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

function OfferCard({ offer, onOpen }: { offer: OfferSummary; onOpen: () => void }) {
  const statusCfg = STATUS_CONFIG[offer.status] ?? STATUS_CONFIG["draft"];
  const isArchived = offer.status === "archived";
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className={cn(
        "bg-white rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow overflow-hidden",
        isArchived && "opacity-60"
      )}
    >
      <div className="relative h-36 w-full bg-muted flex items-center justify-center overflow-hidden">
        {offer.coverImageUrl && !imgError ? (
          <img
            src={offer.coverImageUrl}
            alt={offer.name}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-muted-foreground/50">
            <ImageOff className="w-8 h-8" />
            <span className="text-xs">Nessuna foto</span>
          </div>
        )}
      </div>

      <div className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold", statusCfg.className)}>
              {statusCfg.label}
            </span>
            {offer.tourOperator && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {offer.tourOperator}
              </span>
            )}
          </div>

          <h3 className="text-lg font-bold text-foreground truncate">{offer.name}</h3>

          <div className="flex items-center gap-1 mt-0.5 text-sm text-muted-foreground">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{offer.destination}</span>
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          {offer.publicPrice ? (
            <div>
              <div className="text-xs text-muted-foreground">da</div>
              <div className="text-xl font-bold text-primary">{formatPrice(offer.publicPrice)}</div>
            </div>
          ) : (
            <div className="text-muted-foreground text-sm italic">Prezzo n.d.</div>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
        {(offer.durationDays || offer.durationNights) && (
          <div className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            <span>
              {offer.durationDays ? `${offer.durationDays} gg` : ""}
              {offer.durationDays && offer.durationNights ? " / " : ""}
              {offer.durationNights ? `${offer.durationNights} notti` : ""}
            </span>
          </div>
        )}

        {offer.period && (
          <div className="flex items-center gap-1">
            <Star className="w-3.5 h-3.5" />
            <span>{offer.period}</span>
          </div>
        )}

        {offer.validFrom && (
          <div className="flex items-center gap-1 text-xs">
            <Calendar className="w-3.5 h-3.5" />
            <span>{formatDate(offer.validFrom)} – {formatDate(offer.validTo)}</span>
          </div>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-border flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 text-sm">
          <Users className="w-4 h-4 text-primary" />
          <span className="font-semibold text-foreground">{offer.leadsCount}</span>
          <span className="text-muted-foreground">leads</span>
          {offer.mainSource && (
            <span className="ml-2 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              via {offer.mainSource}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {offer.publicLink && (
            <a
              href={offer.publicLink}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <Button
            onClick={onOpen}
            className="bg-primary hover:bg-primary/90 text-white rounded-full px-4 py-2 text-sm flex items-center gap-1.5"
          >
            Dettagli
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      </div>
    </div>
  );
}

export function OffersPage() {
  const [, navigate] = useLocation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { data: offers, isLoading, error } = useListOffers();

  const [filterStatus, setFilterStatus] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterFeatured, setFilterFeatured] = useState(false);
  const [filterLastMinute, setFilterLastMinute] = useState(false);

  const hasFilters = filterStatus !== "" || filterCategory !== "" || filterFeatured || filterLastMinute;

  const allOffers = offers ?? [];

  const filtered = allOffers.filter((o) => {
    if (filterStatus && o.status !== filterStatus) return false;
    if (filterCategory && o.category !== filterCategory) return false;
    if (filterFeatured && !o.featured) return false;
    if (filterLastMinute && !o.lastMinute) return false;
    return true;
  });

  const published = allOffers.filter((o) => o.status === "published");
  const drafts = allOffers.filter((o) => o.status === "draft");
  const archived = allOffers.filter((o) => o.status === "archived");

  function clearFilters() {
    setFilterStatus("");
    setFilterCategory("");
    setFilterFeatured(false);
    setFilterLastMinute(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Offerte & Pacchetti</h1>
          <p className="text-muted-foreground">
            Gestisci il catalogo offerte viaggio.
            {offers && (
              <span className="ml-2 text-sm">
                <span className="font-medium text-emerald-600">{published.length} pubblicate</span>
                {drafts.length > 0 && <span className="ml-2 text-gray-500">{drafts.length} bozze</span>}
                {archived.length > 0 && <span className="ml-2 text-stone-500">{archived.length} archiviate</span>}
              </span>
            )}
          </p>
        </div>
        <Button
          className="bg-primary hover:bg-primary/90 text-white rounded-full"
          onClick={() => setIsModalOpen(true)}
        >
          <Plus className="w-4 h-4 mr-2" />
          Nuova Offerta
        </Button>
      </div>

      {/* Barra filtri */}
      {!isLoading && !error && allOffers.length > 0 && (
        <div className="bg-white border border-border rounded-2xl px-5 py-4 flex flex-wrap items-center gap-3 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Filter className="w-4 h-4" />
            Filtri
          </div>

          <div className="w-px h-6 bg-border hidden sm:block" />

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-border bg-muted/30 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-border bg-muted/30 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>

          <button
            onClick={() => setFilterFeatured((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors",
              filterFeatured
                ? "bg-amber-50 border-amber-300 text-amber-700"
                : "border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <Star className={cn("w-3.5 h-3.5", filterFeatured && "fill-amber-400 text-amber-400")} />
            In Evidenza
          </button>

          <button
            onClick={() => setFilterLastMinute((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors",
              filterLastMinute
                ? "bg-red-50 border-red-300 text-red-600"
                : "border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <Clock className={cn("w-3.5 h-3.5", filterLastMinute && "text-red-500")} />
            Last Minute
          </button>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Azzera
            </button>
          )}

          {hasFilters && (
            <span className="text-xs text-muted-foreground">
              {filtered.length} {filtered.length === 1 ? "risultato" : "risultati"}
            </span>
          )}
        </div>
      )}

      {isLoading && (
        <div className="text-center py-16 text-muted-foreground animate-pulse">
          Caricamento offerte…
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-700 text-sm">
          Errore nel caricamento delle offerte. Riprova.
        </div>
      )}

      {!isLoading && !error && allOffers.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed border-border p-16 text-center">
          <div className="text-muted-foreground mb-4">Nessuna offerta creata al momento.</div>
          <Button variant="outline" className="rounded-full">Crea la prima offerta</Button>
        </div>
      )}

      {!isLoading && !error && allOffers.length > 0 && (
        <>
          {hasFilters ? (
            /* Vista filtrata — lista piatta */
            <div className="space-y-4">
              {filtered.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground text-sm">
                  Nessuna offerta corrisponde ai filtri selezionati.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {filtered.map((offer) => (
                    <OfferCard
                      key={offer.id}
                      offer={offer}
                      onOpen={() => navigate(`~/admin/offers/${offer.id}`)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Vista normale — raggruppata per stato */
            <div className="space-y-8">
              {published.length > 0 && (
                <section>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Pubblicate
                  </h2>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {published.map((offer) => (
                      <OfferCard
                        key={offer.id}
                        offer={offer}
                        onOpen={() => navigate(`~/admin/offers/${offer.id}`)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {drafts.length > 0 && (
                <section>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Bozze
                  </h2>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {drafts.map((offer) => (
                      <OfferCard
                        key={offer.id}
                        offer={offer}
                        onOpen={() => navigate(`~/admin/offers/${offer.id}`)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {archived.length > 0 && (
                <section>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Archiviate
                  </h2>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {archived.map((offer) => (
                      <OfferCard
                        key={offer.id}
                        offer={offer}
                        onOpen={() => navigate(`~/admin/offers/${offer.id}`)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </>
      )}

      <OfferFormModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
}
