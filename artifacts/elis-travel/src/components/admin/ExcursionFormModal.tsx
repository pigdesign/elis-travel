import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Loader2,
  Save,
  X,
  Plus,
  Trash2,
  MapPin,
  Clock,
} from "lucide-react";
import {
  useCreateExcursion,
  useUpdateExcursion,
  useListExcursions,
  useListVehicles,
  useListPickupLocations,
  useListExcursionPickupPoints,
  useAddExcursionPickupPoint,
  useDeleteExcursionPickupPoint,
  useUpdateExcursionPickupPoint,
  useListAgeRanges,
  useListExcursionAgePrices,
  useUpdateExcursionAgePrices,
  getGetExcursionQueryKey,
  getListExcursionsQueryKey,
  getListExcursionPickupPointsQueryKey,
  getListExcursionAgePricesQueryKey,
} from "@workspace/api-client-react";
import type {
  ExcursionDetail,
  ExcursionCreateInput,
  ExcursionInputCategory,
  ExcursionInputStatus,
  ExcursionSummary,
  ScheduleDay,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CoverImageUploader } from "@/components/shared/CoverImageUploader";
import { ScheduleEditor } from "@/components/shared/ScheduleEditor";
import { TagMultiCombobox } from "@/components/shared/TagMultiCombobox";
import { provinceName } from "@/data/provinces";
import {
  departureAtToRomeLocal,
  romeLocalDateTimeToIso,
} from "@/lib/excursion-time";

// Suggerimenti iniziali per i tag (le voci tipologia storiche del sito).
const DEFAULT_TAG_SUGGESTIONS = [
  "In giornata",
  "Weekend",
  "Mare",
  "Montagna",
  "Cultura",
];

const STATUS_OPTIONS = [
  { value: "draft", label: "Bozza" },
  { value: "open", label: "Aperta (raccolta adesioni)" },
] as const;

const CATEGORY_OPTIONS = [
  { value: "standard", label: "Standard — elenco Gite del sito" },
  { value: "rident", label: "Rident — sezione dedicata" },
] as const;

const EXCURSION_INPUT_STATUSES = new Set<string>(["draft", "open"]);

function isExcursionInputStatus(value: string): value is ExcursionInputStatus {
  return EXCURSION_INPUT_STATUSES.has(value);
}

function isExcursionInputCategory(
  value: string,
): value is ExcursionInputCategory {
  return value === "standard" || value === "rident";
}

// Riga extra nel form: il prezzo è stringa (input controllato), convertito a numero al salvataggio.
type ExtraRow = { name: string; price: string };

type FormState = {
  name: string;
  location: string;
  date: string;
  departureTime: string;
  status: string;
  category: string;
  tags: string[];
  pricePerPerson: string;
  mealCostPerPerson: string;
  entranceCostPerPerson: string;
  extras: ExtraRow[];
  // "Altri costi": costi fissi a carico dell'agenzia (NON per persona).
  otherCosts: ExtraRow[];
  // Variazione prezzo a persona per provincia dei punti di raccolta (sigla →
  // euro, stringa perché input controllato; positivo = supplemento, negativo =
  // sconto). Vuoto o "0" = nessuna variazione.
  provinceSurcharges: Record<string, string>;
  currentCapacity: string;
  minThreshold: string;
  vehicleId: string;
  vehicleFixedCost: string;
  switchThreshold: string;
  switchVehicleId: string;
  switchVehicleAdditionalCost: string;
  operationalNotes: string;
  coverImageUrl: string | null;
  schedule: ScheduleDay[];
  included: string;
  excluded: string;
  generalInfo: string;
  // ---- Gite v2 ----
  patientPrice: string;
  companionPrice: string;
  returnDate: string;
  bookingCloseDate: string;
  depositEnabled: boolean;
  depositType: string;
  depositValue: string;
  depositAvailableAfterConfirm: boolean;
  depositDeadlineDate: string;
  balanceDeadlineDate: string;
  balanceHoursOverride: string;
  payCardEnabled: boolean;
  payBankTransferEnabled: boolean;
  payOfficeEnabled: boolean;
  bankTransferHoursOverride: string;
  officeHoursOverride: string;
  fullPaymentOnlyDaysBefore: string;
  waitlistEnabled: boolean;
};

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function emptyState(): FormState {
  return {
    name: "",
    location: "",
    date: todayISO(),
    departureTime: "",
    status: "draft",
    category: "standard",
    tags: [],
    pricePerPerson: "0",
    mealCostPerPerson: "0",
    entranceCostPerPerson: "0",
    extras: [],
    otherCosts: [],
    provinceSurcharges: {},
    currentCapacity: "0",
    minThreshold: "1",
    vehicleId: "",
    vehicleFixedCost: "0",
    switchThreshold: "",
    switchVehicleId: "",
    switchVehicleAdditionalCost: "",
    operationalNotes: "",
    coverImageUrl: null,
    schedule: [],
    included: "",
    excluded: "",
    generalInfo: "",
    patientPrice: "",
    companionPrice: "",
    returnDate: "",
    bookingCloseDate: "",
    depositEnabled: true,
    depositType: "percent",
    depositValue: "",
    depositAvailableAfterConfirm: false,
    depositDeadlineDate: "",
    balanceDeadlineDate: "",
    balanceHoursOverride: "",
    payCardEnabled: true,
    payBankTransferEnabled: true,
    payOfficeEnabled: true,
    bankTransferHoursOverride: "",
    officeHoursOverride: "",
    fullPaymentOnlyDaysBefore: "",
    waitlistEnabled: false,
  };
}

// Ricava le righe extra dalla gita. Retrocompatibilità: gite vecchie senza
// `extras` ma con un extraCostPerPerson > 0 diventano una singola riga senza nome,
// così il valore non va perso alla prima modifica.
function extrasFromExcursion(
  exc: ExcursionDetail | ExcursionSummary,
): ExtraRow[] {
  const list = (exc.extras ?? []).map((e) => ({
    name: e.name ?? "",
    price: String(e.price ?? 0),
  }));
  if (list.length > 0) return list;
  const legacy = Number(exc.extraCostPerPerson ?? "0");
  if (Number.isFinite(legacy) && legacy > 0) {
    return [{ name: "", price: exc.extraCostPerPerson ?? "0" }];
  }
  return [];
}

// Ricava le righe "Altri costi" dalla gita (campo nuovo, nessun fallback legacy).
function otherCostsFromExcursion(
  exc: ExcursionDetail | ExcursionSummary,
): ExtraRow[] {
  return (exc.otherCosts ?? []).map((c) => ({
    name: c.name ?? "",
    price: String(c.price ?? 0),
  }));
}

