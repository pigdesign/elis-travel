import { Link } from "wouter";
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Users,
  Bus,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  CreditCard,
} from "lucide-react";
import {
  useGetExcursion,
  useUpdateExcursion,
  getGetExcursionQueryKey,
  getListExcursionsQueryKey,
} from "@workspace/api-client-react";
import type { Booking } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CoverImageUploader } from "@/components/shared/CoverImageUploader";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: "Bozza", className: "bg-gray-100 text-gray-700" },
  confirmed: { label: "Confermata", className: "bg-emerald-100 text-emerald-700" },
  completed: { label: "Completata", className: "bg-blue-100 text-blue-700" },
  cancelled: { label: "Annullata", className: "bg-red-100 text-red-700" },
};

const PAYMENT_STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  pending: { label: "In attesa", icon: Clock, className: "text-gray-500" },
  deposit: { label: "Acconto", icon: CreditCard, className: "text-amber-600" },
  paid: { label: "Saldato", icon: CheckCircle, className: "text-emerald-600" },
};

function formatEur(n: number) {
  return n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(dtStr: string) {
  const d = new Date(dtStr);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function AvatarInitials({ name }: { name: string }) {
  const colors = [
    "bg-blue-100 text-blue-700",
    "bg-emerald-100 text-emerald-700",
    "bg-purple-100 text-purple-700",
    "bg-amber-100 text-amber-700",
    "bg-rose-100 text-rose-700",
  ];
  const idx = name.charCodeAt(0) % colors.length;
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${colors[idx]}`}>
      {getInitials(name)}
    </div>
  );
}

function BookingRow({ booking }: { booking: Booking }) {
  const paymentCfg = PAYMENT_STATUS_CONFIG[booking.paymentStatus] ?? PAYMENT_STATUS_CONFIG["pending"];
  const PayIcon = paymentCfg.icon;

  return (
    <tr className="border-b border-border/50 hover:bg-muted/20 transition-colors">
      <td className="py-2.5 pl-4 pr-2">
        <div className="flex items-center gap-2">
          <AvatarInitials name={booking.customerName} />
          <span className="font-medium text-sm text-foreground">{booking.customerName}</span>
        </div>
      </td>
      <td className="py-2.5 px-2 text-center">
        <span className="inline-flex items-center gap-1 text-sm">
          <Users className="w-3.5 h-3.5 text-muted-foreground" />
          {booking.seats}
        </span>
      </td>
      <td className="py-2.5 px-2">
        <span className={`inline-flex items-center gap-1 text-xs font-medium ${paymentCfg.className}`}>
          <PayIcon className="w-3.5 h-3.5" />
          {paymentCfg.label}
        </span>
      </td>
      <td className="py-2.5 pr-4 pl-2 text-sm text-muted-foreground text-right">
        {formatDateTime(booking.bookedAt)}
      </td>
    </tr>
  );
}

interface ExcursionDetailPageProps {
  excursionId: string;
}

export function ExcursionDetailPage({ excursionId }: ExcursionDetailPageProps) {
  const { data: exc, isLoading, error } = useGetExcursion(excursionId);
  const queryClient = useQueryClient();
  const { mutateAsync: updateExcursion } = useUpdateExcursion({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetExcursionQueryKey(excursionId) });
        void queryClient.invalidateQueries({ queryKey: getListExcursionsQueryKey() });
      },
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-60 text-muted-foreground">
        Caricamento gita...
      </div>
    );
  }

  if (error || !exc) {
    return (
      <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
        <AlertCircle className="w-4 h-4 shrink-0" />
        Gita non trovata.
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[exc.status] ?? STATUS_CONFIG["draft"];
  const price = parseFloat(exc.pricePerPerson ?? "0");
  const mealCost = parseFloat(exc.mealCostPerPerson ?? "0");
  const entranceCost = parseFloat(exc.entranceCostPerPerson ?? "0");
  const extraCost = parseFloat(exc.extraCostPerPerson ?? "0");
  const vehicleCost = parseFloat(exc.vehicleFixedCost ?? "0");
  const marginePerPersona = price - mealCost - entranceCost - extraCost;
  const capacityMax = exc.currentCapacity > 0 ? exc.currentCapacity : Math.max(exc.adherentsCount, exc.minThreshold, 1);
  const adherentsPct = Math.min((exc.adherentsCount / capacityMax) * 100, 100);
  const thresholdPct = Math.min((exc.minThreshold / capacityMax) * 100, 100);
  const overThreshold = exc.adherentsCount >= exc.minThreshold;
  const needsVehicleAlert =
    exc.switchThreshold != null &&
    exc.switchVehicleId != null &&
    exc.adherentsCount >= exc.switchThreshold;
  const bookings = exc.bookings ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/excursions" className="p-2 rounded-xl hover:bg-muted/50 transition-colors">
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground truncate">{exc.name}</h1>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusCfg.className}`}>
              {statusCfg.label}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{exc.location}</span>
            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{formatDate(exc.date)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              Immagine di copertina
            </h2>
            <CoverImageUploader
              value={exc.coverImageUrl}
              onChange={async (url) => {
                await updateExcursion({ id: excursionId, data: { coverImageUrl: url } });
              }}
              testIdPrefix="excursion-cover"
            />
          </div>

          <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-1.5">
              <Users className="w-4 h-4" /> Stato Adesioni
            </h2>

            <div className="flex items-end gap-4 mb-4">
              <div>
                <div className="text-4xl font-bold text-foreground">{exc.adherentsCount}</div>
                <div className="text-sm text-muted-foreground">aderenti su {capacityMax} posti</div>
              </div>
              <div className="flex gap-3 pb-1">
                <div className="text-center">
                  <div className="text-xl font-bold text-amber-600">{exc.depositsCount}</div>
                  <div className="text-xs text-muted-foreground">acconti</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-emerald-600">{exc.balancesCount}</div>
                  <div className="text-xs text-muted-foreground">saldi</div>
                </div>
              </div>
            </div>

            <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden mb-1">
              {adherentsPct > 0 && (
                <div
                  className={`absolute left-0 top-0 h-full rounded-full transition-all ${overThreshold ? "bg-emerald-500" : "bg-amber-400"}`}
                  style={{ width: `${adherentsPct}%` }}
                />
              )}
              {thresholdPct > 0 && thresholdPct < 100 && (
                <div
                  className="absolute top-0 h-full w-0.5 bg-gray-500"
                  style={{ left: `${thresholdPct}%` }}
                />
              )}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0</span>
              <span className="text-gray-600">Soglia min: {exc.minThreshold}</span>
              <span>{capacityMax}</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border/50">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Users className="w-4 h-4" /> Partecipanti ({bookings.length})
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/20 border-b border-border/50">
                    <th className="py-2 pl-4 pr-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nome</th>
                    <th className="py-2 px-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Posti</th>
                    <th className="py-2 px-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pagamento</th>
                    <th className="py-2 pr-4 pl-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Prenotato il</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => (
                    <BookingRow key={b.id} booking={b} />
                  ))}
                  {bookings.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-10 text-center text-muted-foreground">
                        Nessuna prenotazione ancora
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4" /> Conto Economico
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ricavi stimati</span>
                <span className="font-medium">{formatEur(exc.ricaviStimati)}</span>
              </div>
              <div className="h-px bg-border/50 my-2" />
              <div className="flex justify-between text-muted-foreground">
                <span>Costo veicolo</span>
                <span>– {formatEur(vehicleCost)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Costi variabili</span>
                <span>– {formatEur(exc.costiVariabili)}</span>
              </div>
              <div className="h-px bg-border/50 my-2" />
              <div className="flex justify-between font-semibold text-base">
                <span>Margine netto</span>
                <span className={exc.margineNetto >= 0 ? "text-emerald-600" : "text-red-500"}>
                  {formatEur(exc.margineNetto)}
                </span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-border/50">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Dettaglio per persona
              </h3>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Prezzo</span>
                  <span>{formatEur(price)}</span>
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
                <div className="flex justify-between font-medium border-t border-border/50 pt-1.5">
                  <span>Margine/persona</span>
                  <span className={marginePerPersona >= 0 ? "text-emerald-600" : "text-red-500"}>
                    {formatEur(marginePerPersona)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <Bus className="w-4 h-4" /> Logistica Mezzo
            </h2>
            {needsVehicleAlert && (
              <div className="mb-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  Soglia cambio mezzo raggiunta ({exc.switchThreshold} aderenti). Valutare veicolo alternativo.
                </span>
              </div>
            )}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Costo fisso</span>
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
      </div>
    </div>
  );
}
