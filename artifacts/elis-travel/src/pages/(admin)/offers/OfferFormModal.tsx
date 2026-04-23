import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useCreateOffer,
  useUpdateOffer,
  getListOffersQueryKey,
  getGetOfferQueryKey,
} from "@workspace/api-client-react";
import type { OfferDetail, OfferSummary } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

type OfferFormData = {
  name: string;
  destination: string;
  tourOperator: string;
  status: string;
  publicPrice: string;
  publicLink: string;
  baseFormula: string;
  departureCity: string;
  durationDays: string;
  durationNights: string;
  period: string;
  validFrom: string;
  validTo: string;
  advertisingText: string;
  highlights: string;
  servicesIncluded: string;
  servicesExcluded: string;
  pricingNotes: string;
  mainSource: string;
  internalNotes: string;
};

const emptyForm: OfferFormData = {
  name: "",
  destination: "",
  tourOperator: "",
  status: "draft",
  publicPrice: "",
  publicLink: "",
  baseFormula: "",
  departureCity: "",
  durationDays: "",
  durationNights: "",
  period: "",
  validFrom: "",
  validTo: "",
  advertisingText: "",
  highlights: "",
  servicesIncluded: "",
  servicesExcluded: "",
  pricingNotes: "",
  mainSource: "",
  internalNotes: "",
};

function offerToForm(offer: OfferSummary | OfferDetail): OfferFormData {
  const detail = offer as OfferDetail;
  return {
    name: offer.name ?? "",
    destination: offer.destination ?? "",
    tourOperator: offer.tourOperator ?? "",
    status: offer.status ?? "draft",
    publicPrice: offer.publicPrice ?? "",
    publicLink: offer.publicLink ?? "",
    baseFormula: detail.baseFormula ?? "",
    departureCity: detail.departureCity ?? "",
    durationDays: offer.durationDays != null ? String(offer.durationDays) : "",
    durationNights: offer.durationNights != null ? String(offer.durationNights) : "",
    period: offer.period ?? "",
    validFrom: offer.validFrom ? new Date(offer.validFrom).toISOString().split("T")[0] : "",
    validTo: offer.validTo ? new Date(offer.validTo).toISOString().split("T")[0] : "",
    advertisingText: detail.advertisingText ?? "",
    highlights: detail.highlights ?? "",
    servicesIncluded: detail.servicesIncluded ?? "",
    servicesExcluded: detail.servicesExcluded ?? "",
    pricingNotes: detail.pricingNotes ?? "",
    mainSource: offer.mainSource ?? "",
    internalNotes: detail.internalNotes ?? "",
  };
}

function formToPayload(form: OfferFormData) {
  return {
    name: form.name.trim(),
    destination: form.destination.trim(),
    tourOperator: form.tourOperator.trim() || null,
    status: form.status,
    publicPrice: form.publicPrice.trim() || null,
    publicLink: form.publicLink.trim() || null,
    baseFormula: form.baseFormula.trim() || null,
    departureCity: form.departureCity.trim() || null,
    durationDays: form.durationDays ? parseInt(form.durationDays, 10) : null,
    durationNights: form.durationNights ? parseInt(form.durationNights, 10) : null,
    period: form.period.trim() || null,
    validFrom: form.validFrom ? new Date(form.validFrom).toISOString() : null,
    validTo: form.validTo ? new Date(form.validTo).toISOString() : null,
    advertisingText: form.advertisingText.trim() || null,
    highlights: form.highlights.trim() || null,
    servicesIncluded: form.servicesIncluded.trim() || null,
    servicesExcluded: form.servicesExcluded.trim() || null,
    pricingNotes: form.pricingNotes.trim() || null,
    mainSource: form.mainSource.trim() || null,
    internalNotes: form.internalNotes.trim() || null,
  };
}

const inputCls = "w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition";
const labelCls = "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1";
const sectionCls = "space-y-4 pt-4 border-t border-border first:border-t-0 first:pt-0";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

interface OfferFormModalProps {
  open: boolean;
  onClose: () => void;
  offer?: OfferSummary | OfferDetail;
}