function fromExcursion(
  exc: ExcursionDetail | ExcursionSummary,
  opts?: { clearDate?: boolean },
): FormState {
  const departureLocal = departureAtToRomeLocal(exc.departureAt);
  return {
    name: exc.name ?? "",
    location: exc.location ?? "",
    date: opts?.clearDate
      ? ""
      : (departureLocal?.date ?? exc.date ?? todayISO()),
    departureTime: opts?.clearDate ? "" : (departureLocal?.time ?? ""),
    status: exc.status ?? "draft",
    category: exc.category ?? "standard",
    tags: exc.tags ?? [],
    pricePerPerson: exc.pricePerPerson ?? "0",
    mealCostPerPerson: exc.mealCostPerPerson ?? "0",
    entranceCostPerPerson: exc.entranceCostPerPerson ?? "0",
    extras: extrasFromExcursion(exc),
    otherCosts: otherCostsFromExcursion(exc),
    provinceSurcharges: Object.fromEntries(
      Object.entries(exc.provinceSurcharges ?? {}).map(([code, value]) => [
        code,
        String(value),
      ]),
    ),
    currentCapacity: String(exc.currentCapacity ?? 0),
    minThreshold: String(exc.minThreshold ?? 1),
    vehicleId: exc.vehicleId ?? "",
    vehicleFixedCost: exc.vehicleFixedCost ?? "0",
    switchThreshold:
      exc.switchThreshold != null ? String(exc.switchThreshold) : "",
    switchVehicleId: exc.switchVehicleId ?? "",
    switchVehicleAdditionalCost: exc.switchVehicleAdditionalCost ?? "",
    operationalNotes: exc.operationalNotes ?? "",
    coverImageUrl: exc.coverImageUrl ?? null,
    schedule: (exc.schedule as ScheduleDay[] | null) ?? [],
    included: exc.included ?? "",
    excluded: exc.excluded ?? "",
    generalInfo: exc.generalInfo ?? "",
    patientPrice: exc.patientPrice ?? "",
    companionPrice: exc.companionPrice ?? "",
    returnDate: opts?.clearDate ? "" : (exc.returnDate ?? ""),
    bookingCloseDate: opts?.clearDate ? "" : (exc.bookingCloseDate ?? ""),
    depositEnabled: exc.depositEnabled !== false,
    depositType: exc.depositType ?? "percent",
    depositValue: exc.depositValue ?? "",
    depositAvailableAfterConfirm: exc.depositAvailableAfterConfirm === true,
    depositDeadlineDate: opts?.clearDate ? "" : (exc.depositDeadlineDate ?? ""),
    balanceDeadlineDate: opts?.clearDate ? "" : (exc.balanceDeadlineDate ?? ""),
    balanceHoursOverride:
      exc.balanceHoursOverride != null ? String(exc.balanceHoursOverride) : "",
    payCardEnabled: exc.payCardEnabled !== false,
    payBankTransferEnabled: exc.payBankTransferEnabled !== false,
    payOfficeEnabled: exc.payOfficeEnabled !== false,
    bankTransferHoursOverride:
      exc.bankTransferHoursOverride != null
        ? String(exc.bankTransferHoursOverride)
        : "",
    officeHoursOverride:
      exc.officeHoursOverride != null ? String(exc.officeHoursOverride) : "",
    fullPaymentOnlyDaysBefore:
      exc.fullPaymentOnlyDaysBefore != null
        ? String(exc.fullPaymentOnlyDaysBefore)
        : "",
    waitlistEnabled: exc.waitlistEnabled === true,
  };
}

function normalizeDecimal(s: string): string {
  const cleaned = s.trim().replace(",", ".");
  if (cleaned === "" || isNaN(Number(cleaned))) return "0";
  return String(Number(cleaned));
}

function toPayload(s: FormState): ExcursionCreateInput {
  const editableStatus = isExcursionInputStatus(s.status)
    ? s.status
    : undefined;
  if (!isExcursionInputCategory(s.category)) {
    throw new Error("Categoria gita non valida.");
  }
  const switchThresholdNum =
    s.switchThreshold.trim() === ""
      ? null
      : Math.max(0, parseInt(s.switchThreshold, 10) || 0);
  const switchVehicleId = s.switchVehicleId || null;
  // Extra: scarto le righe completamente vuote; extraCostPerPerson = somma dei prezzi.
  const extras = s.extras
    .map((r) => ({
      name: r.name.trim(),
      price: Number(normalizeDecimal(r.price)),
    }))
    .filter((r) => r.name !== "" || r.price !== 0);
  const extraTotal = extras.reduce((sum, r) => sum + r.price, 0);
  // Altri costi: costi fissi a carico dell'agenzia; il totale lo ricalcola il server.
  const otherCosts = s.otherCosts
    .map((r) => ({
      name: r.name.trim(),
      price: Number(normalizeDecimal(r.price)),
    }))
    .filter((r) => r.name !== "" || r.price !== 0);
  const departureAt = romeLocalDateTimeToIso(s.date, s.departureTime);
  if (!departureAt) {
    throw new Error(
      "Data o ora di partenza non valida per il fuso Europe/Rome.",
    );
  }
  return {
    name: s.name.trim(),
    location: s.location.trim(),
    date: s.date,
    departureAt,
    ...(editableStatus ? { status: editableStatus } : {}),
    category: s.category,
    // I tag valgono solo per le gite standard.
    tags: s.category === "rident" ? [] : s.tags,
    pricePerPerson: normalizeDecimal(s.pricePerPerson),
    mealCostPerPerson: normalizeDecimal(s.mealCostPerPerson),
    entranceCostPerPerson: normalizeDecimal(s.entranceCostPerPerson),
    extras,
    extraCostPerPerson: extraTotal.toFixed(2),
    otherCosts,
    // Solo i valori ≠ 0 (positivo = supplemento, negativo = sconto): assenza dalla mappa = 0.
    provinceSurcharges: Object.fromEntries(
      Object.entries(s.provinceSurcharges)
        .map(
          ([code, value]) => [code, Number(normalizeDecimal(value))] as const,
        )
        .filter(([, n]) => Number.isFinite(n) && n !== 0),
    ),
    currentCapacity: Math.max(0, parseInt(s.currentCapacity, 10) || 0),
    minThreshold: Math.max(0, parseInt(s.minThreshold, 10) || 0),
    vehicleId: s.vehicleId || null,
    vehicleFixedCost: normalizeDecimal(s.vehicleFixedCost),
    switchThreshold: switchThresholdNum,
    switchVehicleId,
    // Additional cost only makes sense if alternative vehicle is selected.
    switchVehicleAdditionalCost:
      switchVehicleId && s.switchVehicleAdditionalCost.trim() !== ""
        ? normalizeDecimal(s.switchVehicleAdditionalCost)
        : null,
    operationalNotes:
      s.operationalNotes.trim() === "" ? null : s.operationalNotes.trim(),
    coverImageUrl: s.coverImageUrl,
    schedule: s.schedule.length > 0 ? s.schedule : null,
    included: s.included.trim() || null,
    excluded: s.excluded.trim() || null,
    generalInfo: s.generalInfo.trim() || null,
    patientPrice:
      s.category === "rident" && s.patientPrice.trim() !== ""
        ? normalizeDecimal(s.patientPrice)
        : null,
    companionPrice:
      s.category === "rident" && s.companionPrice.trim() !== ""
        ? normalizeDecimal(s.companionPrice)
        : null,
    returnDate: s.returnDate || null,
    bookingCloseDate: s.bookingCloseDate || null,
    depositEnabled: s.depositEnabled,
    depositType: s.depositType === "fixed" ? "fixed" : "percent",
    depositValue:
      s.depositValue.trim() !== "" ? normalizeDecimal(s.depositValue) : null,
    depositAvailableAfterConfirm: s.depositAvailableAfterConfirm,
    depositDeadlineDate: s.depositDeadlineDate || null,
    balanceDeadlineDate: s.balanceDeadlineDate || null,
    balanceHoursOverride:
      s.balanceHoursOverride.trim() !== ""
        ? Math.max(1, parseInt(s.balanceHoursOverride, 10) || 0)
        : null,
    payCardEnabled: s.payCardEnabled,
    payBankTransferEnabled: s.payBankTransferEnabled,
    payOfficeEnabled: s.payOfficeEnabled,
    bankTransferHoursOverride:
      s.bankTransferHoursOverride.trim() !== ""
        ? Math.max(1, parseInt(s.bankTransferHoursOverride, 10) || 0)
        : null,
    officeHoursOverride:
      s.officeHoursOverride.trim() !== ""
        ? Math.max(1, parseInt(s.officeHoursOverride, 10) || 0)
        : null,
    fullPaymentOnlyDaysBefore:
      s.fullPaymentOnlyDaysBefore.trim() !== ""
        ? Math.max(0, parseInt(s.fullPaymentOnlyDaysBefore, 10) || 0)
        : null,
    waitlistEnabled: s.waitlistEnabled,
  };
}

