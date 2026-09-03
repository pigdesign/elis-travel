import { useEffect, useState } from "react";
import {
  Banknote,
  Check,
  History,
  Pencil,
  RotateCcw,
  Save,
  Undo2,
  X,
} from "lucide-react";
import {
  useRecordAdminBookingPayment,
  useReverseAdminPaymentRequest,
  useUpdateAdminBookingProfile,
  useUpdateAdminPaymentRequest,
} from "@workspace/api-client-react";
import type {
  AdminBookingAction,
  AdminBookingDetails,
  AdminPaymentRequest,
} from "@workspace/api-client-react";

// ---------------------------------------------------------------------------
// Gestione manuale di una prenotazione dal backoffice.
//
// Il registro contabile non si tocca a mano: si agisce sulle obbligazioni.
// Qui l'ufficio trova, in un punto solo e in cima alla scheda, tutto quello
// che prima poteva decidere soltanto il cliente dal portale — o che non poteva
// decidere nessuno: come sarà pagata una richiesta, quanto vale davvero,
// quando scade, e quando il denaro è arrivato allo sportello.
// ---------------------------------------------------------------------------

const METHOD_LABELS: Record<string, string> = {
  card: "Carta",
  bank_transfer: "Bonifico",
  office: "In ufficio",
  on_bus: "Sul bus",
};

const ACTION_LABELS: Record<string, string> = {
  update_booking: "Dati prenotazione corretti",
  update_payment_request: "Richiesta di pagamento corretta",
  record_payment: "Incasso registrato",
  reverse_payment: "Incasso stornato",
};

const OPEN_STATUSES = ["pending", "scheduled", "action_required", "expired"];

function formatEurCents(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "—";
  return (cents / 100).toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
  });
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseEurCents(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number.parseFloat(normalized) * 100);
}

function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** `datetime-local` vuole l'ora locale senza fuso, non un ISO in UTC. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  const offset = parsed.getTimezoneOffset() * 60_000;
  return new Date(parsed.getTime() - offset).toISOString().slice(0, 16);
}

const inputClass =
  "w-full rounded-lg border border-border bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";
const labelClass = "mb-1 block text-xs font-medium text-foreground";
const sectionClass = "rounded-xl border border-border bg-white p-4";
const sectionTitleClass =
  "mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground";

