import { useState, useEffect } from "react";
import { Settings, Save, Loader2, MapPin, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import {
  useGetAdminSettings,
  useUpdateAdminSettings,
  getGetAdminSettingsQueryKey,
  useListPickupLocations,
  useCreatePickupLocation,
  useUpdatePickupLocation,
  useDeletePickupLocation,
  getListPickupLocationsQueryKey,
} from "@workspace/api-client-react";
import type { PickupLocation } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const inputCls =
  "w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary";

// ---- Pickup location row (view + inline edit) ----

function PickupRow({
  loc,
  onSaved,
  onDeleted,
}: {
  loc: PickupLocation;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(loc.name);
  const [city, setCity] = useState(loc.city);
  const [address, setAddress] = useState(loc.address ?? "");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { mutate: update, isPending: isUpdating } = useUpdatePickupLocation({
    mutation: { onSuccess: () => { setEditing(false); onSaved(); } },
  });
  const { mutate: remove, isPending: isDeleting } = useDeletePickupLocation({
    mutation: {
      onSuccess: onDeleted,
      onError: (err: unknown) => {
        const msg =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          "Impossibile eliminare il punto di raccolta.";
        setDeleteError(msg);
      },
    },
  });

  if (editing) {
    return (
      <li className="flex flex-col gap-2 p-3 border border-primary/30 rounded-xl bg-primary/5">
        <div className="grid sm:grid-cols-2 gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome *"
            className={inputCls}
          />
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Città *"
            className={inputCls}
          />
        </div>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Indirizzo / dettaglio (opzionale)"
          className={inputCls}
        />
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:bg-muted"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={isUpdating || !name.trim() || !city.trim()}
            onClick={() =>
              update({ id: loc.id, data: { name: name.trim(), city: city.trim(), address: address.trim() || null } })
            }
            className="px-3 py-1.5 text-xs rounded-lg bg-primary text-white flex items-center gap-1 disabled:opacity-50"
          >
            {isUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Salva
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border hover:bg-muted/30 transition-colors">
      <MapPin className="w-4 h-4 text-accent shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="font-medium text-sm text-foreground">{loc.name}</span>
        <span className="text-xs text-muted-foreground ml-2">{loc.city}</span>
        {loc.address && <span className="text-xs text-muted-foreground ml-1">· {loc.address}</span>}
      </div>
      {deleteError && (
        <span className="text-xs text-red-600 max-w-[200px] truncate">{deleteError}</span>
      )}
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10"
        title="Modifica"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        disabled={isDeleting}
        onClick={() => { setDeleteError(null); remove({ id: loc.id }); }}
        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-50"
        title="Elimina"
      >
        {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
      </button>
    </li>
  );
}

// ---- New pickup location inline form ----

function NewPickupForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [open, setOpen] = useState(false);

  const { mutate: create, isPending } = useCreatePickupLocation({
    mutation: {
      onSuccess: () => {
        setName(""); setCity(""); setAddress("");
        setOpen(false);
        onCreated();
      },
    },
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
      >
        <Plus className="w-4 h-4" />
        Aggiungi punto di raccolta
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3 border border-primary/30 rounded-xl bg-primary/5">
      <div className="grid sm:grid-cols-2 gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome * (es. Savona - Uscita A10)"
          className={inputCls}
          autoFocus
        />
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Città *"
          className={inputCls}
        />
      </div>
      <input
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="Indirizzo / dettaglio (opzionale)"
        className={inputCls}
      />
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:bg-muted"
        >
          Annulla
        </button>
        <button
          type="button"
          disabled={isPending || !name.trim() || !city.trim()}
          onClick={() => create({ data: { name: name.trim(), city: city.trim(), address: address.trim() || null } })}
          className="px-3 py-1.5 text-xs rounded-lg bg-primary text-white flex items-center gap-1 disabled:opacity-50"
        >
          {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Aggiungi
        </button>
      </div>
    </div>
  );
}

// ---- Main SettingsPage ----

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading: isLoadingSettings } = useGetAdminSettings();
  const { data: pickupLocations = [], isLoading: isLoadingPickup } = useListPickupLocations();

  const { mutateAsync, isPending } = useUpdateAdminSettings({
    mutation: {
      onSuccess: (data) => {
        queryClient.setQueryData(getGetAdminSettingsQueryKey(), data);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      },
    },
  });

  const [iban, setIban] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [bank, setBank] = useState("");
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setIban(settings.payment_iban ?? "");
      setBeneficiary(settings.payment_beneficiary ?? "");
      setBank(settings.payment_bank ?? "");
      setNotes(settings.payment_notes ?? "");
    }
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      await mutateAsync({
        data: {
          payment_iban: iban.trim(),
          payment_beneficiary: beneficiary.trim(),
          payment_bank: bank.trim(),
          payment_notes: notes.trim(),
        },
      });
    } catch {
      setErrorMsg("Impossibile salvare le impostazioni. Riprova.");
    }
  };

  const refreshPickup = () =>
    void queryClient.invalidateQueries({ queryKey: getListPickupLocationsQueryKey() });

  if (isLoadingSettings) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Settings className="w-6 h-6 text-primary" />
          Impostazioni
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configurazione delle coordinate di pagamento e dei punti di raccolta per le gite.
        </p>
      </div>

      {/* Sezione pagamento */}
      <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-5">
          Coordinate di pagamento
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Intestatario del conto
            </label>
            <input
              type="text"
              value={beneficiary}
              onChange={(e) => setBeneficiary(e.target.value)}
              placeholder="Es. Elis Travel S.r.l."
              className={inputCls}
              data-testid="input-settings-beneficiary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">IBAN</label>
            <input
              type="text"
              value={iban}
              onChange={(e) => setIban(e.target.value.toUpperCase().replace(/\s/g, ""))}
              placeholder="Es. IT60X0542811101000000123456"
              className={`${inputCls} font-mono`}
              data-testid="input-settings-iban"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Banca</label>
            <input
              type="text"
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              placeholder="Es. Banca Intesa Sanpaolo"
              className={inputCls}
              data-testid="input-settings-bank"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Causale suggerita
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Es. Prenotazione gita – [cognome]"
              className={inputCls}
              data-testid="input-settings-notes"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Verrà usata come causale predefinita nell'email.
            </p>
          </div>

          {errorMsg && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {errorMsg}
            </div>
          )}

          <div className="pt-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 font-medium"
              data-testid="button-settings-save"
            >
              {isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Salvataggio…</>
              ) : (
                <><Save className="w-4 h-4" />Salva impostazioni</>
              )}
            </button>
            {saved && (
              <span className="text-sm text-emerald-700 font-medium">Salvato!</span>
            )}
          </div>
        </form>
      </div>

      {/* Sezione punti di raccolta */}
      <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Punti di raccolta
        </h2>
        <p className="text-xs text-muted-foreground mb-5">
          Luoghi di partenza disponibili per le gite. Ogni gita seleziona i propri con orario variabile.
        </p>

        {isLoadingPickup ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ul className="space-y-2 mb-3">
            {pickupLocations.length === 0 && (
              <li className="text-sm text-muted-foreground text-center py-4">
                Nessun punto di raccolta configurato.
              </li>
            )}
            {pickupLocations.map((loc) => (
              <PickupRow
                key={loc.id}
                loc={loc}
                onSaved={refreshPickup}
                onDeleted={refreshPickup}
              />
            ))}
          </ul>
        )}

        <NewPickupForm onCreated={refreshPickup} />
      </div>
    </div>
  );
}
