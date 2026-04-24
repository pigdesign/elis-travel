import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ExcursionFormModal } from "@/components/admin/ExcursionFormModal";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  MapPin,
  Calendar,
  Users,
  Bus,
  TrendingUp,
  AlertCircle,
  ImageOff,
} from "lucide-react";
import { useListExcursions } from "@workspace/api-client-react";
import type { ExcursionSummary } from "@workspace/api-client-react";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: "Bozza", className: "bg-gray-100 text-gray-700" },
  confirmed: { label: "Confermata", className: "bg-emerald-100 text-emerald-700" },
  completed: { label: "Completata", className: "bg-blue-100 text-blue-700" },
  cancelled: { label: "Annullata", className: "bg-red-100 text-red-700" },
};

function formatEur(n: number) {
  return n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

function AdherentsBar({ adherents, threshold, capacity }: { adherents: number; threshold: number; capacity: number }) {
  const max = capacity > 0 ? capacity : Math.max(adherents, threshold, 1);
  const thresholdPct = Math.min((threshold / max) * 100, 100);
  const adherentsPct = Math.min((adherents / max) * 100, 100);
  const overThreshold = adherents >= threshold;

  return (
    <div className="w-full">
      <div className="relative h-2.5 bg-gray-100 rounded-full overflow-hidden">
        {adherentsPct > 0 && (
          <div
            className={`absolute left-0 top-0 h-full rounded-full transition-all ${overThreshold ? "bg-emerald-500" : "bg-amber-400"}`}
            style={{ width: `${adherentsPct}%` }}
          />
        )}
        {thresholdPct > 0 && thresholdPct < 100 && (
          <div
            className="absolute top-0 h-full w-0.5 bg-gray-400 opacity-60"
            style={{ left: `${thresholdPct}%` }}
          />
        )}
      </div>
      <div className="flex justify-between mt-0.5 text-[10px] text-muted-foreground">
        <span>{adherents} aderenti</span>
        <span>min {threshold} / {capacity > 0 ? capacity : "–"} posti</span>
      </div>
    </div>
  );
}

function ExcursionRow({ exc }: { exc: ExcursionSummary }) {
  const [expanded, setExpanded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const statusCfg = STATUS_CONFIG[exc.status] ?? STATUS_CONFIG["draft"];
  const vehicleCost = parseFloat(exc.vehicleFixedCost ?? "0");
  const mealCost = parseFloat(exc.mealCostPerPerson ?? "0");
  const entranceCost = parseFloat(exc.entranceCostPerPerson ?? "0");
  const extraCost = parseFloat(exc.extraCostPerPerson ?? "0");
  const price = parseFloat(exc.pricePerPerson ?? "0");
  const marginePerPersona = price - mealCost - entranceCost - extraCost;

  const needsVehicleAlert =
    exc.switchThreshold != null &&
    exc.switchVehicleId != null &&
    exc.adherentsCount >= exc.switchThreshold;

  return (
    <>
      <tr
        className={`border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors ${expanded ? "bg-muted/20" : ""}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="py-3 pl-4 pr-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted flex items-center justify-center shrink-0">
              {exc.coverImageUrl && !imgError ? (
                <img
                  src={exc.coverImageUrl}
                  alt={exc.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={() => setImgError(true)}
                />
              ) : (
                <ImageOff className="w-4 h-4 text-muted-foreground/40" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-foreground text-sm truncate">{exc.name}</div>
              <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">{exc.location}</span>
              </div>
            </div>
          </div>
        </td>
        <td className="py-3 px-2 text-sm text-muted-foreground whitespace-nowrap">
          <div className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            {formatDate(exc.date)}
          </div>
        </td>
        <td className="py-3 px-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.className}`}>
            {statusCfg.label}
          </span>
        </td>
        <td className="py-3 px-2 min-w-[180px]">
          <AdherentsBar
            adherents={exc.adherentsCount}
            threshold={exc.minThreshold}
            capacity={exc.currentCapacity}
          />
        </td>
        <td className="py-3 px-2 text-right text-sm font-medium">
          <span className={exc.margineNetto >= 0 ? "text-emerald-600" : "text-red-500"}>
            {formatEur(exc.margineNetto)}
          </span>
        </td>
        <td className="py-3 px-2 text-right text-sm text-muted-foreground">
          {formatEur(exc.ricaviStimati)}
        </td>
        <td className="py-3 px-2 text-center">
          <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-0.5 bg-amber-50 text-amber-700 rounded px-1.5 py-0.5">
              <span>A</span><span className="font-semibold">{exc.depositsCount}</span>
            </span>
            <span className="inline-flex items-center gap-0.5 bg-emerald-50 text-emerald-700 rounded px-1.5 py-0.5">
              <span>S</span><span className="font-semibold">{exc.balancesCount}</span>
            </span>
          </div>
        </td>
        <td className="py-3 pr-4 pl-2 text-right">
          <div className="flex items-center justify-end gap-2">
            {needsVehicleAlert && (
              <AlertCircle className="w-4 h-4 text-amber-500" />
            )}
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </td>
      </tr>

      {expanded && (
        <tr className="border-b border-border/50 bg-muted/10">
          <td colSpan={8} className="px-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl p-4 border border-border/50">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" /> A — Conto Economico
                </h4>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Prezzo/persona</span>
                    <span className="font-medium">{formatEur(price)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>− Pasto</span>
                    <span>{formatEur(mealCost)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>− Ingressi</span>
                    <span>{formatEur(entranceCost)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>− Extra</span>
                    <span>{formatEur(extraCost)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border/50 pt-1.5 font-medium">
                    <span>Margine/persona</span>
                    <span className={marginePerPersona >= 0 ? "text-emerald-600" : "text-red-500"}>
                      {formatEur(marginePerPersona)}
                    </span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>− Costo veicolo</span>
                    <span>{formatEur(vehicleCost)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border/50 pt-1.5 font-semibold">
                    <span>Margine netto totale</span>
                    <span className={exc.margineNetto >= 0 ? "text-emerald-600" : "text-red-500"}>
                      {formatEur(exc.margineNetto)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 border border-border/50">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> B — Stato Adesioni
                </h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Aderenti totali</span>
                    <span className="font-semibold">{exc.adherentsCount}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Soglia minima</span>
                    <span>{exc.minThreshold}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Capienza mezzo</span>
                    <span>{exc.currentCapacity > 0 ? exc.currentCapacity : "—"}</span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-amber-600">Acconti (A)</span>
                      <span className="font-semibold text-amber-600">{exc.depositsCount}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-emerald-600">Saldi (S)</span>
                      <span className="font-semibold text-emerald-600">{exc.balancesCount}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">In attesa</span>
                      <span>{exc.adherentsCount - exc.depositsCount - exc.balancesCount}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 border border-border/50">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Bus className="w-3.5 h-3.5" /> C — Logistica Mezzo
                </h4>
                {needsVehicleAlert && (
                  <div className="mb-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>
                      Soglia cambio veicolo raggiunta ({exc.switchThreshold} aderenti).
                      Valutare mezzo alternativo.
                    </span>
                  </div>
                )}
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Costo fisso mezzo</span>
                    <span className="font-medium">{formatEur(vehicleCost)}</span>
                  </div>
                  {exc.currentCapacity > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Capienza</span>
                      <span>{exc.currentCapacity} posti</span>
                    </div>
                  )}
                  {exc.switchThreshold != null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Soglia cambio</span>
                      <span>{exc.switchThreshold} aderenti</span>
                    </div>
                  )}
                  {exc.operationalNotes && (
                    <div className="mt-2 pt-2 border-t border-border/50 text-muted-foreground text-xs leading-relaxed">
                      {exc.operationalNotes}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-3 flex justify-end">
              <Link
                href={`/excursions/${exc.id}`}
                onClick={(e) => e.stopPropagation()}
                className="text-xs font-medium text-primary hover:text-primary/80 underline-offset-2 hover:underline transition-colors"
              >
                Apri dettaglio →
              </Link>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function ExcursionsPage() {
  const { data: excursions, isLoading, error } = useListExcursions();
  const [, setLocation] = useLocation();
  const [showCreateModal, setShowCreateModal] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gite di Gruppo</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Gestisci le gite, monitora le adesioni e il conto economico
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
          data-testid="button-new-excursion"
        >
          <Plus className="w-4 h-4" />
          Nuova Gita
        </button>
      </div>

      {showCreateModal && (
        <ExcursionFormModal
          mode="create"
          onClose={() => setShowCreateModal(false)}
          onSaved={(saved) => setLocation(`~/admin/excursions/${saved.id}`)}
        />
      )}

      {isLoading && (
        <div className="flex items-center justify-center h-40 text-muted-foreground">
          Caricamento gite...
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Errore nel caricamento delle gite. Riprova più tardi.
        </div>
      )}

      {!isLoading && !error && excursions && (
        <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-muted/30">
                  <th className="py-3 pl-4 pr-2 text-left font-semibold text-muted-foreground text-xs uppercase tracking-wider">Gita</th>
                  <th className="py-3 px-2 text-left font-semibold text-muted-foreground text-xs uppercase tracking-wider whitespace-nowrap">Data</th>
                  <th className="py-3 px-2 text-left font-semibold text-muted-foreground text-xs uppercase tracking-wider">Stato</th>
                  <th className="py-3 px-2 text-left font-semibold text-muted-foreground text-xs uppercase tracking-wider min-w-[160px]">Adesioni</th>
                  <th className="py-3 px-2 text-right font-semibold text-muted-foreground text-xs uppercase tracking-wider">Margine</th>
                  <th className="py-3 px-2 text-right font-semibold text-muted-foreground text-xs uppercase tracking-wider">Ricavi stimati</th>
                  <th className="py-3 px-2 text-center font-semibold text-muted-foreground text-xs uppercase tracking-wider">Pagamenti</th>
                  <th className="py-3 pr-4 pl-2"></th>
                </tr>
              </thead>
              <tbody>
                {excursions.map((exc) => (
                  <ExcursionRow key={exc.id} exc={exc} />
                ))}
                {excursions.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-muted-foreground">
                      Nessuna gita trovata. Crea la prima gita!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