export function BookingAdminControls({
  bookingId,
  data,
  payOnBusEnabled,
  busy,
  onBusy,
  onError,
  onDone,
}: {
  bookingId: string;
  data: AdminBookingDetails;
  payOnBusEnabled: boolean;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onError: (error: unknown) => void;
  onDone: () => void;
}) {
  const booking = data.booking;
  const total = data.economicSummary?.totalAmountCents ?? null;
  const paid = data.economicSummary?.paidAmountCents ?? 0;
  const residual = total === null ? null : Math.max(total - paid, 0);
  const openRequests = (data.paymentRequests ?? []).filter((request) =>
    OPEN_STATUSES.includes(request.status),
  );
  const locked = Boolean(booking.cancelledAt);

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState({
    customerName: "",
    email: "",
    phone: "",
    customerNotificationsEnabled: false,
    servizioCasa: false,
    homePickupAddress: "",
    total: "",
  });
  const [paymentDraft, setPaymentDraft] = useState({
    amount: "",
    method: "office",
    reference: "",
    paidAt: "",
    reason: "",
  });
  const [requestDrafts, setRequestDrafts] = useState<
    Record<
      string,
      { method: string; amount: string; deadline: string; reason: string }
    >
  >({});
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [showDiary, setShowDiary] = useState(false);

  // Ogni prenotazione riparte da zero: le bozze della precedente non devono
  // mai finire su un'altra scheda.
  useEffect(() => {
    setIsEditingProfile(false);
    setPaymentDraft({
      amount: "",
      method: "office",
      reference: "",
      paidAt: "",
      reason: "",
    });
    setRequestDrafts({});
    setReversingId(null);
    setReversalReason("");
    setShowDiary(false);
  }, [bookingId]);

  const settled = () => {
    onBusy(false);
    onDone();
  };

  const { mutate: updateProfile } = useUpdateAdminBookingProfile({
    mutation: {
      onSuccess: () => {
        setIsEditingProfile(false);
        settled();
      },
      onError: (error) => {
        onBusy(false);
        onError(error);
      },
    },
  });
  const { mutate: updateRequest } = useUpdateAdminPaymentRequest({
    mutation: {
      onSuccess: (_result, variables) => {
        setRequestDrafts((current) => {
          const next = { ...current };
          delete next[variables.requestId];
          return next;
        });
        settled();
      },
      onError: (error) => {
        onBusy(false);
        onError(error);
      },
    },
  });
  const { mutate: recordPayment } = useRecordAdminBookingPayment({
    mutation: {
      onSuccess: () => {
        setPaymentDraft({
          amount: "",
          method: "office",
          reference: "",
          paidAt: "",
          reason: "",
        });
        settled();
      },
      onError: (error) => {
        onBusy(false);
        onError(error);
      },
    },
  });
  const { mutate: reversePayment } = useReverseAdminPaymentRequest({
    mutation: {
      onSuccess: () => {
        setReversingId(null);
        setReversalReason("");
        settled();
      },
      onError: (error) => {
        onBusy(false);
        onError(error);
      },
    },
  });

  const startProfileEdit = () => {
    setProfileDraft({
      customerName: booking.customerName ?? "",
      email: booking.email ?? "",
      phone: booking.phone ?? "",
      customerNotificationsEnabled: Boolean(
        booking.customerNotificationsEnabled,
      ),
      servizioCasa: Boolean(booking.servizioCasa),
      homePickupAddress: booking.homePickupAddress ?? "",
      total: centsToInput(booking.totalAmountCents),
    });
    setIsEditingProfile(true);
  };

  const submitProfile = () => {
    const nextTotal = parseEurCents(profileDraft.total);
    if (profileDraft.total.trim() && nextTotal === null) {
      onError({ data: { error: "Totale non valido: usa il formato 250,00." } });
      return;
    }
    onBusy(true);
    updateProfile({
      bookingId,
      data: {
        customerName: profileDraft.customerName.trim(),
        email: profileDraft.email.trim() || null,
        phone: profileDraft.phone.trim() || null,
        customerNotificationsEnabled: profileDraft.customerNotificationsEnabled,
        servizioCasa: profileDraft.servizioCasa,
        homePickupAddress: profileDraft.homePickupAddress.trim() || null,
        ...(nextTotal !== null ? { totalAmountCents: nextTotal } : {}),
      },
    });
  };

  const submitPayment = () => {
    const amountCents = parseEurCents(paymentDraft.amount);
    if (amountCents === null || amountCents <= 0) {
      onError({ data: { error: "Importo non valido: usa il formato 50,00." } });
      return;
    }
    onBusy(true);
    recordPayment({
      bookingId,
      data: {
        amountCents,
        method: paymentDraft.method as "bank_transfer" | "office" | "on_bus",
        transactionReference: paymentDraft.reference.trim(),
        ...(paymentDraft.paidAt
          ? { paidAt: new Date(paymentDraft.paidAt).toISOString() }
          : {}),
        ...(paymentDraft.reason.trim()
          ? { reason: paymentDraft.reason.trim() }
          : {}),
      },
    });
  };

  const draftFor = (request: AdminPaymentRequest) =>
    requestDrafts[request.id] ?? {
      method: request.method ?? "",
      amount: centsToInput(request.amountCents),
      deadline: toLocalInput(request.deadline),
      reason: "",
    };

  const submitRequest = (request: AdminPaymentRequest) => {
    const draft = draftFor(request);
    const payload: {
      method?: "bank_transfer" | "office" | "on_bus";
      amountCents?: number;
      deadline?: string;
      reason?: string;
    } = {};
    if (draft.method && draft.method !== request.method) {
      payload.method = draft.method as "bank_transfer" | "office" | "on_bus";
    }
    const amountCents = parseEurCents(draft.amount);
    if (amountCents !== null && amountCents !== request.amountCents) {
      payload.amountCents = amountCents;
    }
    if (draft.deadline && draft.deadline !== toLocalInput(request.deadline)) {
      payload.deadline = new Date(draft.deadline).toISOString();
    }
    if (Object.keys(payload).length === 0) {
      onError({
        data: { error: "Non hai cambiato nulla su questa richiesta." },
      });
      return;
    }
    if (payload.amountCents !== undefined && !draft.reason.trim()) {
      onError({
        data: {
          error: "Per cambiare l'importo indica il motivo della correzione.",
        },
      });
      return;
    }
    if (draft.reason.trim()) payload.reason = draft.reason.trim();
    onBusy(true);
    updateRequest({ requestId: request.id, data: payload });
  };

  if (locked) return null;

  return (
    <div className="space-y-4 rounded-2xl border border-primary/20 bg-primary/[0.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-bold text-foreground">
          Gestione manuale
        </div>
        <div className="text-xs text-muted-foreground">
          Incassato {formatEurCents(paid)}
          {total !== null ? ` di ${formatEurCents(total)}` : ""}
          {residual !== null && residual > 0 ? (
            <span className="ml-1 font-semibold text-amber-700">
              · residuo {formatEurCents(residual)}
            </span>
          ) : total !== null ? (
            <span className="ml-1 font-semibold text-emerald-700">
              · saldata
            </span>
          ) : null}
        </div>
      </div>

      {/* --- Dati della prenotazione ------------------------------------- */}
      <div className={sectionClass}>
        <div className="flex items-start justify-between gap-3">
          <div className={`${sectionTitleClass} mb-0`}>
            <Pencil className="h-3.5 w-3.5" /> Dati della prenotazione
          </div>
          {!isEditingProfile && (
            <button
              type="button"
              onClick={startProfileEdit}
              disabled={busy}
              className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
              data-testid="button-edit-booking-profile"
            >
              Modifica
            </button>
          )}
        </div>

        {!isEditingProfile ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Referente, recapiti, ritiro a domicilio e totale della prenotazione.
            Il totale non può scendere sotto quanto già incassato.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Referente *</label>
                <input
                  type="text"
                  maxLength={200}
                  value={profileDraft.customerName}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      customerName: event.target.value,
                    }))
                  }
                  className={inputClass}
                  data-testid="input-profile-name"
                />
              </div>
              <div>
                <label className={labelClass}>Telefono</label>
                <input
                  type="tel"
                  maxLength={40}
                  value={profileDraft.phone}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                  className={inputClass}
                  data-testid="input-profile-phone"
                />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input
                  type="email"
                  maxLength={200}
                  value={profileDraft.email}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      email: event.target.value,
                      // Senza indirizzo non c'e nulla da spedire: il flag si
                      // spegne da solo invece di far fallire il salvataggio.
                      customerNotificationsEnabled: event.target.value.trim()
                        ? current.customerNotificationsEnabled
                        : false,
                    }))
                  }
                  className={inputClass}
                  data-testid="input-profile-email"
                />
              </div>
              <div>
                <label className={labelClass}>Totale prenotazione (€)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={profileDraft.total}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      total: event.target.value,
                    }))
                  }
                  placeholder="es. 250,00"
                  className={inputClass}
                  data-testid="input-profile-total"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={profileDraft.customerNotificationsEnabled}
                disabled={!profileDraft.email.trim()}
                onChange={(event) =>
                  setProfileDraft((current) => ({
                    ...current,
                    customerNotificationsEnabled: event.target.checked,
                  }))
                }
                className="h-4 w-4 accent-primary"
                data-testid="checkbox-profile-notifications"
              />
              Invia le comunicazioni automatiche a questo cliente
            </label>

            <label className="flex items-center gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={profileDraft.servizioCasa}
                onChange={(event) =>
                  setProfileDraft((current) => ({
                    ...current,
                    servizioCasa: event.target.checked,
                  }))
                }
                className="h-4 w-4 accent-primary"
                data-testid="checkbox-profile-home-pickup"
              />
              Ritiro a domicilio
            </label>
            {profileDraft.servizioCasa && (
              <div>
                <label className={labelClass}>Indirizzo di ritiro *</label>
                <input
                  type="text"
                  maxLength={500}
                  value={profileDraft.homePickupAddress}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      homePickupAddress: event.target.value,
                    }))
                  }
                  className={inputClass}
                  data-testid="input-profile-home-address"
                />
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={submitProfile}
                disabled={busy || !profileDraft.customerName.trim()}
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                data-testid="button-save-booking-profile"
              >
                <Save className="h-3.5 w-3.5" /> Salva
              </button>
              <button
                type="button"
                onClick={() => setIsEditingProfile(false)}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/40 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" /> Annulla
              </button>
            </div>
          </div>
        )}
      </div>

      {/* --- Richieste aperte -------------------------------------------- */}
      {openRequests.length > 0 && (
        <div className={sectionClass}>
          <div className={sectionTitleClass}>
            <RotateCcw className="h-3.5 w-3.5" /> Come verrà pagata
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Il metodo lo sceglie il cliente dal portale, ma qui puoi deciderlo
            al posto suo: chi prenota al telefono non ci passa mai. Senza un
            metodo la richiesta non può essere segnata come pagata.
          </p>
          <ul className="space-y-3">
            {openRequests.map((request) => {
              const draft = draftFor(request);
              const setDraft = (patch: Partial<typeof draft>) =>
                setRequestDrafts((current) => ({
                  ...current,
                  [request.id]: { ...draft, ...patch },
                }));
              const onBusAllowed =
                request.type === "balance" && payOnBusEnabled;
              return (
                <li
                  key={request.id}
                  className="rounded-xl border border-border bg-muted/10 p-3"
                  data-testid={`request-editor-${request.id}`}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-foreground">
                      {request.type === "deposit"
                        ? "Acconto"
                        : request.type === "balance"
                          ? "Saldo"
                          : "Totale"}
                    </span>
                    <span>{formatEurCents(request.amountCents)}</span>
                    {request.status === "expired" && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700">
                        scaduta — una correzione la riapre
                      </span>
                    )}
                    {!request.method && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                        metodo non ancora scelto
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div>
                      <label className={labelClass}>Metodo</label>
                      <select
                        value={draft.method}
                        onChange={(event) =>
                          setDraft({ method: event.target.value })
                        }
                        className={inputClass}
                        data-testid={`select-request-method-${request.id}`}
                      >
                        <option value="" disabled>
                          Da scegliere
                        </option>
                        {request.method === "card" && (
                          <option value="card" disabled>
                            Carta (scelta dal cliente)
                          </option>
                        )}
                        <option value="bank_transfer">Bonifico</option>
                        <option value="office">In ufficio</option>
                        {onBusAllowed && (
                          <option value="on_bus">Sul bus</option>
                        )}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Importo (€)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={draft.amount}
                        onChange={(event) =>
                          setDraft({ amount: event.target.value })
                        }
                        className={inputClass}
                        data-testid={`input-request-amount-${request.id}`}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Scadenza</label>
                      <input
                        type="datetime-local"
                        value={draft.deadline}
                        onChange={(event) =>
                          setDraft({ deadline: event.target.value })
                        }
                        className={inputClass}
                        data-testid={`input-request-deadline-${request.id}`}
                      />
                    </div>
                  </div>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <label className={labelClass}>
                        Motivo (obbligatorio se cambi l'importo)
                      </label>
                      <input
                        type="text"
                        maxLength={500}
                        value={draft.reason}
                        onChange={(event) =>
                          setDraft({ reason: event.target.value })
                        }
                        placeholder="es. sconto concordato al telefono"
                        className={inputClass}
                        data-testid={`input-request-reason-${request.id}`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => submitRequest(request)}
                      disabled={busy}
                      className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                      data-testid={`button-save-request-${request.id}`}
                    >
                      <Check className="h-3.5 w-3.5" /> Applica
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* --- Registrazione di un incasso ---------------------------------- */}
      <div className={sectionClass}>
        <div className={sectionTitleClass}>
          <Banknote className="h-3.5 w-3.5" /> Registra un incasso
        </div>
        {total === null ? (
          <p className="text-xs text-amber-800">
            Questa prenotazione non ha un totale registrato: impostalo qui sopra
            prima di registrare un incasso.
          </p>
        ) : (
          <>
            <p className="mb-3 text-xs text-muted-foreground">
              Per il denaro arrivato allo sportello. Se una richiesta aperta ha
              esattamente questo importo viene saldata quella; altrimenti nasce
              una riga di incasso e le richieste aperte si riallineano al
              residuo.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Importo incassato (€) *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={paymentDraft.amount}
                    onChange={(event) =>
                      setPaymentDraft((current) => ({
                        ...current,
                        amount: event.target.value,
                      }))
                    }
                    placeholder="es. 50,00"
                    className={inputClass}
                    data-testid="input-record-amount"
                  />
                  {residual !== null && residual > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setPaymentDraft((current) => ({
                          ...current,
                          amount: centsToInput(residual),
                        }))
                      }
                      className="shrink-0 rounded-lg border border-border px-2 text-xs font-medium text-muted-foreground hover:bg-muted/40"
                      data-testid="button-record-amount-residual"
                    >
                      Tutto
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className={labelClass}>Incassato come *</label>
                <select
                  value={paymentDraft.method}
                  onChange={(event) =>
                    setPaymentDraft((current) => ({
                      ...current,
                      method: event.target.value,
                    }))
                  }
                  className={inputClass}
                  data-testid="select-record-method"
                >
                  <option value="office">In ufficio</option>
                  <option value="bank_transfer">Bonifico</option>
                  {payOnBusEnabled && <option value="on_bus">Sul bus</option>}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>
                  Riferimento dell'operazione *
                </label>
                <input
                  type="text"
                  maxLength={500}
                  value={paymentDraft.reference}
                  onChange={(event) =>
                    setPaymentDraft((current) => ({
                      ...current,
                      reference: event.target.value,
                    }))
                  }
                  placeholder={
                    paymentDraft.method === "bank_transfer"
                      ? "CRO / TRN del bonifico"
                      : "numero ricevuta o nota di cassa"
                  }
                  className={inputClass}
                  data-testid="input-record-reference"
                />
              </div>
              <div>
                <label className={labelClass}>
                  Data dell'incasso (se diversa da oggi)
                </label>
                <input
                  type="datetime-local"
                  value={paymentDraft.paidAt}
                  onChange={(event) =>
                    setPaymentDraft((current) => ({
                      ...current,
                      paidAt: event.target.value,
                    }))
                  }
                  className={inputClass}
                  data-testid="input-record-paid-at"
                />
              </div>
              <div>
                <label className={labelClass}>Nota (facoltativa)</label>
                <input
                  type="text"
                  maxLength={500}
                  value={paymentDraft.reason}
                  onChange={(event) =>
                    setPaymentDraft((current) => ({
                      ...current,
                      reason: event.target.value,
                    }))
                  }
                  className={inputClass}
                  data-testid="input-record-reason"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={submitPayment}
              disabled={
                busy ||
                !paymentDraft.amount.trim() ||
                !paymentDraft.reference.trim()
              }
              className="mt-3 inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              data-testid="button-record-payment"
            >
              <Check className="h-3.5 w-3.5" /> Registra l'incasso
            </button>
            {(!paymentDraft.amount.trim() ||
              !paymentDraft.reference.trim()) && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Servono importo e riferimento: senza, l'incasso non sarebbe
                ricostruibile a distanza di mesi.
              </p>
            )}
          </>
        )}
      </div>

      {/* --- Storno di un incasso ----------------------------------------- */}
      <ReversalSection
        requests={data.paymentRequests ?? []}
        busy={busy}
        reversingId={reversingId}
        reversalReason={reversalReason}
        onStart={(id) => {
          setReversingId(id);
          setReversalReason("");
        }}
        onCancel={() => {
          setReversingId(null);
          setReversalReason("");
        }}
        onReasonChange={setReversalReason}
        onConfirm={(id) => {
          onBusy(true);
          reversePayment({
            requestId: id,
            data: { reason: reversalReason.trim() },
          });
        }}
      />

      {/* --- Diario -------------------------------------------------------- */}
      {data.adminActions.length > 0 && (
        <div className={sectionClass}>
          <button
            type="button"
            onClick={() => setShowDiary((current) => !current)}
            className={`${sectionTitleClass} mb-0 hover:text-foreground`}
            data-testid="button-toggle-admin-diary"
          >
            <History className="h-3.5 w-3.5" /> Interventi manuali (
            {data.adminActions.length})
          </button>
          {showDiary && (
            <ul className="mt-3 space-y-2 text-xs">
              {data.adminActions.map((action) => (
                <li
                  key={action.id}
                  className="rounded-lg border border-border/70 px-3 py-2"
                >
                  <div className="flex flex-wrap gap-x-2 text-foreground">
                    <strong>
                      {ACTION_LABELS[action.action] ?? action.action}
                    </strong>
                    <span className="text-muted-foreground">
                      {formatDateTime(action.createdAt)}
                    </span>
                    {action.adminName && (
                      <span className="text-muted-foreground">
                        · {action.adminName}
                      </span>
                    )}
                  </div>
                  {action.reason && (
                    <div className="mt-0.5 text-muted-foreground">
                      {action.reason}
                    </div>
                  )}
                  <ActionDetails action={action} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Riepilogo leggibile del movimento, senza vomitare il jsonb grezzo: importo e
 * metodo sono le due cose che si cercano davvero rileggendo il diario.
 */
function ActionDetails({ action }: { action: AdminBookingAction }) {
  const details = (action.details ?? {}) as Record<string, unknown>;
  const amountCents =
    typeof details.amountCents === "number" ? details.amountCents : null;
  const method = typeof details.method === "string" ? details.method : null;
  if (amountCents === null && !method) return null;
  return (
    <div className="mt-0.5 text-muted-foreground">
      {amountCents !== null ? formatEurCents(amountCents) : ""}
      {amountCents !== null && method ? " · " : ""}
      {method ? (METHOD_LABELS[method] ?? method) : ""}
    </div>
  );
}

function ReversalSection({
  requests,
  busy,
  reversingId,
  reversalReason,
  onStart,
  onCancel,
  onReasonChange,
  onConfirm,
}: {
  requests: AdminPaymentRequest[];
  busy: boolean;
  reversingId: string | null;
  reversalReason: string;
  onStart: (id: string) => void;
  onCancel: () => void;
  onReasonChange: (value: string) => void;
  onConfirm: (id: string) => void;
}) {
  // Solo gli incassi registrati a mano: quelli su carta hanno mosso denaro
  // vero e si chiudono con un rimborso, non con una riga riscritta.
  const reversible = requests.filter(
    (request) =>
      request.status === "paid" &&
      request.method !== null &&
      request.method !== "card",
  );
  if (reversible.length === 0) return null;

  return (
    <div className={sectionClass}>
      <div className={sectionTitleClass}>
        <Undo2 className="h-3.5 w-3.5" /> Storna un incasso
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Da usare quando l'incasso è stato registrato per errore. La riga resta
        nello storico con il motivo dello storno e il residuo torna dovuto.
      </p>
      <ul className="space-y-2">
        {reversible.map((request) => (
          <li
            key={request.id}
            className="rounded-lg border border-border px-3 py-2 text-xs"
          >
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-foreground">
                {formatEurCents(request.amountCents)}
              </strong>
              <span className="text-muted-foreground">
                {METHOD_LABELS[request.method ?? ""] ?? request.method}
              </span>
              <span className="text-muted-foreground">
                {formatDateTime(request.paidAt)}
              </span>
              {request.transactionReference && (
                <span className="font-mono text-muted-foreground">
                  {request.transactionReference}
                </span>
              )}
              {reversingId !== request.id && (
                <button
                  type="button"
                  onClick={() => onStart(request.id)}
                  disabled={busy}
                  className="ml-auto rounded-md px-2 py-1 font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  data-testid={`button-start-reverse-${request.id}`}
                >
                  Storna
                </button>
              )}
            </div>
            {reversingId === request.id && (
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  maxLength={500}
                  value={reversalReason}
                  onChange={(event) => onReasonChange(event.target.value)}
                  placeholder="Motivo dello storno (obbligatorio)"
                  className={`${inputClass} flex-1`}
                  data-testid={`input-reverse-reason-${request.id}`}
                />
                <button
                  type="button"
                  onClick={() => onConfirm(request.id)}
                  disabled={busy || !reversalReason.trim()}
                  className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  data-testid={`button-confirm-reverse-${request.id}`}
                >
                  Conferma storno
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={busy}
                  className="shrink-0 rounded-lg border border-border px-3 py-1.5 font-medium text-muted-foreground hover:bg-muted/40 disabled:opacity-50"
                >
                  Annulla
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
