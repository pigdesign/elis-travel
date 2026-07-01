import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, Save, X, Plus, Trash2, MapPin, Clock } from "lucide-react";
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
  getGetExcursionQueryKey,
  getListExcursionsQueryKey,
  getListExcursionPickupPointsQueryKey,
} from "@workspace/api-client-react";
import type {
  ExcursionDetail,
  ExcursionInput,
  ExcursionSummary,
  ScheduleDay,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CoverImageUploader } from "@/components/shared/CoverImageUploader";
import { ScheduleEditor } from "@/components/shared/ScheduleEditor";
import { TagMultiCombobox } from "@/components/shared/TagMultiCombobox";

// Suggerimenti iniziali per i tag (le voci tipologia storiche del sito).
const DEFAULT_TAG_SUGGESTIONS = ["In giornata", "Weekend", "Mare", "Montagna", "Cultura"];

const STATUS_OPTIONS = [
  { value: "draft", label: "Bozza" },
  { value: "open", label: "Aperta (raccolta adesioni)" },
  { value: "confirmed", label: "Confermata" },
  { value: "completed", label: "Completata" },
  { value: "cancelled", label: "Annullata" },
] as const;

const CATEGORY_OPTIONS = [
  { value: "standard", label: "Standard — visibile sul sito" },
  { value: "rident", label: "Rident — privata, solo via link" },
] as const;

type FormState = {
  name: string;
  location: string;
  date: string;
  status: string;
  category: string;
  tags: string[];
  pricePerPerson: string;
  mealCostPerPerson: string;
  entranceCostPerPerson: string;
  extraCostPerPerson: string;
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
};

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function emptyState(): FormState {
  return {
    name: "",
    location: "",
    date: todayISO(),
    status: "draft",
    category: "standard",
    tags: [],
    pricePerPerson: "0",
    mealCostPerPerson: "0",
    entranceCostPerPerson: "0",
    extraCostPerPerson: "0",
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
  };
}

function fromExcursion(
  exc: ExcursionDetail | ExcursionSummary,
  opts?: { clearDate?: boolean },
): FormState {
  return {
    name: exc.name ?? "",
    location: exc.location ?? "",
    date: opts?.clearDate ? "" : exc.date ?? todayISO(),
    status: exc.status ?? "draft",
    category: exc.category ?? "standard",
    tags: exc.tags ?? [],
    pricePerPerson: exc.pricePerPerson ?? "0",
    mealCostPerPerson: exc.mealCostPerPerson ?? "0",
    entranceCostPerPerson: exc.entranceCostPerPerson ?? "0",
    extraCostPerPerson: exc.extraCostPerPerson ?? "0",
    currentCapacity: String(exc.currentCapacity ?? 0),
    minThreshold: String(exc.minThreshold ?? 1),
    vehicleId: exc.vehicleId ?? "",
    vehicleFixedCost: exc.vehicleFixedCost ?? "0",
    switchThreshold: exc.switchThreshold != null ? String(exc.switchThreshold) : "",
    switchVehicleId: exc.switchVehicleId ?? "",
    switchVehicleAdditionalCost: exc.switchVehicleAdditionalCost ?? "",
    operationalNotes: exc.operationalNotes ?? "",
    coverImageUrl: exc.coverImageUrl ?? null,
    schedule: (exc.schedule as ScheduleDay[] | null) ?? [],
    included: exc.included ?? "",
    excluded: exc.excluded ?? "",
    generalInfo: exc.generalInfo ?? "",
  };
}

function normalizeDecimal(s: string): string {
  const cleaned = s.trim().replace(",", ".");
  if (cleaned === "" || isNaN(Number(cleaned))) return "0";
  return String(Number(cleaned));
}

function toPayload(s: FormState): ExcursionInput {
  const switchThresholdNum =
    s.switchThreshold.trim() === "" ? null : Math.max(0, parseInt(s.switchThreshold, 10) || 0);
  const switchVehicleId = s.switchVehicleId || null;
  return {
    name: s.name.trim(),
    location: s.location.trim(),
    date: s.date,
    status: s.status,
    category: s.category,
    // I tag valgono solo per le gite standard.
    tags: s.category === "rident" ? [] : s.tags,
    pricePerPerson: normalizeDecimal(s.pricePerPerson),
    mealCostPerPerson: normalizeDecimal(s.mealCostPerPerson),
    entranceCostPerPerson: normalizeDecimal(s.entranceCostPerPerson),
    extraCostPerPerson: normalizeDecimal(s.extraCostPerPerson),
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
    operationalNotes: s.operationalNotes.trim() === "" ? null : s.operationalNotes.trim(),
    coverImageUrl: s.coverImageUrl,
    schedule: s.schedule.length > 0 ? s.schedule : null,
    included: s.included.trim() || null,
    excluded: s.excluded.trim() || null,
    generalInfo: s.generalInfo.trim() || null,
  };
}

