import { useState, useEffect } from "react";
import {
  Settings,
  Save,
  Loader2,
  MapPin,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Users,
  Clock,
  Building2,
  FileText,
  RefreshCw,
} from "lucide-react";
import {
  getGetTermsVersionQueryKey,
  getTermsVersion,
  useGetAdminSettings,
  useGetTermsVersion,
  useUpdateAdminSettings,
  getGetAdminSettingsQueryKey,
  useListPickupLocations,
  useCreatePickupLocation,
  useUpdatePickupLocation,
  useDeletePickupLocation,
  getListPickupLocationsQueryKey,
  useListAgeRanges,
  useCreateAgeRange,
  useUpdateAgeRange,
  useDeleteAgeRange,
  getListAgeRangesQueryKey,
} from "@workspace/api-client-react";
import type { PickupLocation, AgeRange } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PROVINCES, provinceName } from "@/data/provinces";
import { EmailOutboxPanel } from "@/components/admin/EmailOutboxPanel";

const inputCls =
  "w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary";

function ProvinceSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputCls}
    >
      <option value="">— Provincia * —</option>
      {PROVINCES.map((p) => (
        <option key={p.code} value={p.code}>
          {p.name} ({p.code})
        </option>
      ))}
    </select>
  );
}

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
  const [province, setProvince] = useState(loc.province ?? "");
  const [mapsUrl, setMapsUrl] = useState(loc.mapsUrl ?? "");
  const [locNotes, setLocNotes] = useState(loc.notes ?? "");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { mutate: update, isPending: isUpdating } = useUpdatePickupLocation({
    mutation: {
      onSuccess: () => {
        setEditing(false);
        onSaved();
      },
    },
  });
  const { mutate: remove, isPending: isDeleting } = useDeletePickupLocation({
    mutation: {
      onSuccess: onDeleted,
      onError: (err: unknown) => {
        const msg =
          (err as { response?: { data?: { error?: string } } })?.response?.data
            ?.error ?? "Impossibile eliminare il punto di raccolta.";
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
        <div className="grid sm:grid-cols-2 gap-2">
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Indirizzo / dettaglio (opzionale)"
            className={inputCls}
          />
          <ProvinceSelect value={province} onChange={setProvince} />
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          <input
            value={mapsUrl}
            onChange={(e) => setMapsUrl(e.target.value)}
            placeholder="Link Google Maps (opzionale)"
            className={inputCls}
          />
          <input
            value={locNotes}
            onChange={(e) => setLocNotes(e.target.value)}
            placeholder="Note interne (opzionale)"
            className={inputCls}
          />
        </div>
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
              update({
                id: loc.id,
                data: {
                  name: name.trim(),
                  city: city.trim(),
                  address: address.trim() || null,
                  province: province || null,
                  mapsUrl: mapsUrl.trim() || null,
                  notes: locNotes.trim() || null,
                },
              })
            }
            className="px-3 py-1.5 text-xs rounded-lg bg-primary text-white flex items-center gap-1 disabled:opacity-50"
          >
            {isUpdating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
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
        <span
          className={`font-medium text-sm ${loc.active ? "text-foreground" : "text-muted-foreground line-through"}`}
        >
          {loc.name}
        </span>
        <span className="text-xs text-muted-foreground ml-2">{loc.city}</span>
        {loc.province ? (
          <span className="text-xs text-muted-foreground ml-1">
            ({provinceName(loc.province)})
          </span>
        ) : (
          <span className="text-xs text-amber-600 font-medium ml-1">
            · Provincia mancante
          </span>
        )}
        {loc.address && (
          <span className="text-xs text-muted-foreground ml-1">
            · {loc.address}
          </span>
        )}
        {!loc.active && (
          <span className="text-xs text-amber-600 font-medium ml-1">
            · Disattivato
          </span>
        )}
      </div>
      {deleteError && (
        <span className="text-xs text-red-600 max-w-[200px] truncate">
          {deleteError}
        </span>
      )}
      <button
        type="button"
        disabled={isUpdating}
        onClick={() =>
          update({
            id: loc.id,
            data: { name: loc.name, city: loc.city, active: !loc.active },
          })
        }
        className={`px-2 py-1 rounded-lg text-xs font-medium ${loc.active ? "text-emerald-700 bg-emerald-50 hover:bg-emerald-100" : "text-muted-foreground bg-muted hover:bg-muted/70"}`}
        title={
          loc.active
            ? "Disattiva (non selezionabile nelle nuove gite)"
            : "Riattiva"
        }
      >
        {loc.active ? "Attivo" : "Spento"}
      </button>
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
        onClick={() => {
          setDeleteError(null);
          remove({ id: loc.id });
        }}
        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-50"
        title="Elimina"
      >
        {isDeleting ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Trash2 className="w-3.5 h-3.5" />
        )}
      </button>
    </li>
  );
}

// ---- New pickup location inline form ----

function NewPickupForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [province, setProvince] = useState("");
  const [open, setOpen] = useState(false);

  const { mutate: create, isPending } = useCreatePickupLocation({
    mutation: {
      onSuccess: () => {
        setName("");
        setCity("");
        setAddress("");
        setProvince("");
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
      <div className="grid sm:grid-cols-2 gap-2">
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Indirizzo / dettaglio (opzionale)"
          className={inputCls}
        />
        <ProvinceSelect value={province} onChange={setProvince} />
      </div>
      <p className="text-[11px] text-muted-foreground">
        La provincia serve per applicare gli eventuali supplementi di prezzo
        configurati su ogni gita.
      </p>
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
          disabled={isPending || !name.trim() || !city.trim() || !province}
          onClick={() =>
            create({
              data: {
                name: name.trim(),
                city: city.trim(),
                address: address.trim() || null,
                province: province || null,
              },
            })
          }
          className="px-3 py-1.5 text-xs rounded-lg bg-primary text-white flex items-center gap-1 disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
          Aggiungi
        </button>
      </div>
    </div>
  );
}

// ---- Age range row (view + inline edit) ----

function AgeRangeRow({
  range,
  onSaved,
  onDeleted,
}: {
  range: AgeRange;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(range.label);
  const [minAge, setMinAge] = useState(String(range.minAge));
  const [maxAge, setMaxAge] = useState(String(range.maxAge));
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { mutate: update, isPending: isUpdating } = useUpdateAgeRange({
    mutation: {
      onSuccess: () => {
        setEditing(false);
        onSaved();
      },
    },
  });
  const { mutate: remove, isPending: isDeleting } = useDeleteAgeRange({
    mutation: {
      onSuccess: onDeleted,
      onError: (err: unknown) => {
        const msg =
          (err as { response?: { data?: { error?: string } } })?.response?.data
            ?.error ?? "Impossibile eliminare la fascia età.";
        setDeleteError(msg);
      },
    },
  });

  if (editing) {
    return (
      <li className="flex flex-col gap-2 p-3 border border-primary/30 rounded-xl bg-primary/5">
        <div className="grid sm:grid-cols-3 gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Etichetta * (es. 4-11 anni)"
            className={inputCls}
          />
          <input
            type="number"
            min={0}
            value={minAge}
            onChange={(e) => setMinAge(e.target.value)}
            placeholder="Età min *"
            className={inputCls}
          />
          <input
            type="number"
            min={0}
            value={maxAge}
            onChange={(e) => setMaxAge(e.target.value)}
            placeholder="Età max *"
            className={inputCls}
          />
        </div>
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
            disabled={
              isUpdating ||
              !label.trim() ||
              minAge === "" ||
              maxAge === "" ||
              Number(minAge) > Number(maxAge)
            }
            onClick={() =>
              update({
                id: range.id,
                data: {
                  label: label.trim(),
                  minAge: Number(minAge),
                  maxAge: Number(maxAge),
                },
              })
            }
            className="px-3 py-1.5 text-xs rounded-lg bg-primary text-white flex items-center gap-1 disabled:opacity-50"
          >
            {isUpdating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            Salva
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border hover:bg-muted/30 transition-colors">
      <Users className="w-4 h-4 text-accent shrink-0" />
      <div className="flex-1 min-w-0">
        <span
          className={`font-medium text-sm ${range.active ? "text-foreground" : "text-muted-foreground line-through"}`}
        >
          {range.label}
        </span>
        <span className="text-xs text-muted-foreground ml-2">
          {range.minAge}–{range.maxAge} anni
        </span>
        {!range.active && (
          <span className="text-xs text-amber-600 font-medium ml-2">
            · Disattivata
          </span>
        )}
      </div>
      {deleteError && (
        <span
          className="text-xs text-red-600 max-w-[220px] truncate"
          title={deleteError}
        >
          {deleteError}
        </span>
      )}
      <button
        type="button"
        disabled={isUpdating}
        onClick={() =>
          update({ id: range.id, data: { active: !range.active } })
        }
        className={`px-2 py-1 rounded-lg text-xs font-medium ${range.active ? "text-emerald-700 bg-emerald-50 hover:bg-emerald-100" : "text-muted-foreground bg-muted hover:bg-muted/70"}`}
        title={
          range.active ? "Disattiva (non comparirà più nei form)" : "Riattiva"
        }
      >
        {range.active ? "Attiva" : "Spenta"}
      </button>
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
        onClick={() => {
          setDeleteError(null);
          remove({ id: range.id });
        }}
        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-50"
        title="Elimina (solo se non usata)"
      >
        {isDeleting ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Trash2 className="w-3.5 h-3.5" />
        )}
      </button>
    </li>
  );
}

// ---- New age range inline form ----

function NewAgeRangeForm({
  onCreated,
  nextSortOrder,
}: {
  onCreated: () => void;
  nextSortOrder: number;
}) {
  const [label, setLabel] = useState("");
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [open, setOpen] = useState(false);

  const { mutate: create, isPending } = useCreateAgeRange({
    mutation: {
      onSuccess: () => {
        setLabel("");
        setMinAge("");
        setMaxAge("");
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
        Aggiungi fascia età
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3 border border-primary/30 rounded-xl bg-primary/5">
      <div className="grid sm:grid-cols-3 gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Etichetta * (es. 4-11 anni)"
          className={inputCls}
          autoFocus
        />
        <input
          type="number"
          min={0}
          value={minAge}
          onChange={(e) => setMinAge(e.target.value)}
          placeholder="Età min *"
          className={inputCls}
        />
        <input
          type="number"
          min={0}
          value={maxAge}
          onChange={(e) => setMaxAge(e.target.value)}
          placeholder="Età max *"
          className={inputCls}
        />
      </div>
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
          disabled={
            isPending ||
            !label.trim() ||
            minAge === "" ||
            maxAge === "" ||
            Number(minAge) > Number(maxAge)
          }
          onClick={() =>
            create({
              data: {
                label: label.trim(),
                minAge: Number(minAge),
                maxAge: Number(maxAge),
                active: true,
                sortOrder: nextSortOrder,
              },
            })
          }
          className="px-3 py-1.5 text-xs rounded-lg bg-primary text-white flex items-center gap-1 disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
          Aggiungi
        </button>
      </div>
    </div>
  );
}

// ---- Main SettingsPage ----

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading: isLoadingSettings } =
    useGetAdminSettings();
  const { data: iubendaTerms, isFetching: isLoadingTermsVersion } =
    useGetTermsVersion();
  const [isRereadingTerms, setIsRereadingTerms] = useState(false);
  const termsVersionBusy = isLoadingTermsVersion || isRereadingTerms;

  // `refresh=1` svuota la cache lato server e rilegge il documento: il refetch
  // della query da solo tornerebbe con lo stesso valore gia in cache.
  async function rereadTermsVersion() {
    setIsRereadingTerms(true);
    try {
      const fresh = await getTermsVersion({ refresh: "1" });
      queryClient.setQueryData(getGetTermsVersionQueryKey(), fresh);
    } finally {
      setIsRereadingTerms(false);
    }
  }
  const { data: pickupLocations = [], isLoading: isLoadingPickup } =
    useListPickupLocations();
  const { data: ageRanges = [], isLoading: isLoadingAgeRanges } =
    useListAgeRanges();

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
  const [depositPercentage, setDepositPercentage] = useState("");
  const [cardPaymentsEnabled, setCardPaymentsEnabled] = useState(false);
  const [futureCardChargeEnabled, setFutureCardChargeEnabled] = useState(false);
  const [cardCheckoutHoldMinutes, setCardCheckoutHoldMinutes] = useState("");
  const [paymentGraceMinutes, setPaymentGraceMinutes] = useState("");
  // Gite v2 — scadenze pagamento (ore) e regole
  const [bankHours, setBankHours] = useState("");
  const [officeHours, setOfficeHours] = useState("");
  const [balanceHours, setBalanceHours] = useState("");
  const [nearDepartureHours, setNearDepartureHours] = useState("");
  const [fullOnlyDaysBefore, setFullOnlyDaysBefore] = useState("");
  const [autoReleaseSeats, setAutoReleaseSeats] = useState(false);
  // Gite v2 — pagamento in ufficio
  const [officeAddress, setOfficeAddress] = useState("");
  const [officeOpeningHours, setOfficeOpeningHours] = useState("");
  // Gite v2 — versioni policy consensi + età adulto
  const [termsVersion, setTermsVersion] = useState("");
  const [privacyVersion, setPrivacyVersion] = useState("");
  const [mediaVersion, setMediaVersion] = useState("");
  const [adultMinAge, setAdultMinAge] = useState("");
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setIban(settings.payment_iban ?? "");
      setBeneficiary(settings.payment_beneficiary ?? "");
      setBank(settings.payment_bank ?? "");
      setNotes(settings.payment_notes ?? "");
      setDepositPercentage(settings.deposit_percentage ?? "");
      setCardPaymentsEnabled(
        settings.excursion_card_payments_enabled === "true",
      );
      setFutureCardChargeEnabled(
        settings.future_card_charge_enabled === "true",
      );
      setCardCheckoutHoldMinutes(settings.card_checkout_hold_minutes ?? "30");
      setPaymentGraceMinutes(settings.payment_grace_minutes ?? "120");
      setBankHours(settings.payment_deadline_bank_hours ?? "48");
      setOfficeHours(settings.payment_deadline_office_hours ?? "48");
      setBalanceHours(settings.payment_deadline_balance_hours ?? "48");
      setNearDepartureHours(
        settings.payment_deadline_near_departure_hours ?? "48",
      );
      setFullOnlyDaysBefore(settings.full_payment_only_days_before ?? "5");
      setAutoReleaseSeats(settings.auto_release_seats_on_expiry === "true");
      setOfficeAddress(settings.office_address ?? "");
      setOfficeOpeningHours(settings.office_opening_hours ?? "");
      setTermsVersion(settings.terms_policy_version ?? "1.0");
      setPrivacyVersion(settings.privacy_policy_version ?? "1.0");
      setMediaVersion(settings.media_policy_version ?? "1.0");
      setAdultMinAge(settings.adult_min_age ?? "18");
    }
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      const pct = depositPercentage.trim();
      if (
        pct !== "" &&
        (isNaN(Number(pct)) || Number(pct) < 0 || Number(pct) > 100)
      ) {
        setErrorMsg(
          "La percentuale acconto deve essere un numero tra 0 e 100.",
        );
        return;
      }
      const hourFields: [string, string][] = [
        ["scadenza bonifico", bankHours],
        ["scadenza ufficio", officeHours],
        ["scadenza saldo", balanceHours],
        ["scadenza sotto partenza", nearDepartureHours],
      ];
      for (const [name, v] of hourFields) {
        const t = v.trim();
        if (
          t !== "" &&
          (!Number.isInteger(Number(t)) || Number(t) < 1 || Number(t) > 720)
        ) {
          setErrorMsg(
            `Le ore per "${name}" devono essere un intero tra 1 e 720.`,
          );
          return;
        }
      }
      const days = fullOnlyDaysBefore.trim();
      if (
        days !== "" &&
        (!Number.isInteger(Number(days)) ||
          Number(days) < 0 ||
          Number(days) > 90)
      ) {
        setErrorMsg(
          "I giorni per il solo pagamento completo devono essere tra 0 e 90.",
        );
        return;
      }
      const holdMinutes = cardCheckoutHoldMinutes.trim();
      if (
        holdMinutes !== "" &&
        (!Number.isInteger(Number(holdMinutes)) ||
          Number(holdMinutes) < 5 ||
          Number(holdMinutes) > 180)
      ) {
        setErrorMsg(
          "La durata del checkout carta deve essere tra 5 e 180 minuti.",
        );
        return;
      }
      const graceMinutes = paymentGraceMinutes.trim();
      if (
        graceMinutes !== "" &&
        (!Number.isInteger(Number(graceMinutes)) ||
          Number(graceMinutes) < 0 ||
          Number(graceMinutes) > 10080)
      ) {
        setErrorMsg(
          "La tolleranza amministrativa deve essere tra 0 e 10080 minuti.",
        );
        return;
      }
      const adult = adultMinAge.trim();
      if (
        adult !== "" &&
        (!Number.isInteger(Number(adult)) ||
          Number(adult) < 1 ||
          Number(adult) > 99)
      ) {
        setErrorMsg("L'età minima adulto deve essere un intero tra 1 e 99.");
        return;
      }
      await mutateAsync({
        data: {
          payment_iban: iban.trim(),
          payment_beneficiary: beneficiary.trim(),
          payment_bank: bank.trim(),
          payment_notes: notes.trim(),
          deposit_percentage: pct,
          excursion_card_payments_enabled: cardPaymentsEnabled
            ? "true"
            : "false",
          future_card_charge_enabled: futureCardChargeEnabled
            ? "true"
            : "false",
          card_checkout_hold_minutes: holdMinutes,
          payment_grace_minutes: graceMinutes,
          payment_deadline_bank_hours: bankHours.trim(),
          payment_deadline_office_hours: officeHours.trim(),
          payment_deadline_balance_hours: balanceHours.trim(),
          payment_deadline_near_departure_hours: nearDepartureHours.trim(),
          full_payment_only_days_before: days,
          auto_release_seats_on_expiry: autoReleaseSeats ? "true" : "false",
          office_address: officeAddress.trim(),
          office_opening_hours: officeOpeningHours.trim(),
          terms_policy_version: termsVersion.trim(),
          privacy_policy_version: privacyVersion.trim(),
          media_policy_version: mediaVersion.trim(),
          adult_min_age: adult,
        },
      });
    } catch {
      setErrorMsg("Impossibile salvare le impostazioni. Riprova.");
    }
  };

  const refreshPickup = () =>
    void queryClient.invalidateQueries({
      queryKey: getListPickupLocationsQueryKey(),
    });
  const refreshAgeRanges = () =>
    void queryClient.invalidateQueries({
      queryKey: getListAgeRangesQueryKey(),
    });

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
          Configurazione delle coordinate di pagamento e dei punti di raccolta
          per le gite.
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
            <label className="block text-xs font-medium text-foreground mb-1">
              IBAN
            </label>
            <input
              type="text"
              value={iban}
              onChange={(e) =>
                setIban(e.target.value.toUpperCase().replace(/\s/g, ""))
              }
              placeholder="Es. IT60X0542811101000000123456"
              className={`${inputCls} font-mono`}
              data-testid="input-settings-iban"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Banca
            </label>
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
          <div>
            <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-4">
              <input
                type="checkbox"
                checked={cardPaymentsEnabled}
                onChange={(e) => setCardPaymentsEnabled(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
                data-testid="checkbox-settings-card-payments"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">
                  Richiedi carta per le prenotazioni gite
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Kill switch globale della carta: se disattivato blocca
                  checkout, nuovi salvataggi e addebiti automatici delle carte
                  già salvate. Restano disponibili soltanto i metodi offline
                  abilitati sulla singola gita. Per sicurezza la carta resta OFF
                  finché questa opzione non viene salvata esplicitamente.
                </span>
              </span>
            </label>
          </div>

          <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={futureCardChargeEnabled}
                onChange={(e) => setFutureCardChargeEnabled(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
                data-testid="checkbox-settings-future-card-charge"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">
                  Salva la carta e addebita l'acconto alla conferma
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Kill switch specifico per l'acconto futuro. OFF impedisce sia
                  nuovi salvataggi sia addebiti automatici delle carte già
                  salvate alla conferma: la richiesta passa a intervento
                  cliente/portale.
                </span>
              </span>
            </label>
            <div className="rounded-lg bg-white/70 px-3 py-2.5 space-y-2">
              <p className="text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">
                  La versione del consenso non si imposta più qui.
                </span>{" "}
                Viene letta dalla data di ultima modifica dei Termini e
                Condizioni pubblicati su Iubenda, dove si trova la clausola
                sull'addebito differito. Se quella data cambia, gli acconti già
                autorizzati non vengono più addebitati in automatico: le
                prenotazioni restano in attesa di una nuova accettazione.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="text-xs text-foreground"
                  data-testid="text-terms-version"
                >
                  Versione in vigore:{" "}
                  <strong>
                    {termsVersionBusy
                      ? "lettura in corso…"
                      : (iubendaTerms?.version ?? "non disponibile")}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() => void rereadTermsVersion()}
                  disabled={termsVersionBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/50 disabled:opacity-60"
                  data-testid="button-refresh-terms-version"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${termsVersionBusy ? "animate-spin" : ""}`}
                  />
                  Rileggi da Iubenda
                </button>
              </div>
              {iubendaTerms?.version == null && !termsVersionBusy && (
                <p className="text-xs text-amber-800">
                  Senza versione il salvataggio della carta non parte e i
                  clienti vengono indirizzati su bonifico o ufficio.
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Percentuale acconto gite (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={depositPercentage}
              onChange={(e) => setDepositPercentage(e.target.value)}
              placeholder="Es. 30"
              className={inputCls}
              data-testid="input-settings-deposit-percentage"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Determina l'acconto. Per una gita aperta, la carta viene soltanto
              salvata e l'acconto viene addebitato alla conferma. Se l'addebito
              futuro è disattivato o manca la versione del consenso, la carta
              non è disponibile per l'acconto: il cliente deve scegliere il
              totale oppure bonifico/ufficio.
            </p>
          </div>

          {/* --- Scadenze pagamento --- */}
          <div className="pt-4 border-t border-border">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-primary" />
              Scadenze pagamento
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Finestre operative per i pagamenti iniziali e anticipo della
              scadenza saldo. Ogni gita può sovrascrivere i valori principali.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Bonifico (ore)
                </label>
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={bankHours}
                  onChange={(e) => setBankHours(e.target.value)}
                  placeholder="48"
                  className={inputCls}
                  data-testid="input-settings-deadline-bank"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  In ufficio (ore)
                </label>
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={officeHours}
                  onChange={(e) => setOfficeHours(e.target.value)}
                  placeholder="48"
                  className={inputCls}
                  data-testid="input-settings-deadline-office"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Saldo prima della partenza (ore)
                </label>
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={balanceHours}
                  onChange={(e) => setBalanceHours(e.target.value)}
                  placeholder="48"
                  className={inputCls}
                  data-testid="input-settings-deadline-balance"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Sotto partenza (ore)
                </label>
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={nearDepartureHours}
                  onChange={(e) => setNearDepartureHours(e.target.value)}
                  placeholder="48"
                  className={inputCls}
                  data-testid="input-settings-deadline-near-departure"
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Il saldo scade alle ore indicate prima della partenza (default
              48). Se la gita viene confermata più tardi, diventa dovuto subito
              e si applica la tolleranza qui sotto.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Checkout carta (minuti)
                </label>
                <input
                  type="number"
                  min={5}
                  max={180}
                  value={cardCheckoutHoldMinutes}
                  onChange={(e) => setCardCheckoutHoldMinutes(e.target.value)}
                  placeholder="30"
                  className={inputCls}
                  data-testid="input-settings-card-hold-minutes"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Dopo questo tempo un checkout abbandonato libera
                  automaticamente i posti.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Tolleranza (minuti)
                </label>
                <input
                  type="number"
                  min={0}
                  max={10080}
                  value={paymentGraceMinutes}
                  onChange={(e) => setPaymentGraceMinutes(e.target.value)}
                  placeholder="120"
                  className={inputCls}
                  data-testid="input-settings-payment-grace-minutes"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Periodo operativo successivo alla scadenza contrattuale,
                  visibile ad amministrazione e cliente. Non estende mai una
                  riserva oltre la partenza; allo scadere si applicano le regole
                  di liberazione configurate.
                </p>
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-xs font-medium text-foreground mb-1">
                Solo pagamento completo da (giorni prima della partenza)
              </label>
              <input
                type="number"
                min={0}
                max={90}
                value={fullOnlyDaysBefore}
                onChange={(e) => setFullOnlyDaysBefore(e.target.value)}
                placeholder="5"
                className={inputCls}
                data-testid="input-settings-full-only-days"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Sotto questa soglia l'acconto non è più proposto e viene
                richiesto il pagamento completo.
              </p>
            </div>
            <div className="mt-3">
              <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-4">
                <input
                  type="checkbox"
                  checked={autoReleaseSeats}
                  onChange={(e) => setAutoReleaseSeats(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-primary"
                  data-testid="checkbox-settings-auto-release"
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">
                    Libera i posti offline durante “Verifica scadute”
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Bonifico e ufficio restano sotto controllo amministrativo. I
                    checkout carta abbandonati vengono invece liberati
                    automaticamente allo scadere del tempo impostato.
                  </span>
                </span>
              </label>
            </div>
          </div>

          {/* --- Pagamento in ufficio --- */}
          <div className="pt-4 border-t border-border">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
              <Building2 className="w-4 h-4 text-primary" />
              Pagamento in ufficio
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Mostrati al cliente che sceglie di pagare in sede.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Indirizzo ufficio
                </label>
                <input
                  type="text"
                  value={officeAddress}
                  onChange={(e) => setOfficeAddress(e.target.value)}
                  placeholder="Es. Via Roma 1, 18100 Imperia (IM)"
                  className={inputCls}
                  data-testid="input-settings-office-address"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Orari di apertura
                </label>
                <input
                  type="text"
                  value={officeOpeningHours}
                  onChange={(e) => setOfficeOpeningHours(e.target.value)}
                  placeholder="Es. Lun-Ven 9:00-12:30 / 15:00-18:00"
                  className={inputCls}
                  data-testid="input-settings-office-hours"
                />
              </div>
            </div>
          </div>

          {/* --- Consensi e testi --- */}
          <div className="pt-4 border-t border-border">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-primary" />
              Consensi e testi
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Le versioni vengono salvate su ogni consenso raccolto: aggiornale
              quando cambi i testi pubblicati.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Versione Termini
                </label>
                <input
                  type="text"
                  value={termsVersion}
                  onChange={(e) => setTermsVersion(e.target.value)}
                  placeholder="1.0"
                  className={inputCls}
                  data-testid="input-settings-terms-version"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Versione Privacy
                </label>
                <input
                  type="text"
                  value={privacyVersion}
                  onChange={(e) => setPrivacyVersion(e.target.value)}
                  placeholder="1.0"
                  className={inputCls}
                  data-testid="input-settings-privacy-version"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Versione Foto/Video
                </label>
                <input
                  type="text"
                  value={mediaVersion}
                  onChange={(e) => setMediaVersion(e.target.value)}
                  placeholder="1.0"
                  className={inputCls}
                  data-testid="input-settings-media-version"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Età minima adulto
                </label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={adultMinAge}
                  onChange={(e) => setAdultMinAge(e.target.value)}
                  placeholder="18"
                  className={inputCls}
                  data-testid="input-settings-adult-min-age"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Usata per l'etichetta pubblica, es. "Adulti (18+ anni)".
                </p>
              </div>
            </div>
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
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Salvataggio…
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Salva impostazioni
                </>
              )}
            </button>
            {saved && (
              <span className="text-sm text-emerald-700 font-medium">
                Salvato!
              </span>
            )}
          </div>
        </form>
      </div>

      <EmailOutboxPanel />

      {/* Sezione fasce età */}
      <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Fasce età bambini
        </h2>
        <p className="text-xs text-muted-foreground mb-5">
          Valide per tutte le gite normali. Il prezzo per fascia si imposta su
          ogni singola gita; chi supera l'età massima dell'ultima fascia è
          considerato adulto.
        </p>

        {isLoadingAgeRanges ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ul className="space-y-2 mb-3">
            {ageRanges.length === 0 && (
              <li className="text-sm text-muted-foreground text-center py-4">
                Nessuna fascia età configurata.
              </li>
            )}
            {ageRanges.map((range) => (
              <AgeRangeRow
                key={range.id}
                range={range}
                onSaved={refreshAgeRanges}
                onDeleted={refreshAgeRanges}
              />
            ))}
          </ul>
        )}

        <NewAgeRangeForm
          onCreated={refreshAgeRanges}
          nextSortOrder={
            ageRanges.length > 0
              ? Math.max(...ageRanges.map((r) => r.sortOrder)) + 1
              : 1
          }
        />
      </div>

      {/* Sezione punti di raccolta */}
      <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Punti di raccolta
        </h2>
        <p className="text-xs text-muted-foreground mb-5">
          Luoghi di partenza disponibili per le gite. Ogni gita seleziona i
          propri con orario variabile.
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