// ---- Prezzi per fascia età (gite standard) ----

// Componente controllato: i valori vivono nel form e partono col bottone di
// salvataggio generale, anche quando la gita non esiste ancora. Le fasce
// arrivano dalle Impostazioni, quindi si possono compilare già in creazione.
function AgePricesSection({
  adultPrice,
  values,
  onChange,
}: {
  adultPrice: string;
  values: Record<string, string>;
  onChange: (ageRangeId: string, value: string) => void;
}) {
  const { data: allRanges = [], isLoading } = useListAgeRanges();
  const ranges = useMemo(() => allRanges.filter((r) => r.active), [allRanges]);

  if (isLoading) {
    return (
      <p className="text-xs text-muted-foreground">Caricamento fasce età…</p>
    );
  }
  if (ranges.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Nessuna fascia età attiva: configurale nelle Impostazioni.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">
        Gli adulti pagano il prezzo base ({adultPrice || "0"} €). Per ogni
        fascia: 0 = gratuito, vuoto = stesso prezzo adulto.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {ranges.map((r) => (
          <div key={r.id}>
            <label className="block text-xs font-medium text-foreground mb-1">
              {r.label}
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0"
                value={values[r.id] ?? ""}
                onChange={(e) => onChange(r.id, e.target.value)}
                placeholder="= adulto"
                className="w-full pl-3 pr-6 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                data-testid={`input-age-price-${r.label.replace(/\s+/g, "-")}`}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                €
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Punti di raccolta ----

/** Punto scelto prima che la gita esista: sul server non c'è ancora nulla. */
export type DraftPickupPoint = {
  pickupLocationId: string;
  pickupTime: string | null;
};

/**
 * In modifica i punti stanno sul server e ogni aggiunta/rimozione parte subito.
 * In creazione la gita non ha ancora un id: gli stessi comandi lavorano sulla
 * lista `draftPoints`, che il form invia dopo aver creato la gita. La UI (e i
 * supplementi per provincia che ne derivano) è identica nei due casi.
 */
function PickupPointsSection({
  excursionId,
  draftPoints,
  onDraftChange,
  surcharges,
  onSurchargeChange,
  surchargeError,
}: {
  excursionId?: string;
  draftPoints: DraftPickupPoint[];
  onDraftChange: (next: DraftPickupPoint[]) => void;
  surcharges: Record<string, string>;
  onSurchargeChange: (code: string, value: string) => void;
  surchargeError?: string;
}) {
  const queryClient = useQueryClient();
  const { data: allLocations = [] } = useListPickupLocations();
  const { data: serverPoints = [], isLoading: isLoadingServer } =
    useListExcursionPickupPoints(excursionId ?? "", {
      query: {
        enabled: !!excursionId,
        queryKey: getListExcursionPickupPointsQueryKey(excursionId ?? ""),
      },
    });

  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [newTime, setNewTime] = useState("");

  const invalidate = () =>
    void queryClient.invalidateQueries({
      queryKey: getListExcursionPickupPointsQueryKey(excursionId ?? ""),
    });

  const { mutate: addPoint, isPending: isAdding } = useAddExcursionPickupPoint({
    mutation: {
      onSuccess: () => {
        setSelectedLocationId("");
        setNewTime("");
        invalidate();
      },
    },
  });

  const { mutate: removePoint } = useDeleteExcursionPickupPoint({
    mutation: { onSuccess: invalidate },
  });

  const { mutate: updateTime } = useUpdateExcursionPickupPoint({
    mutation: { onSuccess: invalidate },
  });

  // Forma comune alle due modalità: `id` esiste solo per i punti già sul server.
  const points = useMemo(() => {
    if (excursionId) {
      return serverPoints.map((p) => ({
        key: p.id,
        id: p.id as string | null,
        pickupLocationId: p.pickupLocationId,
        pickupTime: p.pickupTime,
        location: p.location,
      }));
    }
    const byId = new Map(allLocations.map((l) => [l.id, l]));
    return draftPoints.flatMap((d) => {
      const location = byId.get(d.pickupLocationId);
      // Una location cancellata dalle Impostazioni mentre il form è aperto non
      // deve far sparire la riga in modo silenzioso: senza dati da mostrare la
      // si salta, e il salvataggio la ignorerà comunque.
      return location
        ? [
            {
              key: d.pickupLocationId,
              id: null as string | null,
              pickupLocationId: d.pickupLocationId,
              pickupTime: d.pickupTime,
              location,
            },
          ]
        : [];
    });
  }, [excursionId, serverPoints, draftPoints, allLocations]);

  const isLoading = excursionId ? isLoadingServer : false;

  const handleAdd = () => {
    if (!selectedLocationId) return;
    const pickupTime = newTime.trim() || null;
    if (excursionId) {
      addPoint({
        id: excursionId,
        data: { pickupLocationId: selectedLocationId, pickupTime },
      });
      return;
    }
    onDraftChange([
      ...draftPoints,
      { pickupLocationId: selectedLocationId, pickupTime },
    ]);
    setSelectedLocationId("");
    setNewTime("");
  };

  const handleRemove = (point: (typeof points)[number]) => {
    if (excursionId && point.id) {
      removePoint({ id: excursionId, ppId: point.id });
      return;
    }
    onDraftChange(
      draftPoints.filter(
        (d) => d.pickupLocationId !== point.pickupLocationId,
      ),
    );
  };

  const handleTimeChange = (
    point: (typeof points)[number],
    value: string,
  ) => {
    const pickupTime = value.trim() || null;
    if (excursionId && point.id) {
      updateTime({
        id: excursionId,
        ppId: point.id,
        data: { pickupTime },
      });
      return;
    }
    onDraftChange(
      draftPoints.map((d) =>
        d.pickupLocationId === point.pickupLocationId
          ? { ...d, pickupTime }
          : d,
      ),
    );
  };

  const usedLocationIds = new Set(points.map((p) => p.pickupLocationId));
  const availableLocations = allLocations.filter(
    (l) => !usedLocationIds.has(l.id),
  );

  // Province coinvolte, dedotte dai punti selezionati: il supplemento si
  // imposta una sola volta per provincia, qualunque sia il numero di punti.
  const provinceCodes = Array.from(
    new Set(
      points
        .map((p) => p.location.province)
        .filter((c): c is string => Boolean(c)),
    ),
  ).sort((a, b) =>
    (provinceName(a) ?? a).localeCompare(provinceName(b) ?? b, "it"),
  );
  const pointsWithoutProvince = points.filter((p) => !p.location.province);

  return (
    <section className="space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Punti di raccolta
      </h4>
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      ) : (
        <ul className="space-y-2">
          {points.length === 0 && (
            <li className="text-xs text-muted-foreground">
              Nessun punto aggiunto.
            </li>
          )}
          {points.map((pp) => (
            <li
              key={pp.key}
              className="flex items-center gap-2 px-3 py-2 border border-border rounded-xl"
            >
              <MapPin className="w-3.5 h-3.5 text-accent shrink-0" />
              <span className="flex-1 text-sm font-medium text-foreground">
                {pp.location.name}
                <span className="text-xs text-muted-foreground ml-1">
                  ({pp.location.city}
                  {pp.location.province ? `, ${pp.location.province}` : ""})
                </span>
              </span>
              <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <input
                type="text"
                defaultValue={pp.pickupTime ?? ""}
                onBlur={(e) => {
                  if (e.target.value.trim() !== (pp.pickupTime ?? "")) {
                    handleTimeChange(pp, e.target.value);
                  }
                }}
                placeholder="Orario"
                className="w-20 px-2 py-1 border border-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
              <button
                type="button"
                onClick={() => handleRemove(pp)}
                className="p-1 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {availableLocations.length > 0 && (
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-xs text-muted-foreground mb-1">
              Aggiungi punto
            </label>
            <select
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
              className="w-full px-2 py-1.5 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">— Seleziona —</option>
              {availableLocations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.city}
                  {l.province ? `, ${l.province}` : ""})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Orario
            </label>
            <input
              type="text"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              placeholder="es. 05:30"
              className="w-24 px-2 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <button
            type="button"
            disabled={!selectedLocationId || isAdding}
            onClick={handleAdd}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-primary text-white disabled:opacity-50 mb-0.5"
          >
            {isAdding ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            Aggiungi
          </button>
        </div>
      )}
      {allLocations.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Configura prima i punti di raccolta in Impostazioni.
        </p>
      )}

      {/* Variazione prezzo per provincia: una riga per provincia dei punti scelti. */}
      {provinceCodes.length > 0 && (
        <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Variazione prezzo per provincia
          </div>
          <p className="text-[11px] text-muted-foreground">
            Variazione tariffaria a persona in base alla provincia di raccolta:
            positivo = supplemento, negativo = sconto. Si imposta una volta per
            provincia (vale per tutti i suoi punti) e si salva insieme alla
            gita. Vuoto o 0 = nessuna variazione. Uno sconto non può superare il
            prezzo base del partecipante.
          </p>
          {provinceCodes.map((code) => {
            const rawSurcharge = surcharges[code] ?? "";
            const surchargeValue = Number(rawSurcharge.replace(",", "."));
            const surchargeKind =
              rawSurcharge.trim() === "" ||
              !Number.isFinite(surchargeValue) ||
              surchargeValue === 0
                ? null
                : surchargeValue > 0
                  ? "supplemento"
                  : "sconto";
            return (
              <div key={code} className="flex items-center gap-2">
                <span className="flex-1 text-sm text-foreground">
                  {provinceName(code)}
                  <span className="text-xs text-muted-foreground ml-1">
                    ({code})
                  </span>
                </span>
                <span
                  className={`w-20 text-right text-[10px] font-semibold uppercase tracking-wider ${
                    surchargeKind === "supplemento"
                      ? "text-emerald-700"
                      : surchargeKind === "sconto"
                        ? "text-accent"
                        : "text-transparent"
                  }`}
                  data-testid={`badge-province-surcharge-${code}`}
                >
                  {surchargeKind === "supplemento"
                    ? "Supplemento"
                    : surchargeKind === "sconto"
                      ? "Sconto"
                      : "—"}
                </span>
                <span className="text-xs text-muted-foreground">€</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={surcharges[code] ?? ""}
                  onChange={(e) => onSurchargeChange(code, e.target.value)}
                  placeholder="0"
                  className="w-20 px-2 py-1 border border-border rounded-lg text-xs text-right focus:outline-none focus:ring-1 focus:ring-primary/30"
                  data-testid={`input-province-surcharge-${code}`}
                />
                <span className="text-xs text-muted-foreground">/persona</span>
              </div>
            );
          })}
          {surchargeError && (
            <p className="text-xs text-red-600">{surchargeError}</p>
          )}
        </div>
      )}
      {pointsWithoutProvince.length > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          Punti senza provincia (nessun supplemento applicabile):{" "}
          {pointsWithoutProvince.map((p) => p.location.name).join(", ")}.
          Imposta la provincia in Impostazioni → Punti di raccolta.
        </p>
      )}
    </section>
  );
}

export interface ExcursionFormModalProps {
  mode: "create" | "edit";
  initial?: ExcursionDetail | ExcursionSummary;
  /**
   * When true (and mode === "create"), the form is treated as a duplication
   * template: all fields are pre-filled from `initial`, but the date is left
   * blank so the admin must pick a new one. Booking counters are not carried
   * over (they are zeroed by the create endpoint).
   */
  isDuplicate?: boolean;
  onClose: () => void;
  onSaved?: (excursion: ExcursionSummary) => void;
}

export function ExcursionFormModal({
  mode,
  initial,
  isDuplicate,
  onClose,
  onSaved,
}: ExcursionFormModalProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => {
    if (!initial) return emptyState();
    const initialForm = fromExcursion(initial, {
      clearDate: mode === "create" && !!isDuplicate,
    });
    return mode === "create"
      ? { ...initialForm, status: "draft" }
      : initialForm;
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const { data: vehicles } = useListVehicles();

  // Suggerimenti tag: default storici + tag già usati sulle gite esistenti (dedup case-insensitive).
  const { data: allExcursions = [] } = useListExcursions();
  const tagSuggestions = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const d of DEFAULT_TAG_SUGGESTIONS) byKey.set(d.toLowerCase(), d);
    for (const ex of allExcursions) {
      for (const t of ex.tags ?? []) {
        const name = t.trim();
        if (name && !byKey.has(name.toLowerCase()))
          byKey.set(name.toLowerCase(), name);
      }
    }
    return Array.from(byKey.values());
  }, [allExcursions]);

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: getListExcursionsQueryKey(),
    });
    if (mode === "edit" && initial?.id) {
      void queryClient.invalidateQueries({
        queryKey: getGetExcursionQueryKey(initial.id),
      });
    }
  };

  const { mutateAsync: createExcursion, isPending: isCreating } =
    useCreateExcursion({
      mutation: { onSuccess: invalidate },
    });
  const { mutateAsync: updateExcursion, isPending: isUpdating } =
    useUpdateExcursion({
      mutation: { onSuccess: invalidate },
    });

  // ---- Prezzi per fascia età e punti di raccolta ----
  // Vivono qui, non nelle rispettive sezioni, perché partono col salvataggio
  // generale: in creazione la gita non ha ancora un id e si scrivono subito
  // dopo averla creata.
  const [agePrices, setAgePrices] = useState<Record<string, string>>({});
  const [draftPickupPoints, setDraftPickupPoints] = useState<
    DraftPickupPoint[]
  >([]);

  const { mutateAsync: saveAgePrices } = useUpdateExcursionAgePrices();
  const { mutateAsync: addPickupPoint } = useAddExcursionPickupPoint();

  const { data: existingAgePrices } = useListExcursionAgePrices(
    initial?.id ?? "",
    {
      query: {
        enabled: mode === "edit" && !!initial?.id,
        queryKey: getListExcursionAgePricesQueryKey(initial?.id ?? ""),
      },
    },
  );

  // Popola i campi una sola volta: dopo, comanda quello che l'utente digita.
  const [agePricesLoaded, setAgePricesLoaded] = useState(false);
  useEffect(() => {
    if (agePricesLoaded || !existingAgePrices) return;
    setAgePrices(
      Object.fromEntries(
        existingAgePrices.map((r) => [r.ageRangeId, r.price ?? ""]),
      ),
    );
    setAgePricesLoaded(true);
  }, [existingAgePrices, agePricesLoaded]);

  // Auto-fill vehicle fixed cost & capacity when picking a vehicle (only if creating or empty)
  const selectedVehicle = useMemo(
    () => vehicles?.find((v) => v.id === form.vehicleId),
    [vehicles, form.vehicleId],
  );
  useEffect(() => {
    if (mode !== "create") return;
    if (!selectedVehicle) return;
    setForm((prev) => ({
      ...prev,
      vehicleFixedCost:
        prev.vehicleFixedCost === "0" || prev.vehicleFixedCost === ""
          ? selectedVehicle.fixedCost
          : prev.vehicleFixedCost,
      currentCapacity:
        prev.currentCapacity === "0" || prev.currentCapacity === ""
          ? String(selectedVehicle.capacity)
          : prev.currentCapacity,
    }));
  }, [selectedVehicle, mode]);

  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((p) => ({ ...p, [k]: v }));
  };

  const selectPrimaryVehicle = (vehicleId: string) => {
    const vehicle = vehicles?.find((item) => item.id === vehicleId);
    setForm((previous) => ({
      ...previous,
      vehicleId,
      ...(vehicle
        ? {
            currentCapacity: String(vehicle.capacity),
            vehicleFixedCost: vehicle.fixedCost,
          }
        : {}),
    }));
  };

  const addExtra = () =>
    setForm((p) => ({ ...p, extras: [...p.extras, { name: "", price: "" }] }));
  const removeExtra = (i: number) =>
    setForm((p) => ({ ...p, extras: p.extras.filter((_, idx) => idx !== i) }));
  const updateExtra = (i: number, key: keyof ExtraRow, value: string) =>
    setForm((p) => ({
      ...p,
      extras: p.extras.map((r, idx) =>
        idx === i ? { ...r, [key]: value } : r,
      ),
    }));
  const extraTotal = form.extras.reduce((sum, r) => {
    const n = Number(String(r.price).replace(",", "."));
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);

  const addOtherCost = () =>
    setForm((p) => ({
      ...p,
      otherCosts: [...p.otherCosts, { name: "", price: "" }],
    }));
  const removeOtherCost = (i: number) =>
    setForm((p) => ({
      ...p,
      otherCosts: p.otherCosts.filter((_, idx) => idx !== i),
    }));
  const updateOtherCost = (i: number, key: keyof ExtraRow, value: string) =>
    setForm((p) => ({
      ...p,
      otherCosts: p.otherCosts.map((r, idx) =>
        idx === i ? { ...r, [key]: value } : r,
      ),
    }));
  const otherCostTotal = form.otherCosts.reduce((sum, r) => {
    const n = Number(String(r.price).replace(",", "."));
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    const checkDecimalNonNeg = (key: keyof FormState, label: string) => {
      const raw = String(form[key] ?? "").trim();
      if (raw === "") return; // empty is allowed for optional fields; required ones are checked elsewhere
      const n = Number(raw.replace(",", "."));
      if (isNaN(n) || n < 0) errs[key as string] = `${label} non valido (≥ 0).`;
    };
    const checkIntNonNeg = (key: keyof FormState, label: string) => {
      const raw = String(form[key] ?? "").trim();
      if (raw === "") return;
      const n = parseInt(raw, 10);
      if (isNaN(n) || n < 0) errs[key as string] = `${label} non valido (≥ 0).`;
    };

    if (!form.name.trim()) errs.name = "Il nome è obbligatorio.";
    if (!form.location.trim()) errs.location = "Il luogo è obbligatorio.";
    if (!form.date) errs.date = "La data è obbligatoria.";
    if (!form.departureTime) {
      errs.departureTime = "L'ora di partenza è obbligatoria.";
    } else if (
      form.date &&
      !romeLocalDateTimeToIso(form.date, form.departureTime)
    ) {
      errs.departureTime = "Ora non valida nel fuso Europe/Rome.";
    }

    if (form.pricePerPerson.trim() === "") {
      errs.pricePerPerson = "Inserisci un prezzo (≥ 0).";
    } else {
      checkDecimalNonNeg("pricePerPerson", "Prezzo");
    }
    checkDecimalNonNeg("mealCostPerPerson", "Costo pasto");
    checkDecimalNonNeg("entranceCostPerPerson", "Costo ingressi");
    const badExtra = form.extras.some((r) => {
      const raw = r.price.trim();
      if (raw === "") return false;
      const n = Number(raw.replace(",", "."));
      return isNaN(n) || n < 0;
    });
    if (badExtra) errs.extras = "Prezzo extra non valido (≥ 0).";
    const badOtherCost = form.otherCosts.some((r) => {
      const raw = r.price.trim();
      if (raw === "") return false;
      const n = Number(raw.replace(",", "."));
      return isNaN(n) || n < 0;
    });
    if (badOtherCost)
      errs.otherCosts = "Prezzo “Altri costi” non valido (≥ 0).";
    const badSurcharge = Object.values(form.provinceSurcharges).some((raw) => {
      const t = raw.trim();
      if (t === "") return false;
      const n = Number(t.replace(",", "."));
      return isNaN(n);
    });
    if (badSurcharge)
      errs.provinceSurcharges =
        "Valore provincia non valido (inserisci un numero, anche negativo).";
    checkDecimalNonNeg("vehicleFixedCost", "Costo mezzo");
    checkDecimalNonNeg(
      "switchVehicleAdditionalCost",
      "Costo aggiuntivo mezzo alternativo",
    );
    checkIntNonNeg("currentCapacity", "Capienza");
    checkIntNonNeg("minThreshold", "Soglia minima");
    checkIntNonNeg("switchThreshold", "Soglia cambio mezzo");

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!validate()) return;
    try {
      const payload = toPayload(form);
      let saved: ExcursionSummary;
      if (mode === "create") {
        saved = await createExcursion({ data: payload });
      } else {
        if (!initial?.id) throw new Error("ID gita mancante.");
        const updatePayload = { ...payload };
        if (initial.status !== "draft" && initial.status !== "open") {
          delete updatePayload.status;
        }
        saved = await updateExcursion({
          id: initial.id,
          data: updatePayload,
        });
      }

      // La gita ora ha un id: si scrivono le fasce età e, se arriviamo dalla
      // creazione, i punti di raccolta scelti prima che esistesse.
      const priceEntries = Object.entries(agePrices);
      if (priceEntries.length > 0) {
        await saveAgePrices({
          id: saved.id,
          data: {
            prices: priceEntries.map(([ageRangeId, price]) => ({
              ageRangeId,
              price: price.trim() === "" ? null : price,
            })),
          },
        });
      }
      if (mode === "create" && draftPickupPoints.length > 0) {
        // In sequenza: l'ordine di inserimento decide il sortOrder dei punti.
        for (const point of draftPickupPoints) {
          await addPickupPoint({ id: saved.id, data: point });
        }
      }
      invalidate();
      void queryClient.invalidateQueries({
        queryKey: getListExcursionAgePricesQueryKey(saved.id),
      });
      void queryClient.invalidateQueries({
        queryKey: getListExcursionPickupPointsQueryKey(saved.id),
      });

      onSaved?.(saved);
      onClose();
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string };
      setErrorMsg(
        e?.data?.error ?? e?.message ?? "Impossibile salvare la gita. Riprova.",
      );
    }
  };

  const isPending = isCreating || isUpdating;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto"
      data-testid="modal-excursion-form"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-white rounded-t-2xl">
          <h3 className="text-lg font-bold text-foreground">
            {mode === "create" ? "Nuova Gita" : "Modifica Gita"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted/50"
            data-testid="button-close-excursion-form"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-6">
          {/* Sezione: Informazioni base */}
          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Informazioni
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-foreground mb-1">
                  Nome gita *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Es. Tour Toscana — Siena e San Gimignano"
                  data-testid="input-excursion-name"
                />
                {fieldErrors.name && (
                  <p className="text-xs text-red-600 mt-1">
                    {fieldErrors.name}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Luogo *
                </label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setField("location", e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Es. Siena, Italia"
                  data-testid="input-excursion-location"
                />
                {fieldErrors.location && (
                  <p className="text-xs text-red-600 mt-1">
                    {fieldErrors.location}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Data *
                </label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setField("date", e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-excursion-date"
                />
                {fieldErrors.date && (
                  <p className="text-xs text-red-600 mt-1">
                    {fieldErrors.date}
                  </p>
                )}
                {!fieldErrors.date && form.date && form.date < todayISO() && (
                  <p
                    className="text-xs text-amber-700 mt-1 flex items-center gap-1"
                    data-testid="warning-excursion-past-date"
                  >
                    <AlertCircle className="w-3 h-3" />
                    Attenzione: la data è nel passato.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Ora di partenza *
                </label>
                <input
                  type="time"
                  value={form.departureTime}
                  onChange={(e) => setField("departureTime", e.target.value)}
                  step={60}
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-excursion-departure-time"
                />
                {fieldErrors.departureTime ? (
                  <p className="text-xs text-red-600 mt-1">
                    {fieldErrors.departureTime}
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Fuso Europe/Rome. Il saldo scade 48 ore prima.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Stato
                </label>
                {form.status !== "draft" && form.status !== "open" ? (
                  <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
                    {form.status === "confirmed"
                      ? "Confermata"
                      : form.status === "completed"
                        ? "Completata"
                        : form.status === "cancelled"
                          ? "Annullata"
                          : form.status === "archived"
                            ? "Archiviata"
                            : form.status}
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Lo stato operativo si cambia soltanto dai comandi dedicati
                      nel dettaglio della gita.
                    </p>
                  </div>
                ) : (
                  <select
                    value={form.status}
                    onChange={(e) => setField("status", e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                    data-testid="select-excursion-status"
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-foreground mb-1">
                  Tipo gita
                </label>
                <select
                  value={form.category}
                  onChange={(e) => setField("category", e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                  data-testid="select-excursion-category"
                >
                  {CATEGORY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {form.category === "rident" && (
                  <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    Gita Rident: compare nella pagina Rident del sito (con voce
                    di menu dedicata), non nell'elenco/filtri delle gite
                    standard.
                  </p>
                )}
              </div>

              {form.category === "standard" && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Tag
                  </label>
                  <TagMultiCombobox
                    values={form.tags}
                    onChange={(v) => setField("tags", v)}
                    suggestions={tagSuggestions}
                    placeholder="Aggiungi tag (es. Weekend, Cultura)…"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Temi usati dal filtro “Tipologia” sul sito. Scegli tra gli
                    esistenti o creane di nuovi.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Sezione: Costi & prezzo */}
          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Prezzo e costi per persona (€)
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Prezzo *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.pricePerPerson}
                  onChange={(e) => setField("pricePerPerson", e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-excursion-price"
                />
                {fieldErrors.pricePerPerson && (
                  <p className="text-xs text-red-600 mt-1">
                    {fieldErrors.pricePerPerson}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Pasto
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.mealCostPerPerson}
                  onChange={(e) =>
                    setField("mealCostPerPerson", e.target.value)
                  }
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-excursion-meal"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Ingressi
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.entranceCostPerPerson}
                  onChange={(e) =>
                    setField("entranceCostPerPerson", e.target.value)
                  }
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-excursion-entrance"
                />
              </div>
            </div>

            {/* Extra: voci di costo nominate e ripetibili (guida, assicurazione, ...) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-foreground">
                  Extra (voci di costo per persona)
                </label>
                {form.extras.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    Totale:{" "}
                    {extraTotal.toLocaleString("it-IT", {
                      style: "currency",
                      currency: "EUR",
                    })}
                  </span>
                )}
              </div>

              <div className="space-y-2">
                {form.extras.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Nome (es. Guida, Assicurazione)"
                      value={row.name}
                      onChange={(e) => updateExtra(i, "name", e.target.value)}
                      className="flex-1 min-w-0 px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      data-testid={`input-excursion-extra-name-${i}`}
                    />
                    <div className="relative w-28 shrink-0">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0,00"
                        value={row.price}
                        onChange={(e) =>
                          updateExtra(i, "price", e.target.value)
                        }
                        className="w-full pl-3 pr-6 py-2 border border-border rounded-md text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary"
                        data-testid={`input-excursion-extra-price-${i}`}
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                        €
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeExtra(i)}
                      className="p-2 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                      title="Rimuovi extra"
                      data-testid={`button-remove-extra-${i}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {form.extras.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Nessun extra. Aggiungine uno se ci sono costi accessori
                    (guida, assicurazione, ...).
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={addExtra}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border border-dashed border-border text-primary hover:bg-primary/5 transition-colors"
                data-testid="button-add-extra"
              >
                <Plus className="w-3.5 h-3.5" />
                Aggiungi extra
              </button>

              {fieldErrors.extras && (
                <p className="text-xs text-red-600 mt-1">
                  {fieldErrors.extras}
                </p>
              )}
            </div>
          </section>

          {/* Sezione: Altri costi — costi fissi a carico dell'agenzia (NON per persona) */}
          <section className="space-y-3">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Altri costi
              </h4>
              <p className="text-[11px] text-muted-foreground mt-1">
                Costi fissi a carico dell'agenzia, <strong>non</strong> a
                persona (es. focaccia offerta a tutti durante il viaggio).
                Rientrano nel margine netto ma non nel costo per persona.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-foreground">
                  Voci di costo
                </label>
                {form.otherCosts.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    Totale:{" "}
                    {otherCostTotal.toLocaleString("it-IT", {
                      style: "currency",
                      currency: "EUR",
                    })}
                  </span>
                )}
              </div>

              <div className="space-y-2">
                {form.otherCosts.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Nome (es. Focaccia, Omaggio)"
                      value={row.name}
                      onChange={(e) =>
                        updateOtherCost(i, "name", e.target.value)
                      }
                      className="flex-1 min-w-0 px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      data-testid={`input-excursion-othercost-name-${i}`}
                    />
                    <div className="relative w-28 shrink-0">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0,00"
                        value={row.price}
                        onChange={(e) =>
                          updateOtherCost(i, "price", e.target.value)
                        }
                        className="w-full pl-3 pr-6 py-2 border border-border rounded-md text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary"
                        data-testid={`input-excursion-othercost-price-${i}`}
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                        €
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeOtherCost(i)}
                      className="p-2 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                      title="Rimuovi voce"
                      data-testid={`button-remove-othercost-${i}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {form.otherCosts.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Nessun altro costo. Aggiungine uno per i costi a carico
                    dell'agenzia (non a persona).
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={addOtherCost}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border border-dashed border-border text-primary hover:bg-primary/5 transition-colors"
                data-testid="button-add-othercost"
              >
                <Plus className="w-3.5 h-3.5" />
                Aggiungi voce
              </button>

              {fieldErrors.otherCosts && (
                <p className="text-xs text-red-600 mt-1">
                  {fieldErrors.otherCosts}
                </p>
              )}
            </div>
          </section>

          {/* Sezione: Prezzi partecipanti (Gite v2) */}
          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Prezzi partecipanti
            </h4>
            {form.category === "rident" ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Prezzo paziente (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.patientPrice}
                    onChange={(e) => setField("patientPrice", e.target.value)}
                    placeholder={form.pricePerPerson || "0"}
                    className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    data-testid="input-excursion-patient-price"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Vuoto = vale il prezzo base della gita.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Prezzo accompagnatore (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.companionPrice}
                    onChange={(e) => setField("companionPrice", e.target.value)}
                    placeholder={form.pricePerPerson || "0"}
                    className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    data-testid="input-excursion-companion-price"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Vuoto = vale il prezzo base della gita.
                  </p>
                </div>
              </div>
            ) : (
              <AgePricesSection
                adultPrice={form.pricePerPerson}
                values={agePrices}
                onChange={(ageRangeId, value) =>
                  setAgePrices((prev) => ({ ...prev, [ageRangeId]: value }))
                }
              />
            )}
          </section>

          {/* Sezione: Acconto e saldo (Gite v2) */}
          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Acconto e saldo
            </h4>
            <label className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
              <input
                type="checkbox"
                checked={form.depositEnabled}
                onChange={(e) => setField("depositEnabled", e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
                data-testid="checkbox-excursion-deposit-enabled"
              />
              <span className="text-sm text-foreground">
                Acconto abilitato
                <span className="block text-[11px] text-muted-foreground">
                  Se disattivato, i clienti possono solo pagare l'importo
                  completo.
                </span>
              </span>
            </label>
            {form.depositEnabled && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Tipo acconto
                  </label>
                  <select
                    value={form.depositType}
                    onChange={(e) => setField("depositType", e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                    data-testid="select-excursion-deposit-type"
                  >
                    <option value="percent">Percentuale sul totale</option>
                    <option value="fixed">Importo fisso a persona</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    {form.depositType === "fixed"
                      ? "Importo (€ a persona)"
                      : "Percentuale (%)"}
                  </label>
                  <input
                    type="number"
                    step={form.depositType === "fixed" ? "0.01" : "1"}
                    min="0"
                    value={form.depositValue}
                    onChange={(e) => setField("depositValue", e.target.value)}
                    placeholder={
                      form.depositType === "fixed"
                        ? "es. 50"
                        : "vuoto = impostazione globale"
                    }
                    className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    data-testid="input-excursion-deposit-value"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Data limite acconto
                  </label>
                  <input
                    type="date"
                    value={form.depositDeadlineDate}
                    onChange={(e) =>
                      setField("depositDeadlineDate", e.target.value)
                    }
                    className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    data-testid="input-excursion-deposit-deadline"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Oltre questa data l'acconto non è più proposto.
                  </p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Saldo entro (ore prima della partenza)
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.balanceHoursOverride}
                  onChange={(e) =>
                    setField("balanceHoursOverride", e.target.value)
                  }
                  placeholder="vuoto = impostazione globale"
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-excursion-balance-hours"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Esempio: 48 = scadenza del saldo 48 ore prima dell'orario
                  reale di partenza. Se la gita viene confermata più tardi, il
                  saldo è dovuto subito con il periodo di tolleranza configurato
                  nelle impostazioni.
                </p>
              </div>
            </div>
          </section>

          {/* Sezione: Metodi di pagamento e scadenze (Gite v2) */}
          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Metodi di pagamento e scadenze
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={form.payCardEnabled}
                  onChange={(e) => setField("payCardEnabled", e.target.checked)}
                  className="h-4 w-4 accent-primary"
                  data-testid="checkbox-excursion-pay-card"
                />
                <span className="text-sm text-foreground">Carta</span>
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={form.payBankTransferEnabled}
                  onChange={(e) =>
                    setField("payBankTransferEnabled", e.target.checked)
                  }
                  className="h-4 w-4 accent-primary"
                  data-testid="checkbox-excursion-pay-bank"
                />
                <span className="text-sm text-foreground">Bonifico</span>
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={form.payOfficeEnabled}
                  onChange={(e) =>
                    setField("payOfficeEnabled", e.target.checked)
                  }
                  className="h-4 w-4 accent-primary"
                  data-testid="checkbox-excursion-pay-office"
                />
                <span className="text-sm text-foreground">In ufficio</span>
              </label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Ore scadenza bonifico
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.bankTransferHoursOverride}
                  onChange={(e) =>
                    setField("bankTransferHoursOverride", e.target.value)
                  }
                  placeholder="globale"
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-excursion-bank-hours"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Ore scadenza ufficio
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.officeHoursOverride}
                  onChange={(e) =>
                    setField("officeHoursOverride", e.target.value)
                  }
                  placeholder="globale"
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-excursion-office-hours"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Solo totale da (giorni prima)
                </label>
                <input
                  type="number"
                  min="0"
                  value={form.fullPaymentOnlyDaysBefore}
                  onChange={(e) =>
                    setField("fullPaymentOnlyDaysBefore", e.target.value)
                  }
                  placeholder="globale"
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-excursion-full-only-days"
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              I campi vuoti usano i valori delle Impostazioni globali.
            </p>
          </section>

          {/* Sezione: Capienza & soglia */}
          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Capienza e soglia
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Capienza posti
                </label>
                <input
                  type="number"
                  min="0"
                  value={form.currentCapacity}
                  onChange={(e) => setField("currentCapacity", e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-excursion-capacity"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Lascia 0 se non c'è limite (es. mezzo da definire).
                </p>
                {fieldErrors.currentCapacity && (
                  <p className="text-xs text-red-600 mt-1">
                    {fieldErrors.currentCapacity}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Soglia minima adesioni
                </label>
                <input
                  type="number"
                  min="0"
                  value={form.minThreshold}
                  onChange={(e) => setField("minThreshold", e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-excursion-min-threshold"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Calcolata sulle persone, non sulle prenotazioni.
                </p>
                {fieldErrors.minThreshold && (
                  <p className="text-xs text-red-600 mt-1">
                    {fieldErrors.minThreshold}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Data ritorno
                </label>
                <input
                  type="date"
                  value={form.returnDate}
                  onChange={(e) => setField("returnDate", e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-excursion-return-date"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Facoltativa, per gite di più giorni.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Chiusura prenotazioni
                </label>
                <input
                  type="date"
                  value={form.bookingCloseDate}
                  onChange={(e) => setField("bookingCloseDate", e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-excursion-booking-close"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Oltre questa data il form pubblico è chiuso.
                </p>
              </div>
            </div>
            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={form.waitlistEnabled}
                disabled
                readOnly
                className="mt-0.5 h-4 w-4 cursor-not-allowed accent-primary opacity-60"
                data-testid="checkbox-excursion-waitlist"
              />
              <span className="text-xs text-foreground">
                Lista d'attesa — non ancora attiva
                <span className="block text-[11px] text-muted-foreground">
                  Questo flag è soltanto predisposto nel database: al momento
                  non registra richieste, non assegna priorità e non invia
                  comunicazioni. Il controllo è disabilitato finché il flusso
                  operativo non sarà implementato.
                </span>
              </span>
            </label>
          </section>

          {/* Sezione: Mezzo */}
          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Mezzo di trasporto
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Mezzo principale
                </label>
                <select
                  value={form.vehicleId}
                  onChange={(e) => selectPrimaryVehicle(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                  data-testid="select-excursion-vehicle"
                >
                  <option value="">— Da definire —</option>
                  {vehicles?.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.capacity} posti)
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  La scelta aggiorna capienza e costo del mezzo; il sistema
                  impedisce di scendere sotto i posti già riservati.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Costo fisso mezzo (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.vehicleFixedCost}
                  onChange={(e) => setField("vehicleFixedCost", e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-excursion-vehicle-cost"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Soglia cambio mezzo
                </label>
                <input
                  type="number"
                  min="0"
                  value={form.switchThreshold}
                  onChange={(e) => setField("switchThreshold", e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="(opzionale)"
                  data-testid="input-excursion-switch-threshold"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Mezzo alternativo
                </label>
                <select
                  value={form.switchVehicleId}
                  onChange={(e) => setField("switchVehicleId", e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                  data-testid="select-excursion-switch-vehicle"
                >
                  <option value="">— Nessuno —</option>
                  {vehicles?.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.capacity} posti)
                    </option>
                  ))}
                </select>
              </div>
              {form.switchVehicleId && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Costo aggiuntivo mezzo alternativo (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.switchVehicleAdditionalCost}
                    onChange={(e) =>
                      setField("switchVehicleAdditionalCost", e.target.value)
                    }
                    className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="0.00"
                    data-testid="input-excursion-switch-cost"
                  />
                </div>
              )}
            </div>
          </section>

          {/* Sezione: Note */}
          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Note operative
            </h4>
            <textarea
              value={form.operationalNotes}
              onChange={(e) => setField("operationalNotes", e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-y"
              placeholder="Es. Partenza ore 06:00 da Piazza Roma. Pranzo incluso."
              data-testid="textarea-excursion-notes"
            />
          </section>

          {/* Sezione: Copertina */}
          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Immagine di copertina
            </h4>
            <CoverImageUploader
              value={form.coverImageUrl}
              onChange={(url) => setField("coverImageUrl", url)}
              testIdPrefix="excursion-form-cover"
            />
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                ...oppure incolla un URL immagine
              </label>
              <input
                type="url"
                value={form.coverImageUrl ?? ""}
                onChange={(e) =>
                  setField(
                    "coverImageUrl",
                    e.target.value.trim() === "" ? null : e.target.value,
                  )
                }
                className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="https://..."
                data-testid="input-excursion-cover-url"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Puoi caricare un file con il pulsante sopra oppure incollare
                direttamente un link a un'immagine.
              </p>
            </div>
          </section>

          {/* Sezione: Programma */}
          <ScheduleEditor
            value={form.schedule}
            onChange={(days) => setField("schedule", days)}
          />

          {/* Sezione: Quota */}
          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Quota include / non include
            </h4>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  La quota include
                </label>
                <textarea
                  value={form.included}
                  onChange={(e) => setField("included", e.target.value)}
                  rows={5}
                  placeholder={
                    "Viaggio in Bus GT\nAccompagnatore\nNavigazione Isole Borromee"
                  }
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Una voce per riga.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  La quota non include
                </label>
                <textarea
                  value={form.excluded}
                  onChange={(e) => setField("excluded", e.target.value)}
                  rows={5}
                  placeholder={
                    "Pranzi e bevande\nIngressi a musei\nTassa di soggiorno"
                  }
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Una voce per riga.
                </p>
              </div>
            </div>
          </section>

          {/* Sezione: Info utili */}
          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Informazioni utili
            </h4>
            <textarea
              value={form.generalInfo}
              onChange={(e) => setField("generalInfo", e.target.value)}
              rows={4}
              placeholder={
                "Documenti: carta d'identità valida per l'espatrio.\nCondizioni: il viaggio si effettua al raggiungimento del numero minimo di partecipanti."
              }
              className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-y"
            />
          </section>

          {/* Sezione: Punti di raccolta */}
          <PickupPointsSection
            excursionId={mode === "edit" ? initial?.id : undefined}
            draftPoints={draftPickupPoints}
            onDraftChange={setDraftPickupPoints}
            surcharges={form.provinceSurcharges}
            onSurchargeChange={(code, value) =>
              setForm((p) => ({
                ...p,
                provinceSurcharges: {
                  ...p.provinceSurcharges,
                  [code]: value,
                },
              }))
            }
            surchargeError={fieldErrors.provinceSurcharges}
          />


          {mode === "edit" && initial && "adherentsCount" in initial && (
            <section className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Contatori prenotazioni (sola lettura)
              </h4>
              <div className="grid grid-cols-3 gap-3 bg-muted/30 rounded-md p-3">
                <div>
                  <div className="text-[11px] text-muted-foreground">
                    Aderenti
                  </div>
                  <div
                    className="text-base font-semibold text-foreground"
                    data-testid="text-counter-adherents"
                  >
                    {initial.adherentsCount}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">
                    Acconti
                  </div>
                  <div
                    className="text-base font-semibold text-foreground"
                    data-testid="text-counter-deposits"
                  >
                    {initial.depositsCount}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">
                    Saldati
                  </div>
                  <div
                    className="text-base font-semibold text-foreground"
                    data-testid="text-counter-balances"
                  >
                    {initial.balancesCount}
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Aggiornati automaticamente dalle prenotazioni: non sono
                modificabili da qui.
              </p>
            </section>
          )}

          {errorMsg && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span data-testid="text-form-error">{errorMsg}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-md hover:bg-muted/50 text-muted-foreground"
              data-testid="button-cancel-excursion-form"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-60"
              data-testid="button-submit-excursion-form"
            >
              {isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {mode === "create" ? "Crea gita" : "Salva modifiche"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
