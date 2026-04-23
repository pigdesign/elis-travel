import { useLocation } from "wouter";
import { Plus, MapPin, Users, Clock, Star, ExternalLink, ArrowRight } from "lucide-react";
import { useListOffers } from "@workspace/api-client-react";
import type { OfferSummary } from "@workspace/api-client-react";
import { Button } from "@/components/shared/Button";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: "Bozza", className: "bg-gray-100 text-gray-600" },
  published: { label: "Pubblicata", className: "bg-emerald-100 text-emerald-700" },
  archived: { label: "Archiviata", className: "bg-stone-200 text-stone-600" },
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

  return (
    <div
      className={cn(
        "bg-white rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow p-6",
        isArchived && "opacity-60"
      )}
    >
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

        {!offer.period && offer.validFrom && (
          <div className="text-xs">
            {formatDate(offer.validFrom)} → {formatDate(offer.validTo)}
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
  );
}

export function OffersPage() {
  const [, navigate] = useLocation();
  const { data: offers, isLoading, error } = useListOffers();

  const published = offers?.filter((o) => o.status === "published") ?? [];
  const drafts = offers?.filter((o) => o.status === "draft") ?? [];
  const archived = offers?.filter((o) => o.status === "archived") ?? [];

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
        <Button className="bg-primary hover:bg-primary/90 text-white rounded-full">
          <Plus className="w-4 h-4 mr-2" />
          Nuova Offerta
        </Button>
      </div>

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

      {!isLoading && !error && offers && offers.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed border-border p-16 text-center">
          <div className="text-muted-foreground mb-4">Nessuna offerta creata al momento.</div>
          <Button variant="outline" className="rounded-full">Crea la prima offerta</Button>
        </div>
      )}

      {!isLoading && !error && offers && offers.length > 0 && (
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
    </div>
  );
}