// ---- Pickup points section (edit mode only) ----

function PickupPointsSection({ excursionId }: { excursionId: string }) {
  const queryClient = useQueryClient();
  const { data: allLocations = [] } = useListPickupLocations();
  const { data: points = [], isLoading } = useListExcursionPickupPoints(excursionId);

  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [newTime, setNewTime] = useState("");

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: getListExcursionPickupPointsQueryKey(excursionId) });

  const { mutate: addPoint, isPending: isAdding } = useAddExcursionPickupPoint({
    mutation: {
      onSuccess: () => { setSelectedLocationId(""); setNewTime(""); invalidate(); },
    },
  });

  const { mutate: removePoint } = useDeleteExcursionPickupPoint({
    mutation: { onSuccess: invalidate },
  });

  const { mutate: updateTime } = useUpdateExcursionPickupPoint({
    mutation: { onSuccess: invalidate },
  });

  const usedLocationIds = new Set(points.map((p) => p.pickupLocationId));
  const availableLocations = allLocations.filter((l) => !usedLocationIds.has(l.id));

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
            <li className="text-xs text-muted-foreground">Nessun punto aggiunto.</li>
          )}
          {points.map((pp) => (
            <li key={pp.id} className="flex items-center gap-2 px-3 py-2 border border-border rounded-xl">
              <MapPin className="w-3.5 h-3.5 text-accent shrink-0" />
              <span className="flex-1 text-sm font-medium text-foreground">
                {pp.location.name}
                <span className="text-xs text-muted-foreground ml-1">({pp.location.city})</span>
              </span>
              <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <input
                type="text"
                defaultValue={pp.pickupTime ?? ""}
                onBlur={(e) => {
                  const t = e.target.value.trim();
                  if (t !== (pp.pickupTime ?? "")) {
                    updateTime({ id: excursionId, ppId: pp.id, data: { pickupTime: t || null } });
                  }
                }}
                placeholder="Orario"
                className="w-20 px-2 py-1 border border-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
              <button
                type="button"
                onClick={() => removePoint({ id: excursionId, ppId: pp.id })}
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
            <label className="block text-xs text-muted-foreground mb-1">Aggiungi punto</label>
            <select
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
              className="w-full px-2 py-1.5 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">— Seleziona —</option>
              {availableLocations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.city})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Orario</label>
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
            onClick={() =>
              addPoint({
                id: excursionId,
                data: { pickupLocationId: selectedLocationId, pickupTime: newTime.trim() || null },
              })
            }
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-primary text-white disabled:opacity-50 mb-0.5"
          >
            {isAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Aggiungi
          </button>
        </div>
      )}
      {allLocations.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Configura prima i punti di raccolta in Impostazioni.
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
  const [form, setForm] = useState<FormState>(() =>
    initial
      ? fromExcursion(initial, { clearDate: mode === "create" && !!isDuplicate })
      : emptyState(),
  );
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
        if (name && !byKey.has(name.toLowerCase())) byKey.set(name.toLowerCase(), name);
      }
    }
    return Array.from(byKey.values());
  }, [allExcursions]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: getListExcursionsQueryKey() });
    if (mode === "edit" && initial?.id) {
      void queryClient.invalidateQueries({ queryKey: getGetExcursionQueryKey(initial.id) });
    }
  };

  const { mutateAsync: createExcursion, isPending: isCreating } = useCreateExcursion({
    mutation: { onSuccess: invalidate },
  });
  const { mutateAsync: updateExcursion, isPending: isUpdating } = useUpdateExcursion({
    mutation: { onSuccess: invalidate },
  });

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

    if (form.pricePerPerson.trim() === "") {
      errs.pricePerPerson = "Inserisci un prezzo (≥ 0).";
    } else {
      checkDecimalNonNeg("pricePerPerson", "Prezzo");
    }
    checkDecimalNonNeg("mealCostPerPerson", "Costo pasto");
    checkDecimalNonNeg("entranceCostPerPerson", "Costo ingressi");
    checkDecimalNonNeg("extraCostPerPerson", "Costo extra");
    checkDecimalNonNeg("vehicleFixedCost", "Costo mezzo");
    checkDecimalNonNeg("switchVehicleAdditionalCost", "Costo aggiuntivo mezzo alternativo");
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
    const payload = toPayload(form);
    try {
      let saved: ExcursionSummary;
      if (mode === "create") {
        saved = await createExcursion({ data: payload });
      } else {
        if (!initial?.id) throw new Error("ID gita mancante.");
        saved = await updateExcursion({ id: initial.id, data: payload });
      }
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
                  <p className="text-xs text-red-600 mt-1">{fieldErrors.name}</p>
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
                  <p className="text-xs text-red-600 mt-1">{fieldErrors.location}</p>
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
                  <p className="text-xs text-red-600 mt-1">{fieldErrors.date}</p>
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
                  Stato
                </label>
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
                  <p className="text-[11px] text-amber-700 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    Gita Rident: non compare nell'elenco/filtri del sito né nella sitemap. Resta raggiungibile solo tramite link diretto (quando è Aperta o Confermata).
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
                    Temi usati dal filtro “Tipologia” sul sito. Scegli tra gli esistenti o creane di nuovi.
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                  <p className="text-xs text-red-600 mt-1">{fieldErrors.pricePerPerson}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Pasto</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.mealCostPerPerson}
                  onChange={(e) => setField("mealCostPerPerson", e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-excursion-meal"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Ingressi</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.entranceCostPerPerson}
                  onChange={(e) => setField("entranceCostPerPerson", e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-excursion-entrance"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Extra</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.extraCostPerPerson}
                  onChange={(e) => setField("extraCostPerPerson", e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-excursion-extra"
                />
              </div>
            </div>
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
                  <p className="text-xs text-red-600 mt-1">{fieldErrors.currentCapacity}</p>
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
                {fieldErrors.minThreshold && (
                  <p className="text-xs text-red-600 mt-1">{fieldErrors.minThreshold}</p>
                )}
              </div>
            </div>
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
                  onChange={(e) => setField("vehicleId", e.target.value)}
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
                  setField("coverImageUrl", e.target.value.trim() === "" ? null : e.target.value)
                }
                className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="https://..."
                data-testid="input-excursion-cover-url"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Puoi caricare un file con il pulsante sopra oppure incollare direttamente un link a un'immagine.
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
                <label className="block text-xs font-medium text-foreground mb-1">La quota include</label>
                <textarea
                  value={form.included}
                  onChange={(e) => setField("included", e.target.value)}
                  rows={5}
                  placeholder={"Viaggio in Bus GT\nAccompagnatore\nNavigazione Isole Borromee"}
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                />
                <p className="text-[11px] text-muted-foreground mt-1">Una voce per riga.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">La quota non include</label>
                <textarea
                  value={form.excluded}
                  onChange={(e) => setField("excluded", e.target.value)}
                  rows={5}
                  placeholder={"Pranzi e bevande\nIngressi a musei\nTassa di soggiorno"}
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                />
                <p className="text-[11px] text-muted-foreground mt-1">Una voce per riga.</p>
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
              placeholder={"Documenti: carta d'identità valida per l'espatrio.\nCondizioni: il viaggio si effettua al raggiungimento del numero minimo di partecipanti."}
              className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-y"
            />
          </section>

          {/* Sezione: Punti di raccolta */}
          {mode === "edit" && initial?.id ? (
            <PickupPointsSection excursionId={initial.id} />
          ) : (
            <section className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Punti di raccolta
              </h4>
              <p className="text-xs text-muted-foreground bg-muted/40 rounded-xl px-3 py-2">
                Salva prima la gita per aggiungere i punti di raccolta.
              </p>
            </section>
          )}

          {mode === "edit" && initial && "adherentsCount" in initial && (
            <section className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Contatori prenotazioni (sola lettura)
              </h4>
              <div className="grid grid-cols-3 gap-3 bg-muted/30 rounded-md p-3">
                <div>
                  <div className="text-[11px] text-muted-foreground">Aderenti</div>
                  <div
                    className="text-base font-semibold text-foreground"
                    data-testid="text-counter-adherents"
                  >
                    {initial.adherentsCount}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Acconti</div>
                  <div
                    className="text-base font-semibold text-foreground"
                    data-testid="text-counter-deposits"
                  >
                    {initial.depositsCount}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Saldati</div>
                  <div
                    className="text-base font-semibold text-foreground"
                    data-testid="text-counter-balances"
                  >
                    {initial.balancesCount}
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Aggiornati automaticamente dalle prenotazioni: non sono modificabili da qui.
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
