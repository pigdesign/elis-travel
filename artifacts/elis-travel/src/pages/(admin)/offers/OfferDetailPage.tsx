import { useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  MapPin,
  Clock,
  Calendar,
  Users,
  ExternalLink,
  Copy,
  CheckCircle2,
  AlertCircle,
  Building2,
  FileText,
  Star,
  Pencil,
} from "lucide-react";
import { useGetOffer, useDuplicateOffer, getListOffersQueryKey } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { OfferFormModal } from "./OfferFormModal";

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  draft: { label: "Bozza", className: "bg-gray-100 text-gray-700", icon: AlertCircle },
  published: { label: "Pubblicata", className: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  archived: { label: "Archiviata", className: "bg-stone-200 text-stone-600", icon: AlertCircle },
};

function formatDate(ts: string | null | undefined) {
  if (!ts) return "–";
  return new Date(ts).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
}

function formatPrice(p: string | null | undefined) {
  if (!p) return null;
  const n = parseFloat(p);
  return isNaN(n) ? null : n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

function Section({ title, icon: Icon, children, className }: {
  title: string;
  icon?: React.ElementType;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-primary" />}
        {title}
      </h3>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="text-muted-foreground w-32 flex-shrink-0">{label}</span>
      <span className="text-foreground font-medium">{value || "–"}</span>
    </div>
  );
}

function HighlightsList({ raw }: { raw: string | null | undefined }) {
  if (!raw) return <span className="text-sm text-muted-foreground">Nessun highlight</span>;
  const items = raw.split("|").map((s) => s.trim()).filter(Boolean);
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          <Star className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function ServicesList({ raw, included }: { raw: string | null | undefined; included: boolean }) {
  if (!raw) return <span className="text-sm text-muted-foreground">Non specificato</span>;
  const items = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          <span className={cn("mt-0.5 flex-shrink-0 text-xs font-bold", included ? "text-emerald-600" : "text-red-400")}>
            {included ? "✓" : "✗"}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function OfferDetailPage({ offerId }: { offerId: string }) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const { data: offer, isLoading, error } = useGetOffer(offerId);
  const { mutate: duplicate, isPending: isDuplicating } = useDuplicateOffer({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListOffersQueryKey() });
        navigate("~/admin/offers");
      },
    },
  });

  if (isLoading) {
    return (
      <div className="animate-pulse text-center py-16 text-muted-foreground">
        Caricamento offerta…
      </div>
    );
  }

  if (error || !offer) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-red-700">
        Offerta non trovata o errore nel caricamento.
        <button
          className="ml-3 underline"
          onClick={() => navigate("~/admin/offers")}
        >
          Torna alla lista
        </button>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[offer.status] ?? STATUS_CONFIG["draft"];
  const StatusIcon = statusCfg.icon;
  const price = formatPrice(offer.publicPrice);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate("~/admin/offers")}
          className="p-2 rounded-xl hover:bg-muted/50 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold", statusCfg.className)}>
              <StatusIcon className="w-3 h-3" />
              {statusCfg.label}
            </span>
            {offer.tourOperator && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {offer.tourOperator}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-foreground mt-1 truncate">{offer.name}</h1>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="w-3.5 h-3.5" />
            {offer.destination}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-border shadow-sm p-6 space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">
                  Area Pubblica
                </div>
                <h2 className="text-lg font-bold text-foreground">Contenuto Offerta</h2>
              </div>
              {price && (
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Prezzo base da</div>
                  <div className="text-2xl font-bold text-primary">{price}</div>
                  {offer.pricingNotes && (
                    <div className="text-xs text-muted-foreground mt-0.5 max-w-[180px] text-right">
                      {offer.pricingNotes}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid sm:grid-cols-3 gap-4 py-4 border-y border-border">
              {(offer.durationDays || offer.durationNights) && (
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-primary flex-shrink-0" />
                  <div>
                    <div className="font-medium text-foreground">
                      {offer.durationDays ? `${offer.durationDays} giorni` : ""}
                      {offer.durationDays && offer.durationNights ? " / " : ""}
                      {offer.durationNights ? `${offer.durationNights} notti` : ""}
                    </div>
                    <div className="text-xs text-muted-foreground">Durata</div>
                  </div>
                </div>
              )}
              {offer.period && (
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-primary flex-shrink-0" />
                  <div>
                    <div className="font-medium text-foreground">{offer.period}</div>
                    <div className="text-xs text-muted-foreground">Periodo</div>
                  </div>
                </div>
              )}
              {offer.departureCity && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
                  <div>
                    <div className="font-medium text-foreground">{offer.departureCity}</div>
                    <div className="text-xs text-muted-foreground">Partenza</div>
                  </div>
                </div>
              )}
            </div>

            {offer.baseFormula && (
              <Section title="Formula Base" icon={Building2}>
                <p className="text-sm text-foreground bg-muted/50 px-4 py-3 rounded-xl font-medium">
                  {offer.baseFormula}
                </p>
              </Section>
            )}

            {offer.highlights && (
              <Section title="Highlights" icon={Star}>
                <HighlightsList raw={offer.highlights} />
              </Section>
            )}

            {offer.advertisingText && (
              <Section title="Testo Pubblicitario" icon={FileText}>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                  {offer.advertisingText}
                </p>
              </Section>
            )}

            <div className="grid sm:grid-cols-2 gap-6">
              {offer.servicesIncluded && (
                <Section title="Servizi Inclusi">
                  <ServicesList raw={offer.servicesIncluded} included={true} />
                </Section>
              )}
              {offer.servicesExcluded && (
                <Section title="Non Incluso">
                  <ServicesList raw={offer.servicesExcluded} included={false} />
                </Section>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-5">
            <div>
              <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">
                Gestione Interna Staff
              </div>
              <h2 className="font-bold text-foreground">Dati Operativi</h2>
            </div>

            <Section title="Validità">
              <div className="space-y-1.5">
                <InfoRow label="Dal" value={formatDate(offer.validFrom)} />
                <InfoRow label="Al" value={formatDate(offer.validTo)} />
              </div>
            </Section>

            {offer.tourOperator && (
              <Section title="Fornitore">
                <InfoRow label="Tour Operator" value={offer.tourOperator} />
              </Section>
            )}

            <Section title="Performance Leads" icon={Users}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-amber-100 border-2 border-amber-300 flex items-center justify-center">
                  <span className="text-xl font-bold text-amber-700">{offer.leadsCount}</span>
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">{offer.leadsCount} lead{offer.leadsCount !== 1 ? "s" : ""}</div>
                  {offer.lastInterestAt && (
                    <div className="text-xs text-muted-foreground">
                      Ultimo: {formatDate(offer.lastInterestAt)}
                    </div>
                  )}
                  {offer.mainSource && (
                    <div className="text-xs text-muted-foreground">
                      Fonte: {offer.mainSource}
                    </div>
                  )}
                </div>
              </div>
            </Section>

            {offer.internalNotes && (
              <Section title="Note Staff">
                <div className="bg-amber-100 border border-amber-200 rounded-xl p-3">
                  <p className="text-sm text-amber-900 leading-relaxed whitespace-pre-line">
                    {offer.internalNotes}
                  </p>
                </div>
              </Section>
            )}

            <div className="pt-2 border-t border-amber-200 space-y-2">
              <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
                Azioni
              </div>

              <button
                onClick={() => setIsEditModalOpen(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Pencil className="w-4 h-4" />
                Modifica offerta
              </button>

              {offer.publicLink && (
                <a
                  href={offer.publicLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-amber-200 text-sm font-medium text-foreground hover:bg-amber-50 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Apri link pubblico
                </a>
              )}

              <button
                onClick={() => duplicate({ id: offerId })}
                disabled={isDuplicating}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-amber-200 text-sm font-medium text-foreground hover:bg-amber-50 transition-colors disabled:opacity-50"
              >
                <Copy className="w-4 h-4" />
                {isDuplicating ? "Duplicazione…" : "Duplica offerta"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {offer && (
        <OfferFormModal
          open={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          offer={offer}
        />
      )}
    </div>
  );
}
