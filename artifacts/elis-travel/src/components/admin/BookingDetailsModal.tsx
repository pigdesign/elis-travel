import { useState } from "react";
import {
  X,
  Loader2,
  AlertCircle,
  Users,
  FileText,
  CreditCard,
  Check,
  Clock,
  CalendarClock,
} from "lucide-react";
import {
  useGetAdminBookingDetails,
  useMarkPaymentRequestPaid,
  useRequestBookingBalance,
  useUpdateBookingDeadline,
  getGetAdminBookingDetailsQueryKey,
  getGetExcursionQueryKey,
  getListExcursionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

function formatEurCents(cents: number) {
  return (cents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const PARTICIPANT_TYPE_LABELS: Record<string, string> = {
  adult: "Adulto",
  child: "Bambino",
  patient: "Paziente",
  companion: "Accompagnatore",
};

const CONSENT_LABELS: Record<string, string> = {
  terms: "Termini e Condizioni",
  privacy: "Informativa Privacy",
  media: "Foto/Video promozionali",
};

const REQUEST_TYPE_LABELS: Record<string, string> = {
  deposit: "Acconto",
  full: "Importo completo",
  balance: "Saldo",
};

const REQUEST_STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending: { label: "In attesa", cls: "bg-amber-100 text-amber-700" },
  paid: { label: "Pagato", cls: "bg-emerald-100 text-emerald-700" },
  expired: { label: "Scaduto", cls: "bg-red-100 text-red-700" },
  cancelled: { label: "Annullato", cls: "bg-gray-100 text-gray-600" },
};

const METHOD_LABELS: Record<string, string> = {
  card: "Carta",
  bank_transfer: "Bonifico",
  office: "In ufficio",
};

export function BookingDetailsModal({
  bookingId,
  excursionId,
  onClose,
}: {
  bookingId: string;
  excursionId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useGetAdminBookingDetails(bookingId);
  const [deadlineInput, setDeadlineInput] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: getGetAdminBookingDetailsQueryKey(bookingId) });
    void queryClient.invalidateQueries({ queryKey: getGetExcursionQueryKey(excursionId) });
    void queryClient.invalidateQueries({ queryKey: getListExcursionsQueryKey() });
  };

  const onActionError = (err: unknown) => {
    const e = err as { data?: { error?: string }; message?: string };
    setActionError(e?.data?.error ?? e?.message ?? "Operazione non riuscita.");
  };

  const { mutate: markPaid, isPending: isMarking } = useMarkPaymentRequestPaid({
    mutation: { onSuccess: invalidate, onError: onActionError },
  });
  const { mutate: requestBalance, isPending: isRequesting } = useRequestBookingBalance({
    mutation: { onSuccess: invalidate, onError: onActionError },
  });
  const { mutate: updateDeadline, isPending: isExtending } = useUpdateBookingDeadline({
    mutation: { onSuccess: () => { setDeadlineInput(""); invalidate(); }, onError: onActionError },
  });

  const booking = data?.booking;
  const total = booking?.totalAmountCents ?? null;
  const paid = booking?.amountPaidCents ?? 0;
  const residual = total !== null ? total - paid : null;
  const busy = isMarking || isRequesting || isExtending;
  const hasBalanceRequest = (data?.paymentRequests ?? []).some((r) => r.type === "balance");
  const canRequestBalance =
    !!booking && total !== null && paid > 0 && (residual ?? 0) > 0 && !hasBalanceRequest && !booking.cancelledAt;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto"
      data-testid="modal-booking-details"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <h3 className="text-lg font-bold text-foreground">
            Dettaglio prenotazione
            {booking?.bookingCode && (
              <span className="ml-2 font-mono text-sm text-primary">{booking.bookingCode}</span>
            )}
          </h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-muted/50" data-testid="button-close-booking-details">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {isLoading && (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {error != null && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              Impossibile caricare il dettaglio.
            </div>
          )}

          {booking && (
            <>
              {/* Referente + riepilogo economico */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-border p-4 text-sm space-y-1.5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Referente
                  </div>
                  <div className="font-semibold text-foreground">{booking.customerName}</div>
                  {booking.email && <div className="text-muted-foreground">{booking.email}</div>}
                  {booking.phone && <div className="text-muted-foreground">{booking.phone}</div>}
                  <div className="text-xs text-muted-foreground pt-1">
                    Prenotata il {formatDateTime(booking.bookedAt)} · {booking.seats}{" "}
                    {booking.seats === 1 ? "persona" : "persone"}
                  </div>
                </div>
                <div className="rounded-xl border border-border p-4 text-sm space-y-1.5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Pagamento
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Totale</span>
                    <strong>{total !== null ? formatEurCents(total) : "—"}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pagato</span>
                    <span className="text-emerald-700 font-medium">{formatEurCents(paid)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Residuo</span>
                    <span className={residual && residual > 0 ? "text-amber-700 font-medium" : ""}>
                      {residual !== null ? formatEurCents(Math.max(residual, 0)) : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Metodo</span>
                    <span>{booking.paymentMethod ? METHOD_LABELS[booking.paymentMethod] ?? booking.paymentMethod : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Scadenza</span>
                    <span>{formatDateTime(booking.paymentDeadline)}</span>
                  </div>
                </div>
              </div>

              {/* Partecipanti */}
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  <Users className="w-3.5 h-3.5" /> Partecipanti
                </div>
                {!data.participantsDetailed ? (
                  <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    Dati partecipanti non dettagliati (prenotazione precedente): {booking.adults}{" "}
                    adulti{booking.children > 0 ? ` + ${booking.children} bambini` : ""}.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/30 text-xs text-muted-foreground">
                        <tr>
                          <th className="py-2 px-3 text-left font-semibold">Tipo</th>
                          <th className="py-2 px-3 text-left font-semibold">Fascia</th>
                          <th className="py-2 px-3 text-left font-semibold">Raccolta</th>
                          <th className="py-2 px-3 text-right font-semibold">Base</th>
                          <th className="py-2 px-3 text-right font-semibold">Suppl.</th>
                          <th className="py-2 px-3 text-right font-semibold">Totale</th>
                          <th className="py-2 px-3 text-center font-semibold">Dati</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.participants.map((p) => (
                          <tr key={p.id} className="border-t border-border/50">
                            <td className="py-2 px-3">
                              {PARTICIPANT_TYPE_LABELS[p.participantType] ?? p.participantType}
                              {(p.firstName || p.lastName) && (
                                <span className="block text-xs text-muted-foreground">
                                  {[p.firstName, p.lastName].filter(Boolean).join(" ")}
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-muted-foreground">{p.ageRangeLabel ?? "—"}</td>
                            <td className="py-2 px-3 text-muted-foreground">{p.pickupPointName ?? "—"}</td>
                            <td className="py-2 px-3 text-right">{formatEurCents(p.basePriceCents)}</td>
                            <td className="py-2 px-3 text-right">
                              {p.pickupSurchargeCents !== 0 ? formatEurCents(p.pickupSurchargeCents) : "—"}
                            </td>
                            <td className="py-2 px-3 text-right font-medium">{formatEurCents(p.finalPriceCents)}</td>
                            <td className="py-2 px-3 text-center">
                              {p.dataCompleted ? (
                                <span className="text-emerald-600 text-xs font-medium">Completi</span>
                              ) : (
                                <span className="text-muted-foreground text-xs">Da raccogliere</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Consensi */}
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  <FileText className="w-3.5 h-3.5" /> Consensi
                </div>
                {data.consents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nessun consenso registrato (prenotazione precedente al nuovo sistema).
                  </p>
                ) : (
                  <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {data.consents.map((c) => (
                      <li key={c.id} className="rounded-xl border border-border px-3 py-2.5 text-xs">
                        <div className="font-medium text-foreground">{CONSENT_LABELS[c.consentType] ?? c.consentType}</div>
                        <div className={c.accepted ? "text-emerald-700" : "text-muted-foreground"}>
                          {c.accepted ? "Accettato" : "Non accettato"}
                          {c.policyVersion ? ` · v${c.policyVersion}` : ""}
                        </div>
                        <div className="text-muted-foreground">{formatDateTime(c.acceptedAt)}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Richieste di pagamento */}
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  <CreditCard className="w-3.5 h-3.5" /> Richieste di pagamento
                </div>
                {data.paymentRequests.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nessuna richiesta registrata (prenotazione precedente al nuovo sistema): usa i
                    pulsanti di stato nella tabella prenotazioni.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {data.paymentRequests.map((r) => {
                      const st = REQUEST_STATUS_LABELS[r.status] ?? REQUEST_STATUS_LABELS.pending;
                      return (
                        <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-4 py-3 text-sm">
                          <span className="font-medium text-foreground">
                            {REQUEST_TYPE_LABELS[r.type] ?? r.type}
                          </span>
                          <span className="font-semibold">{formatEurCents(r.amountCents)}</span>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>
                            {st.label}
                          </span>
                          {r.method && (
                            <span className="text-xs text-muted-foreground">{METHOD_LABELS[r.method] ?? r.method}</span>
                          )}
                          {r.deadline && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="w-3 h-3" /> {formatDateTime(r.deadline)}
                            </span>
                          )}
                          {r.paidAt && (
                            <span className="text-xs text-emerald-700">pagato il {formatDateTime(r.paidAt)}</span>
                          )}
                          {r.transactionReference && (
                            <span className="text-xs font-mono text-muted-foreground">{r.transactionReference}</span>
                          )}
                          {(r.status === "pending" || r.status === "expired") && !booking.cancelledAt && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => { setActionError(null); markPaid({ requestId: r.id, data: {} }); }}
                              className="ml-auto inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                              data-testid={`button-mark-paid-${r.id}`}
                            >
                              <Check className="w-3.5 h-3.5" /> Segna pagato
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Azioni */}
              {!booking.cancelledAt && (
                <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Azioni
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    {canRequestBalance && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => { setActionError(null); requestBalance({ bookingId }); }}
                        className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
                        data-testid="button-request-balance"
                      >
                        {isRequesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
                        Richiedi saldo ({residual !== null ? formatEurCents(residual) : ""})
                      </button>
                    )}
                    <div className="flex items-end gap-2">
                      <div>
                        <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                          Nuova scadenza pagamento
                        </label>
                        <input
                          type="datetime-local"
                          value={deadlineInput}
                          onChange={(e) => setDeadlineInput(e.target.value)}
                          className="px-3 py-1.5 border border-border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                          data-testid="input-new-deadline"
                        />
                      </div>
                      <button
                        type="button"
                        disabled={busy || !deadlineInput}
                        onClick={() => {
                          setActionError(null);
                          updateDeadline({ bookingId, data: { deadline: new Date(deadlineInput).toISOString() } });
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-white border border-border text-foreground hover:bg-muted disabled:opacity-50"
                        data-testid="button-extend-deadline"
                      >
                        {isExtending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarClock className="w-3.5 h-3.5" />}
                        Aggiorna scadenza
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Aggiornare la scadenza riattiva le prenotazioni scadute. La conferma dei
                    pagamenti aggiorna automaticamente importi pagati e stato.
                  </p>
                </div>
              )}

              {actionError && (
                <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {actionError}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
