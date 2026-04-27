import { useEffect, useState } from "react";
import {
  Bus,
  Plus,
  Pencil,
  Trash2,
  AlertCircle,
  Loader2,
  Save,
  X,
  Users,
  Euro,
  StickyNote,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListVehicles,
  useCreateVehicle,
  useUpdateVehicle,
  useDeleteVehicle,
  getListVehiclesQueryKey,
} from "@workspace/api-client-react";
import type { Vehicle, VehicleInput } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/shared/Button";

function formatEur(s: string | number | null | undefined) {
  if (s == null || s === "") return "–";
  const n = typeof s === "string" ? parseFloat(s) : s;
  if (!Number.isFinite(n)) return "–";
  return n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

const inputCls =
  "w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition";
const labelCls =
  "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1";

type FormState = {
  name: string;
  capacity: string;
  fixedCost: string;
  notes: string;
};

function emptyForm(): FormState {
  return { name: "", capacity: "", fixedCost: "0", notes: "" };
}

function fromVehicle(v: Vehicle): FormState {
  return {
    name: v.name ?? "",
    capacity: String(v.capacity ?? ""),
    fixedCost: v.fixedCost ?? "0",
    notes: v.notes ?? "",
  };
}

function normalizeDecimal(s: string): string {
  const cleaned = s.trim().replace(",", ".");
  if (cleaned === "" || isNaN(Number(cleaned))) return "0";
  return Number(cleaned).toFixed(2);
}

interface VehicleFormModalProps {
  open: boolean;
  onClose: () => void;
  vehicle?: Vehicle;
}

function VehicleFormModal({ open, onClose, vehicle }: VehicleFormModalProps) {
  const isEdit = !!vehicle;
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(vehicle ? fromVehicle(vehicle) : emptyForm());
      setErrors({});
      setServerError(null);
    }
  }, [open, vehicle]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListVehiclesQueryKey() });

  const { mutate: createVehicle, isPending: isCreating } = useCreateVehicle({
    mutation: {
      onSuccess: async () => {
        await invalidate();
        onClose();
      },
      onError: (err: unknown) => {
        setServerError(extractError(err));
      },
    },
  });

  const { mutate: updateVehicle, isPending: isUpdating } = useUpdateVehicle({
    mutation: {
      onSuccess: async () => {
        await invalidate();
        onClose();
      },
      onError: (err: unknown) => {
        setServerError(extractError(err));
      },
    },
  });

  const isPending = isCreating || isUpdating;

  const set =
    (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((p) => ({ ...p, [field]: e.target.value }));
      if (errors[field]) setErrors((p) => ({ ...p, [field]: undefined }));
      if (serverError) setServerError(null);
    };

  const validate = (): boolean => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) e.name = "Il nome è obbligatorio";
    const cap = parseInt(form.capacity, 10);
    if (!Number.isFinite(cap) || cap <= 0) e.capacity = "Capienza non valida";
    else if (cap > 1000) e.capacity = "Massimo 1000";
    const cost = parseFloat(form.fixedCost.replace(",", "."));
    if (!Number.isFinite(cost) || cost < 0) e.fixedCost = "Costo non valido";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    const data: VehicleInput = {
      name: form.name.trim(),
      capacity: parseInt(form.capacity, 10),
      fixedCost: normalizeDecimal(form.fixedCost),
      notes: form.notes.trim() || null,
    };
    if (isEdit && vehicle) {
      updateVehicle({ id: vehicle.id, data });
    } else {
      createVehicle({ data });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !isPending && onClose()}>
      <DialogContent className="max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {isEdit ? "Modifica Mezzo" : "Nuovo Mezzo"}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {isEdit
              ? "Aggiorna i dati del mezzo."
              : "Compila i campi per registrare un nuovo mezzo di trasporto."}
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelCls}>Nome *</label>
            <input
              type="text"
              value={form.name}
              onChange={set("name")}
              placeholder="es. Pullman 50 posti"
              className={inputCls}
              autoFocus
            />
            {errors.name && (
              <p className="text-xs text-red-500 mt-1">{errors.name}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Capienza *</label>
              <input
                type="number"
                min={1}
                max={1000}
                value={form.capacity}
                onChange={set("capacity")}
                placeholder="50"
                className={inputCls}
              />
              {errors.capacity && (
                <p className="text-xs text-red-500 mt-1">{errors.capacity}</p>
              )}
            </div>
            <div>
              <label className={labelCls}>Costo fisso (€) *</label>
              <input
                type="text"
                inputMode="decimal"
                value={form.fixedCost}
                onChange={set("fixedCost")}
                placeholder="0,00"
                className={inputCls}
              />
              {errors.fixedCost && (
                <p className="text-xs text-red-500 mt-1">{errors.fixedCost}</p>
              )}
            </div>
          </div>

          <div>
            <label className={labelCls}>Note</label>
            <textarea
              value={form.notes}
              onChange={set("notes")}
              rows={3}
              placeholder="es. Targato AB123CD, autista incluso..."
              className={inputCls}
            />
          </div>

          {serverError && (
            <div className="flex gap-2 items-start text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
            >
              <X className="w-4 h-4 mr-1" />
              Annulla
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-1" />
              )}
              {isEdit ? "Salva modifiche" : "Crea mezzo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function extractError(err: unknown): string {
  if (err && typeof err === "object") {
    const anyErr = err as Record<string, unknown>;
    const data = anyErr.data ?? anyErr.response;
    if (data && typeof data === "object") {
      const e = (data as Record<string, unknown>).error;
      if (typeof e === "string") return e;
    }
    if (typeof anyErr.message === "string") return anyErr.message;
  }
  return "Errore imprevisto. Riprova.";
}

interface DeleteConfirmProps {
  vehicle: Vehicle | null;
  onClose: () => void;
}

function DeleteVehicleDialog({ vehicle, onClose }: DeleteConfirmProps) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (vehicle) setServerError(null);
  }, [vehicle]);

  const { mutate: deleteVehicle, isPending } = useDeleteVehicle({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: getListVehiclesQueryKey(),
        });
        onClose();
      },
      onError: (err: unknown) => {
        setServerError(extractError(err));
      },
    },
  });

  return (
    <AlertDialog
      open={!!vehicle}
      onOpenChange={(v) => !v && !isPending && onClose()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminare il mezzo?</AlertDialogTitle>
          <AlertDialogDescription>
            Stai per eliminare definitivamente <b>{vehicle?.name}</b>. Questa
            operazione non può essere annullata. Se il mezzo è collegato a una
            gita, l'eliminazione verrà rifiutata.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {serverError && (
          <div className="flex gap-2 items-start text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{serverError}</span>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Annulla</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              if (vehicle) deleteVehicle({ id: vehicle.id });
            }}
            disabled={isPending}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4 mr-1" />
            )}
            Elimina
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function VehiclesPage() {
  const { data: vehicles = [], isLoading, error } = useListVehicles();
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | undefined>(
    undefined,
  );
  const [showCreate, setShowCreate] = useState(false);
  const [deleting, setDeleting] = useState<Vehicle | null>(null);

  const openCreate = () => {
    setEditingVehicle(undefined);
    setShowCreate(true);
  };
  const openEdit = (v: Vehicle) => {
    setEditingVehicle(v);
    setShowCreate(true);
  };
  const closeForm = () => {
    setShowCreate(false);
    setEditingVehicle(undefined);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap gap-4 items-start justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-3">
            <Bus className="w-8 h-8 text-primary" />
            Mezzi di trasporto
          </h1>
          <p className="text-muted-foreground mt-1 text-sm max-w-xl">
            Gestisci l'elenco dei veicoli (auto, pullman) usati per le gite di
            gruppo. I mezzi salvati saranno selezionabili nel form gita.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" />
          Nuovo mezzo
        </Button>
      </div>

      {isLoading && (
        <div className="bg-white rounded-2xl border border-border p-12 flex flex-col items-center text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mb-2" />
          <p className="text-sm">Caricamento mezzi…</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 flex gap-3 items-start text-red-800">
          <AlertCircle className="w-5 h-5 mt-0.5" />
          <div>
            <p className="font-semibold">Impossibile caricare i mezzi.</p>
            <p className="text-sm">Riprova più tardi.</p>
          </div>
        </div>
      )}

      {!isLoading && !error && vehicles.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed border-border p-12 flex flex-col items-center text-center">
          <Bus className="w-10 h-10 text-muted-foreground/50 mb-3" />
          <h3 className="font-semibold text-foreground">
            Nessun mezzo registrato
          </h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Aggiungi il primo veicolo per poterlo selezionare quando crei una
            nuova gita.
          </p>
          <Button onClick={openCreate} className="mt-4">
            <Plus className="w-4 h-4 mr-1" />
            Aggiungi mezzo
          </Button>
        </div>
      )}

      {!isLoading && !error && vehicles.length > 0 && (
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Nome</th>
                  <th className="text-left px-4 py-3 font-semibold">
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" /> Capienza
                    </span>
                  </th>
                  <th className="text-left px-4 py-3 font-semibold">
                    <span className="inline-flex items-center gap-1">
                      <Euro className="w-3.5 h-3.5" /> Costo fisso
                    </span>
                  </th>
                  <th className="text-left px-4 py-3 font-semibold">
                    <span className="inline-flex items-center gap-1">
                      <StickyNote className="w-3.5 h-3.5" /> Note
                    </span>
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr
                    key={v.id}
                    className="border-t border-border hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3 font-semibold text-foreground">
                      {v.name}
                    </td>
                    <td className="px-4 py-3">{v.capacity} posti</td>
                    <td className="px-4 py-3">{formatEur(v.fixedCost)}</td>
                    <td className="px-4 py-3 text-muted-foreground max-w-xs">
                      {v.notes ? (
                        <span className="line-clamp-2">{v.notes}</span>
                      ) : (
                        <span className="italic text-muted-foreground/60">
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => openEdit(v)}
                        className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-foreground hover:bg-muted transition-colors"
                        title="Modifica"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Modifica
                      </button>
                      <button
                        onClick={() => setDeleting(v)}
                        className="inline-flex items-center gap-1 px-2 py-1.5 ml-1 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                        title="Elimina"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Elimina
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <VehicleFormModal
        open={showCreate}
        onClose={closeForm}
        vehicle={editingVehicle}
      />

      <DeleteVehicleDialog
        vehicle={deleting}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