export function OfferFormModal({ open, onClose, offer }: OfferFormModalProps) {
  const isEdit = !!offer;
  const queryClient = useQueryClient();

  const [form, setForm] = useState<OfferFormData>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof OfferFormData, string>>>({});

  useEffect(() => {
    if (open) {
      setForm(offer ? offerToForm(offer) : emptyForm);
      setErrors({});
    }
  }, [open, offer]);

  const { mutate: createOffer, isPending: isCreating } = useCreateOffer({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListOffersQueryKey() });
        onClose();
      },
    },
  });

  const { mutate: updateOffer, isPending: isUpdating } = useUpdateOffer({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListOffersQueryKey() });
        if (offer?.id) {
          void queryClient.invalidateQueries({ queryKey: getGetOfferQueryKey(offer.id) });
        }
        onClose();
      },
    },
  });

  const isPending = isCreating || isUpdating;

  const set = (field: keyof OfferFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validate = () => {
    const errs: Partial<Record<keyof OfferFormData, string>> = {};
    if (!form.name.trim()) errs.name = "Il nome è obbligatorio";
    if (!form.destination.trim()) errs.destination = "La destinazione è obbligatoria";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const payload = formToPayload(form);
    if (isEdit && offer) {
      updateOffer({ id: offer.id, data: payload });
    } else {
      createOffer({ data: payload });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="text-xl font-bold">
            {isEdit ? "Modifica Offerta" : "Nuova Offerta"}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {isEdit ? "Aggiorna i dati dell'offerta." : "Compila i campi per creare una nuova offerta."}
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="px-6 pb-6 pt-4 space-y-6">
          <div className={sectionCls}>
            <h3 className="text-sm font-bold text-foreground">Informazioni Generali</h3>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Nome Offerta *">
                <input
                  type="text"
                  value={form.name}
                  onChange={set("name")}
                  placeholder="es. Capodanno a Vienna"
                  className={inputCls}
                />
                {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
              </Field>

              <Field label="Destinazione *">
                <input
                  type="text"
                  value={form.destination}
                  onChange={set("destination")}
                  placeholder="es. Vienna, Austria"
                  className={inputCls}
                />
                {errors.destination && <p className="text-xs text-red-500 mt-1">{errors.destination}</p>}
              </Field>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="Tour Operator">
                <input
                  type="text"
                  value={form.tourOperator}
                  onChange={set("tourOperator")}
                  placeholder="es. Alpitour"
                  className={inputCls}
                />
              </Field>

              <Field label="Stato">
                <select value={form.status} onChange={set("status")} className={inputCls}>
                  <option value="draft">Bozza</option>
                  <option value="published">Pubblicata</option>
                  <option value="archived">Archiviata</option>
                </select>
              </Field>

              <Field label="Prezzo Base (€)">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.publicPrice}
                  onChange={set("publicPrice")}
                  placeholder="es. 890.00"
                  className={inputCls}
                />
              </Field>
            </div>

            <Field label="Link Pubblico">
              <input
                type="url"
                value={form.publicLink}
                onChange={set("publicLink")}
                placeholder="https://elistravel.it/offerte/..."
                className={inputCls}
              />
            </Field>
          </div>

          <div className={sectionCls}>
            <h3 className="text-sm font-bold text-foreground">Struttura Viaggio</h3>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Formula Base">
                <input
                  type="text"
                  value={form.baseFormula}
                  onChange={set("baseFormula")}
                  placeholder="es. Volo + Hotel 4★ + colazione"
                  className={inputCls}
                />
              </Field>

              <Field label="Città di Partenza">
                <input
                  type="text"
                  value={form.departureCity}
                  onChange={set("departureCity")}
                  placeholder="es. Milano Malpensa"
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="Giorni">
                <input
                  type="number"
                  min="1"
                  value={form.durationDays}
                  onChange={set("durationDays")}
                  placeholder="es. 4"
                  className={inputCls}
                />
              </Field>

              <Field label="Notti">
                <input
                  type="number"
                  min="0"
                  value={form.durationNights}
                  onChange={set("durationNights")}
                  placeholder="es. 3"
                  className={inputCls}
                />
              </Field>

              <Field label="Periodo">
                <input
                  type="text"
                  value={form.period}
                  onChange={set("period")}
                  placeholder="es. Apr – Giu"
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Valida Dal">
                <input
                  type="date"
                  value={form.validFrom}
                  onChange={set("validFrom")}
                  className={inputCls}
                />
              </Field>

              <Field label="Valida Al">
                <input
                  type="date"
                  value={form.validTo}
                  onChange={set("validTo")}
                  className={inputCls}
                />
              </Field>
            </div>
          </div>

          <div className={sectionCls}>
            <h3 className="text-sm font-bold text-foreground">Contenuto Pubblico</h3>

            <Field label="Testo Pubblicitario">
              <textarea
                value={form.advertisingText}
                onChange={set("advertisingText")}
                rows={3}
                placeholder="Descrizione accattivante per il sito..."
                className={inputCls}
              />
            </Field>

            <Field label="Highlights (separati da |)">
              <textarea
                value={form.highlights}
                onChange={set("highlights")}
                rows={2}
                placeholder="es. Sagrada Família|Las Ramblas|Park Güell"
                className={inputCls}
              />
            </Field>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Servizi Inclusi (separati da ,)">
                <textarea
                  value={form.servicesIncluded}
                  onChange={set("servicesIncluded")}
                  rows={3}
                  placeholder="Volo A/R, Hotel BB, trasferimenti"
                  className={inputCls}
                />
              </Field>

              <Field label="Non Incluso (separati da ,)">
                <textarea
                  value={form.servicesExcluded}
                  onChange={set("servicesExcluded")}
                  rows={3}
                  placeholder="Visti, assicurazione, pasti"
                  className={inputCls}
                />
              </Field>
            </div>

            <Field label="Note Prezzo">
              <input
                type="text"
                value={form.pricingNotes}
                onChange={set("pricingNotes")}
                placeholder="es. Prezzo a persona in camera doppia. Singola +€120."
                className={inputCls}
              />
            </Field>
          </div>

          <div className={sectionCls}>
            <h3 className="text-sm font-bold text-foreground">Dati Interni Staff</h3>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Fonte Principale Lead">
                <input
                  type="text"
                  value={form.mainSource}
                  onChange={set("mainSource")}
                  placeholder="es. newsletter, instagram, fiera"
                  className={inputCls}
                />
              </Field>
            </div>

            <Field label="Note Staff">
              <textarea
                value={form.internalNotes}
                onChange={set("internalNotes")}
                rows={3}
                placeholder="Note operative interne (non visibili al pubblico)..."
                className={inputCls}
              />
            </Field>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isPending
                ? isEdit ? "Salvataggio…" : "Creazione…"
                : isEdit ? "Salva Modifiche" : "Crea Offerta"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
