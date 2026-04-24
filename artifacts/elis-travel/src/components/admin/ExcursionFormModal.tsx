import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, Save, X } from "lucide-react";
import {
  useCreateExcursion,
  useUpdateExcursion,
  useListVehicles,
  getGetExcursionQueryKey,
  getListExcursionsQueryKey,
} from "@workspace/api-client-react";
import type {
  ExcursionDetail,
  ExcursionInput,
  ExcursionSummary,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CoverImageUploader } from "@/components/shared/CoverImageUploader";

const STATUS_OPTIONS = [
  { value: "draft", label: "Bozza" },
  { value: "confirmed", label: "Confermata" },
  { value: "completed", label: "Completata" },
  { value: "cancelled", label: "Annullata" },
] as const;

type FormState = {
  name: string;
  location: string;
  date: string;
  status: string;
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
  };
}

function fromExcursion(exc: ExcursionDetail | ExcursionSummary): FormState {
  return {
    name: exc.name ?? "",
    location: exc.location ?? "",
    date: exc.date ?? todayISO(),
    status: exc.status ?? "draft",
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
  };
}

export interface ExcursionFormModalProps {
  mode: "create" | "edit";
  initial?: ExcursionDetail | ExcursionSummary;
  onClose: () => void;
  onSaved?: (excursion: ExcursionSummary) => void;
}

export function ExcursionFormModal({
  mode,
  initial,
  onClose,
  onSaved,
}: ExcursionFormModalProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() =>
    initial ? fromExcursion(initial) : emptyState(),
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const { data: vehicles } = useListVehicles();

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
      className="fixed inset-0 bg-black/40 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      data-testid="modal-excursion-form"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 sticky top-0 bg-white rounded-t-2xl">
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
          </section>

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
