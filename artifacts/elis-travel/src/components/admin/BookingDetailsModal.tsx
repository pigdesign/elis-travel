import { useEffect, useState } from "react";
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
  Ban,
  History,
  ReceiptText,
  Wrench,
} from "lucide-react";
import {
  useCompleteAdminRefundManually,
  useCompleteStripeCleanupJobManually,
  useGetAdminBookingDetails,
  useMarkPaymentRequestPaid,
  useOpenAdminBookingCancellation,
  useReplaceAdminBookingParticipants,
  useRequestBookingBalance,
  useResolveAdminBookingCancellation,
  useUpdateBookingDeadline,
  getGetAdminBookingDetailsQueryKey,
  getGetExcursionQueryKey,
  getListExcursionsQueryKey,
} from "@workspace/api-client-react";
import type {
  AdminBookingParticipantReplaceRow,
  ExcursionAgePriceRow,
  ExcursionPickupPoint,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

function formatEurCents(cents: number) {
  return (cents / 100).toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
  });
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("it-IT", {
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
  const [euros, decimals = ""] = normalized.split(".");
  const cents = Number(euros) * 100 + Number(decimals.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
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

const CANCELLATION_SOURCE_LABELS: Record<string, string> = {
  customer: "Cliente",
  admin: "Amministrazione",
  excursion: "Annullamento gita",
};

const CANCELLATION_STATUS_LABELS: Record<
  string,
  { label: string; cls: string }
> = {
  pending: { label: "Da decidere", cls: "bg-amber-100 text-amber-800" },
  rejected: { label: "Rifiutata", cls: "bg-slate-100 text-slate-700" },
  superseded: {
    label: "Sostituita dall'annullamento gita",
    cls: "bg-slate-100 text-slate-700",
  },
  approved: { label: "Approvata", cls: "bg-blue-100 text-blue-800" },
  refunding: { label: "Rimborso in corso", cls: "bg-blue-100 text-blue-800" },
  manual_required: {
    label: "Intervento richiesto",
    cls: "bg-red-100 text-red-800",
  },
  completed: { label: "Conclusa", cls: "bg-emerald-100 text-emerald-800" },
};

const REFUND_STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending: { label: "In coda", cls: "bg-amber-100 text-amber-800" },
  processing: { label: "In elaborazione", cls: "bg-blue-100 text-blue-800" },
  succeeded: { label: "Completato", cls: "bg-emerald-100 text-emerald-800" },
  failed: { label: "Errore / nuovo tentativo", cls: "bg-red-100 text-red-800" },
  manual_required: {
    label: "Da rimborsare manualmente",
    cls: "bg-red-100 text-red-800",
  },
};

const TECHNICAL_STATUS_LABELS: Record<string, string> = {
  pending: "In coda",
  processing: "In elaborazione",
  cancellation_pending: "Annullamento in corso",
  succeeded: "Completato",
  failed: "Errore",
  cancelled: "Annullato",
  manual_required: "Intervento richiesto",
};

type ParticipantEditDraft = {
  id: string | null;
  type: "adult" | "child" | "patient" | "companion";
  firstName: string;
  lastName: string;
  ageRangeId: string;
  pickupPointId: string;
};

export function BookingDetailsModal({
  bookingId,
  excursionId,
  excursionStatus,
  isRident,
  pickupPoints,
  ageRanges,
  onClose,
}: {
  bookingId: string;
  excursionId: string;
  excursionStatus: string;
  isRident: boolean;
  pickupPoints: ExcursionPickupPoint[];
  ageRanges: ExcursionAgePriceRow[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useGetAdminBookingDetails(bookingId);
  const [deadlineInput, setDeadlineInput] = useState("");
  const [adminCancellationReason, setAdminCancellationReason] = useState("");
  const [adminCancellationCommandId, setAdminCancellationCommandId] = useState(
    () => crypto.randomUUID(),
  );
  const [cancellationRefundInput, setCancellationRefundInput] = useState("");
  const [cancellationNote, setCancellationNote] = useState("");
  const [manualRefundReferences, setManualRefundReferences] = useState<
    Record<string, string>
  >({});
  const [manualPaymentReferences, setManualPaymentReferences] = useState<
    Record<string, string>
  >({});
  const [manualCleanupReferences, setManualCleanupReferences] = useState<
    Record<string, string>
  >({});
  const [completingRefundId, setCompletingRefundId] = useState<string | null>(
    null,
  );
  const [completingCleanupId, setCompletingCleanupId] = useState<string | null>(
    null,
  );
  const [isEditingParticipants, setIsEditingParticipants] = useState(false);
  const [participantDrafts, setParticipantDrafts] = useState<
    ParticipantEditDraft[]
  >([]);
  const [participantCommonPickupId, setParticipantCommonPickupId] =
    useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setAdminCancellationReason("");
    setAdminCancellationCommandId(crypto.randomUUID());
    setCancellationRefundInput("");
    setCancellationNote("");
    setManualRefundReferences({});
    setManualPaymentReferences({});
    setManualCleanupReferences({});
    setCompletingRefundId(null);
    setCompletingCleanupId(null);
    setIsEditingParticipants(false);
    setParticipantDrafts([]);
    setParticipantCommonPickupId("");
    setActionError(null);
  }, [bookingId]);

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: getGetAdminBookingDetailsQueryKey(bookingId),
    });
    void queryClient.invalidateQueries({
      queryKey: getGetExcursionQueryKey(excursionId),
    });
    void queryClient.invalidateQueries({
      queryKey: getListExcursionsQueryKey(),
    });
  };

  const onActionError = (err: unknown) => {
    const e = err as { data?: { error?: string }; message?: string };
    setActionError(e?.data?.error ?? e?.message ?? "Operazione non riuscita.");
  };

  const { mutate: markPaid, isPending: isMarking } = useMarkPaymentRequestPaid({
    mutation: {
      onSuccess: (_result, variables) => {
        setManualPaymentReferences((current) => {
          const next = { ...current };
          delete next[variables.requestId];
          return next;
        });
        invalidate();
      },
      onError: onActionError,
    },
  });
  const { mutate: requestBalance, isPending: isRequesting } =
    useRequestBookingBalance({
      mutation: { onSuccess: invalidate, onError: onActionError },
    });
  const { mutate: updateDeadline, isPending: isExtending } =
    useUpdateBookingDeadline({
      mutation: {
        onSuccess: () => {
          setDeadlineInput("");
          invalidate();
        },
        onError: onActionError,
      },
    });
  const { mutate: openAdminCancellation, isPending: isOpeningCancellation } =
    useOpenAdminBookingCancellation({
      mutation: {
        onSuccess: () => {
          setAdminCancellationReason("");
          setAdminCancellationCommandId(crypto.randomUUID());
          invalidate();
        },
        onError: onActionError,
      },
    });
  const { mutate: resolveCancellation, isPending: isResolvingCancellation } =
    useResolveAdminBookingCancellation({
      mutation: {
        onSuccess: () => {
          setCancellationRefundInput("");
          setCancellationNote("");
          invalidate();
        },
        onError: onActionError,
      },
    });
  const { mutate: completeManualRefund, isPending: isCompletingRefund } =
    useCompleteAdminRefundManually({
      mutation: {
        onSuccess: (_result, variables) => {
          setManualRefundReferences((current) => {
            const next = { ...current };
            delete next[variables.refundId];
            return next;
          });
          invalidate();
        },
        onError: onActionError,
        onSettled: () => setCompletingRefundId(null),
      },
    });
  const { mutate: completeManualCleanup, isPending: isCompletingCleanup } =
    useCompleteStripeCleanupJobManually({
      mutation: {
        onSuccess: (_result, variables) => {
          setManualCleanupReferences((current) => {
            const next = { ...current };
            delete next[variables.jobId];
            return next;
          });
          invalidate();
        },
        onError: onActionError,
        onSettled: () => setCompletingCleanupId(null),
      },
    });
  const { mutate: replaceParticipants, isPending: isReplacingParticipants } =
    useReplaceAdminBookingParticipants({
      mutation: {
        onSuccess: () => {
          setIsEditingParticipants(false);
          invalidate();
        },
        onError: onActionError,
      },
    });

  const booking = data?.booking;
  const economicSummary = data?.economicSummary;
  const total =
    economicSummary?.totalAmountCents ?? booking?.totalAmountCents ?? null;
  const paid =
    economicSummary?.paidAmountCents ?? booking?.amountPaidCents ?? 0;
  const residual =
    economicSummary?.balanceAmountCents ??
    (total !== null ? Math.max(total - paid, 0) : null);
  const busy =
    isMarking ||
    isRequesting ||
    isExtending ||
    isOpeningCancellation ||
    isResolvingCancellation ||
    isCompletingRefund ||
    isCompletingCleanup ||
    isReplacingParticipants;
  const hasBalanceRequest = (data?.paymentRequests ?? []).some(
    (r) => r.type === "balance",
  );
  const deadlineTarget = [...(data?.paymentRequests ?? [])]
    .filter((request) =>
      ["pending", "action_required", "expired"].includes(request.status),
    )
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime(),
    )[0];
  const canRequestBalance =
    !!booking &&
    total !== null &&
    paid > 0 &&
    (residual ?? 0) > 0 &&
    !hasBalanceRequest &&
    !booking.cancelledAt;
  const pendingCancellationCase = [...(data?.cancellationCases ?? [])]
    .reverse()
    .find((cancellationCase) => cancellationCase.status === "pending");
  const projectedPendingWithoutCase =
    booking?.cancellationRequestStatus === "pending" &&
    !pendingCancellationCase;
  const canOpenAdminCancellation =
    !!booking &&
    !booking.cancelledAt &&
    !pendingCancellationCase &&
    !projectedPendingWithoutCase;
  const activePickupPoints = pickupPoints.filter(
    (pickupPoint) =>
      (
        pickupPoint.location as typeof pickupPoint.location & {
          active?: boolean;
        }
      ).active !== false,
  );
  const participantPricesAvailable = (data?.participants ?? []).some(
    (participant) =>
      participant.basePriceCents > 0 ||
      participant.pickupSurchargeCents > 0 ||
      participant.finalPriceCents > 0,
  );
  const freeBooking = total === 0;
  const canEditParticipantDetails =
    !!booking &&
    !booking.cancelledAt &&
    !["completed", "cancelled", "archived"].includes(excursionStatus);

  const startParticipantEdit = () => {
    if (!booking || !data) return;
    const existing = [...data.participants].sort(
      (left, right) => left.sortOrder - right.sortOrder,
    );
    setParticipantDrafts(
      Array.from({ length: booking.seats }, (_, index) => {
        const participant = existing[index];
        const fallbackType: ParticipantEditDraft["type"] = isRident
          ? index === 0
            ? "patient"
            : "companion"
          : index < booking.adults
            ? "adult"
            : "child";
        return {
          id: participant?.id ?? null,
          type:
            participant &&
            ["adult", "child", "patient", "companion"].includes(
              participant.participantType,
            )
              ? (participant.participantType as ParticipantEditDraft["type"])
              : fallbackType,
          firstName: participant?.firstName ?? "",
          lastName: participant?.lastName ?? "",
          ageRangeId: participant?.ageRangeId ?? "",
          pickupPointId: participant?.pickupPointId ?? "",
        };
      }),
    );
    setParticipantCommonPickupId(booking.pickupPointId ?? "");
    setActionError(null);
    setIsEditingParticipants(true);
  };

  const submitParticipantReplacement = () => {
    if (!booking) return;
    if (
      participantDrafts.length !== booking.seats ||
      participantDrafts.some(
        (participant) =>
          !participant.firstName.trim() || !participant.lastName.trim(),
      )
    ) {
      setActionError(
        `Inserisci nome e cognome per tutti i ${booking.seats} partecipanti.`,
      );
      return;
    }
    if (
      activePickupPoints.length > 0 &&
      (isRident
        ? participantDrafts.some((participant) => !participant.pickupPointId)
        : !participantCommonPickupId)
    ) {
      setActionError(
        isRident
          ? "Seleziona il punto di raccolta di ogni partecipante."
          : "Seleziona il punto di raccolta comune.",
      );
      return;
    }
    if (
      !isRident &&
      ageRanges.length > 0 &&
      participantDrafts.some(
        (participant) =>
          participant.type === "child" && !participant.ageRangeId,
      )
    ) {
      setActionError("Seleziona la fascia età di ogni bambino.");
      return;
    }
    if (
      !window.confirm(
        `Confermi la correzione dei dati di ${booking.seats} partecipanti? Posti, totale e pagamenti non verranno modificati; gli importi per persona restano gli snapshot storici della prenotazione.`,
      )
    )
      return;
    const participants: AdminBookingParticipantReplaceRow[] =
      participantDrafts.map((participant) => ({
        ...(participant.id ? { id: participant.id } : {}),
        type: participant.type,
        firstName: participant.firstName.trim(),
        lastName: participant.lastName.trim(),
        ageRangeId:
          participant.type === "child" ? participant.ageRangeId || null : null,
        pickupPointId: isRident ? participant.pickupPointId || null : null,
      }));
    setActionError(null);
    replaceParticipants({
      bookingId,
      data: {
        participants,
        pickupPointId: isRident ? null : participantCommonPickupId || null,
      },
    });
  };

  const submitOpenAdminCancellation = () => {
    setActionError(null);
    const reason = adminCancellationReason.trim();
    if (!reason) {
      setActionError("Inserisci il motivo dell'annullamento amministrativo.");
      return;
    }
    openAdminCancellation({
      bookingId,
      data: {
        clientCommandId: adminCancellationCommandId,
        reason,
      },
    });
  };

  const submitCancellation = (decision: "approve" | "reject") => {
    setActionError(null);
    if (!pendingCancellationCase) {
      setActionError("Il caso di annullamento non è più in attesa.");
      return;
    }
    const note = cancellationNote.trim();
    if (!note) {
      setActionError(
        "Inserisci una nota amministrativa per motivare la decisione.",
      );
      return;
    }
    if (decision === "reject") {
      resolveCancellation({
        bookingId,
        data: {
          cancellationCaseId: pendingCancellationCase.id,
          decision,
          note,
        },
      });
      return;
    }
    const refundAmountCents = parseEurCents(cancellationRefundInput);
    if (refundAmountCents === null) {
      setActionError(
        "Inserisci l'importo del rimborso in euro, anche 0, con massimo due decimali.",
      );
      return;
    }
    if (refundAmountCents > paid) {
      setActionError("Il rimborso non può superare quanto risulta incassato.");
      return;
    }
    const confirmed = window.confirm(
      `Confermi l'annullamento e il rimborso di ${formatEurCents(refundAmountCents)}? I posti verranno liberati.`,
    );
    if (!confirmed) return;
    resolveCancellation({
      bookingId,
      data: {
        cancellationCaseId: pendingCancellationCase.id,
        decision,
        refundAmountCents,
        note,
      },
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto"
      data-testid="modal-booking-details"
    >
      <div className="my-8 w-full max-w-4xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <h3 className="text-lg font-bold text-foreground">
            Dettaglio prenotazione
            {booking?.bookingCode && (
              <span className="ml-2 font-mono text-sm text-primary">
                {booking.bookingCode}
              </span>
            )}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted/50"
            data-testid="button-close-booking-details"
          >
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
                  <div className="font-semibold text-foreground">
                    {booking.customerName}
                  </div>
                  {booking.email && (
                    <div className="text-muted-foreground">{booking.email}</div>
                  )}
                  {booking.phone && (
                    <div className="text-muted-foreground">{booking.phone}</div>
                  )}
                  {booking.servizioCasa && (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      <strong>Ritiro a domicilio:</strong>{" "}
                      {booking.homePickupAddress?.trim() ||
                        "indirizzo non registrato — completare prima della gestione operativa"}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground pt-1">
                    Prenotata il {formatDateTime(booking.bookedAt)} ·{" "}
                    {booking.seats}{" "}
                    {booking.seats === 1 ? "persona" : "persone"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Posti:{" "}
                    {booking.seatStatus === "released"
                      ? "liberati"
                      : booking.seatStatus === "confirmed"
                        ? "confermati"
                        : "bloccati"}
                    {booking.seatHoldExpiresAt
                      ? ` fino al ${formatDateTime(booking.seatHoldExpiresAt)}`
                      : ""}
                  </div>
                </div>
                <div className="rounded-xl border border-border p-4 text-sm space-y-1.5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Pagamento
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Totale</span>
                    <strong>
                      {total !== null ? formatEurCents(total) : "—"}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pagato</span>
                    <span className="text-emerald-700 font-medium">
                      {formatEurCents(paid)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Residuo</span>
                    <span
                      className={
                        residual && residual > 0
                          ? "text-amber-700 font-medium"
                          : ""
                      }
                    >
                      {residual !== null
                        ? formatEurCents(Math.max(residual, 0))
                        : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Metodo</span>
                    <span>
                      {booking.paymentMethod
                        ? (METHOD_LABELS[booking.paymentMethod] ??
                          booking.paymentMethod)
                        : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Scadenza</span>
                    <span>{formatDateTime(booking.paymentDeadline)}</span>
                  </div>
                  {economicSummary &&
                    (economicSummary.approvedRefundAmountCents > 0 ||
                      economicSummary.penaltyAmountCents > 0) && (
                      <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            Rimborso approvato
                          </span>
                          <span>
                            {formatEurCents(
                              economicSummary.approvedRefundAmountCents,
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            Già rimborsato
                          </span>
                          <span className="font-medium text-emerald-700">
                            {formatEurCents(
                              economicSummary.refundedAmountCents,
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            Rimborso residuo
                          </span>
                          <span
                            className={
                              economicSummary.remainingApprovedRefundAmountCents >
                              0
                                ? "font-medium text-amber-700"
                                : ""
                            }
                          >
                            {formatEurCents(
                              economicSummary.remainingApprovedRefundAmountCents,
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            Penale trattenuta
                          </span>
                          <span>
                            {formatEurCents(economicSummary.penaltyAmountCents)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            Incasso netto attuale
                          </span>
                          <strong>
                            {formatEurCents(
                              economicSummary.netCollectedAmountCents,
                            )}
                          </strong>
                        </div>
                      </div>
                    )}
                </div>
              </div>

              {booking.cancellationRequestStatus === "pending" && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <strong>Richiesta di annullamento da gestire</strong>
                    <p className="mt-0.5 text-xs">
                      Ricevuta {formatDateTime(booking.cancellationRequestedAt)}
                      . Verifica penali e rimborso prima di liberare i posti.
                    </p>
                  </div>
                </div>
              )}

              {/* Casi di cancellazione e decisione amministrativa */}
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <History className="h-3.5 w-3.5" /> Cancellazioni
                </div>
                {(data.cancellationCases ?? []).length === 0 ? (
                  booking.cancelledAt ? (
                    <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      Prenotazione annullata senza un caso storico collegato.
                      Verifica i dati legacy prima di intervenire sui rimborsi.
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Nessuna richiesta o decisione di annullamento registrata.
                    </p>
                  )
                ) : (
                  <ul className="space-y-2">
                    {[...(data.cancellationCases ?? [])]
                      .reverse()
                      .map((cancellationCase) => {
                        const status =
                          CANCELLATION_STATUS_LABELS[cancellationCase.status] ??
                          CANCELLATION_STATUS_LABELS.pending;
                        return (
                          <li
                            key={cancellationCase.id}
                            className="rounded-xl border border-border px-4 py-3 text-xs"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-foreground">
                                {CANCELLATION_SOURCE_LABELS[
                                  cancellationCase.source
                                ] ?? cancellationCase.source}
                              </span>
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 font-medium ${status.cls}`}
                              >
                                {status.label}
                              </span>
                              <span className="text-muted-foreground">
                                richiesta{" "}
                                {formatDateTime(cancellationCase.requestedAt)}
                              </span>
                              {cancellationCase.openedByAdminName && (
                                <span className="text-muted-foreground">
                                  aperta da {cancellationCase.openedByAdminName}
                                </span>
                              )}
                            </div>
                            {cancellationCase.requestReason && (
                              <p className="mt-2 text-muted-foreground">
                                Motivo: {cancellationCase.requestReason}
                              </p>
                            )}
                            {cancellationCase.decisionReason && (
                              <p className="mt-1 text-muted-foreground">
                                Nota decisione:{" "}
                                {cancellationCase.decisionReason}
                              </p>
                            )}
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                              {cancellationCase.refundableAtDecisionCents !==
                                null &&
                                cancellationCase.refundableAtDecisionCents !==
                                  undefined && (
                                  <span>
                                    Rimborsabile alla decisione:{" "}
                                    {formatEurCents(
                                      cancellationCase.refundableAtDecisionCents,
                                    )}
                                  </span>
                                )}
                              {cancellationCase.approvedRefundCents !== null &&
                                cancellationCase.approvedRefundCents !==
                                  undefined && (
                                  <span>
                                    Approvato:{" "}
                                    {formatEurCents(
                                      cancellationCase.approvedRefundCents,
                                    )}
                                  </span>
                                )}
                              {cancellationCase.decidedAt && (
                                <span>
                                  decisa{" "}
                                  {formatDateTime(cancellationCase.decidedAt)}
                                  {cancellationCase.decidedByAdminName
                                    ? ` da ${cancellationCase.decidedByAdminName}`
                                    : ""}
                                </span>
                              )}
                              {cancellationCase.completedAt && (
                                <span>
                                  conclusa{" "}
                                  {formatDateTime(cancellationCase.completedAt)}
                                </span>
                              )}
                            </div>
                          </li>
                        );
                      })}
                  </ul>
                )}

                {projectedPendingWithoutCase && (
                  <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    La prenotazione indica una richiesta pendente, ma manca il
                    relativo caso amministrativo. La decisione è bloccata per
                    evitare una cancellazione incoerente.
                  </div>
                )}

                {pendingCancellationCase && !booking.cancelledAt && (
                  <details
                    open
                    className="mt-3 rounded-xl border border-amber-300 bg-amber-50/40"
                  >
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-foreground">
                      <Ban className="h-4 w-4 text-red-600" />
                      Decisione sulla richiesta
                    </summary>
                    <div className="space-y-3 border-t border-amber-200 px-4 py-4">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                            Rimborso da approvare (EUR)
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={cancellationRefundInput}
                            onChange={(event) =>
                              setCancellationRefundInput(event.target.value)
                            }
                            placeholder="0,00"
                            className="w-full rounded-lg border border-border px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                            data-testid="input-cancellation-refund"
                          />
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            Inserisci anche 0. Incassato indicativo:{" "}
                            {formatEurCents(paid)}; il server verifica le fonti
                            realmente rimborsabili.
                          </p>
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                            Nota amministrativa
                          </label>
                          <textarea
                            value={cancellationNote}
                            onChange={(event) =>
                              setCancellationNote(event.target.value)
                            }
                            maxLength={2000}
                            rows={3}
                            className="w-full rounded-lg border border-border px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                            placeholder="Motivazione della decisione e dettagli operativi"
                            data-testid="input-cancellation-note"
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => submitCancellation("approve")}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                          data-testid="button-approve-cancellation"
                        >
                          {isResolvingCancellation ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Ban className="h-3.5 w-3.5" />
                          )}
                          Approva e annulla
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => submitCancellation("reject")}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
                          data-testid="button-reject-cancellation"
                        >
                          Rifiuta richiesta
                        </button>
                      </div>
                    </div>
                  </details>
                )}

                {canOpenAdminCancellation && (
                  <details className="mt-3 rounded-xl border border-border bg-muted/20">
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-foreground">
                      <Ban className="h-4 w-4 text-red-600" />
                      Apri annullamento amministrativo
                    </summary>
                    <div className="space-y-3 border-t border-border/60 px-4 py-4">
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                          Motivo dell'annullamento
                        </label>
                        <textarea
                          value={adminCancellationReason}
                          onChange={(event) =>
                            setAdminCancellationReason(event.target.value)
                          }
                          maxLength={1000}
                          rows={3}
                          className="w-full rounded-lg border border-border px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                          placeholder="Motivo operativo da conservare nello storico"
                          data-testid="input-admin-cancellation-reason"
                        />
                      </div>
                      <button
                        type="button"
                        disabled={busy || !adminCancellationReason.trim()}
                        onClick={submitOpenAdminCancellation}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                        data-testid="button-open-admin-cancellation"
                      >
                        {isOpeningCancellation ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <History className="h-3.5 w-3.5" />
                        )}
                        Apri caso da valutare
                      </button>
                      <p className="text-[11px] text-muted-foreground">
                        L'apertura registra il caso ma non annulla ancora la
                        prenotazione. Importo, penale e rimborso vengono decisi
                        nel passaggio successivo.
                      </p>
                    </div>
                  </details>
                )}
              </div>

              {/* Rimborsi */}
              {(data.refunds ?? []).length > 0 && (
                <div>
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <ReceiptText className="h-3.5 w-3.5" /> Rimborsi
                  </div>
                  <ul className="space-y-2">
                    {(data.refunds ?? []).map((refund) => {
                      const status =
                        REFUND_STATUS_LABELS[refund.status] ??
                        REFUND_STATUS_LABELS.pending;
                      const reference = manualRefundReferences[refund.id] ?? "";
                      return (
                        <li
                          key={refund.id}
                          className="rounded-xl border border-border px-4 py-3 text-xs"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <strong>
                              {formatEurCents(refund.amountCents)}
                            </strong>
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 font-medium ${status.cls}`}
                            >
                              {status.label}
                            </span>
                            <span className="text-muted-foreground">
                              {refund.provider === "manual"
                                ? "Offline"
                                : "Stripe"}
                            </span>
                            <span className="text-muted-foreground">
                              creato {formatDateTime(refund.createdAt)}
                            </span>
                          </div>
                          {(refund.providerReference ||
                            refund.stripeRefundId) && (
                            <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                              Riferimento:{" "}
                              {refund.providerReference ??
                                refund.stripeRefundId}
                            </p>
                          )}
                          {refund.lastErrorMessage &&
                            refund.status !== "succeeded" && (
                              <p className="mt-2 text-red-700">
                                Errore
                                {refund.lastErrorCode
                                  ? ` (${refund.lastErrorCode})`
                                  : ""}
                                : {refund.lastErrorMessage}
                              </p>
                            )}
                          {refund.status === "manual_required" && (
                            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                              <div className="flex-1">
                                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                                  Riferimento del rimborso effettuato
                                </label>
                                <input
                                  type="text"
                                  maxLength={500}
                                  value={reference}
                                  onChange={(event) =>
                                    setManualRefundReferences((current) => ({
                                      ...current,
                                      [refund.id]: event.target.value,
                                    }))
                                  }
                                  placeholder="Es. CRO/TRN, numero ricevuta o movimento cassa"
                                  className="w-full rounded-lg border border-border px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                                  data-testid={`input-manual-refund-reference-${refund.id}`}
                                />
                              </div>
                              <button
                                type="button"
                                disabled={busy || !reference.trim()}
                                onClick={() => {
                                  setActionError(null);
                                  setCompletingRefundId(refund.id);
                                  completeManualRefund({
                                    refundId: refund.id,
                                    data: { reference: reference.trim() },
                                  });
                                }}
                                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                                data-testid={`button-complete-manual-refund-${refund.id}`}
                              >
                                {completingRefundId === refund.id &&
                                isCompletingRefund ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Check className="h-3.5 w-3.5" />
                                )}
                                Registra completamento
                              </button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Partecipanti */}
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Users className="w-3.5 h-3.5" /> Partecipanti
                  </div>
                  {canEditParticipantDetails && !isEditingParticipants && (
                    <button
                      type="button"
                      onClick={startParticipantEdit}
                      className="rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                      data-testid="button-edit-booking-participants"
                    >
                      {data.participantsDetailed
                        ? "Correggi partecipanti"
                        : "Completa dati partecipanti"}
                    </button>
                  )}
                </div>
                {isEditingParticipants ? (
                  <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                    <p className="text-xs text-amber-900">
                      Inserisci esattamente {booking.seats} nominativi. Il
                      salvataggio non modifica posti, importi o pagamenti e
                      conserva ogni snapshot prezzo sulla stessa riga storica,
                      senza ricalcolarlo. Una modifica di tipo o fascia corregge
                      l'anagrafica, non il prezzo già concordato.
                    </p>
                    {!isRident && activePickupPoints.length > 0 && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-foreground">
                          Punto di raccolta comune *
                        </label>
                        <select
                          value={participantCommonPickupId}
                          onChange={(event) =>
                            setParticipantCommonPickupId(event.target.value)
                          }
                          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                          data-testid="select-replace-common-pickup"
                        >
                          <option value="">Seleziona...</option>
                          {activePickupPoints.map((pickupPoint) => (
                            <option key={pickupPoint.id} value={pickupPoint.id}>
                              {pickupPoint.location.name}
                              {pickupPoint.pickupTime
                                ? ` — ore ${pickupPoint.pickupTime}`
                                : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
                      {participantDrafts.map((participant, index) => (
                        <div
                          key={participant.id ?? `new-${index}`}
                          className="space-y-2 rounded-xl border border-border bg-white p-3"
                        >
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <div>
                              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                                Tipo *
                              </label>
                              <select
                                value={participant.type}
                                onChange={(event) =>
                                  setParticipantDrafts((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? {
                                            ...item,
                                            type: event.target
                                              .value as ParticipantEditDraft["type"],
                                            ageRangeId:
                                              event.target.value === "child"
                                                ? item.ageRangeId
                                                : "",
                                          }
                                        : item,
                                    ),
                                  )
                                }
                                className="w-full rounded-lg border border-border px-2.5 py-2 text-sm"
                              >
                                {isRident ? (
                                  <>
                                    <option value="patient">Paziente</option>
                                    <option value="companion">
                                      Accompagnatore
                                    </option>
                                  </>
                                ) : (
                                  <>
                                    <option value="adult">Adulto</option>
                                    <option value="child">Bambino</option>
                                  </>
                                )}
                              </select>
                            </div>
                            <div>
                              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                                Nome *
                              </label>
                              <input
                                type="text"
                                maxLength={100}
                                value={participant.firstName}
                                onChange={(event) =>
                                  setParticipantDrafts((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? {
                                            ...item,
                                            firstName: event.target.value,
                                          }
                                        : item,
                                    ),
                                  )
                                }
                                className="w-full rounded-lg border border-border px-2.5 py-2 text-sm"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                                Cognome *
                              </label>
                              <input
                                type="text"
                                maxLength={100}
                                value={participant.lastName}
                                onChange={(event) =>
                                  setParticipantDrafts((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? {
                                            ...item,
                                            lastName: event.target.value,
                                          }
                                        : item,
                                    ),
                                  )
                                }
                                className="w-full rounded-lg border border-border px-2.5 py-2 text-sm"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {isRident && activePickupPoints.length > 0 && (
                              <div>
                                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                                  Punto di raccolta *
                                </label>
                                <select
                                  value={participant.pickupPointId}
                                  onChange={(event) =>
                                    setParticipantDrafts((current) =>
                                      current.map((item, itemIndex) =>
                                        itemIndex === index
                                          ? {
                                              ...item,
                                              pickupPointId: event.target.value,
                                            }
                                          : item,
                                      ),
                                    )
                                  }
                                  className="w-full rounded-lg border border-border px-2.5 py-2 text-sm"
                                >
                                  <option value="">Seleziona...</option>
                                  {activePickupPoints.map((pickupPoint) => (
                                    <option
                                      key={pickupPoint.id}
                                      value={pickupPoint.id}
                                    >
                                      {pickupPoint.location.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                            {!isRident &&
                              participant.type === "child" &&
                              ageRanges.length > 0 && (
                                <div>
                                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                                    Fascia età *
                                  </label>
                                  <select
                                    value={participant.ageRangeId}
                                    onChange={(event) =>
                                      setParticipantDrafts((current) =>
                                        current.map((item, itemIndex) =>
                                          itemIndex === index
                                            ? {
                                                ...item,
                                                ageRangeId: event.target.value,
                                              }
                                            : item,
                                        ),
                                      )
                                    }
                                    className="w-full rounded-lg border border-border px-2.5 py-2 text-sm"
                                  >
                                    <option value="">Seleziona...</option>
                                    {ageRanges.map((ageRange) => (
                                      <option
                                        key={ageRange.ageRangeId}
                                        value={ageRange.ageRangeId}
                                      >
                                        {ageRange.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setIsEditingParticipants(false)}
                        className="rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
                      >
                        Annulla
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={submitParticipantReplacement}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                        data-testid="button-save-booking-participants"
                      >
                        {isReplacingParticipants && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        )}
                        Salva partecipanti
                      </button>
                    </div>
                  </div>
                ) : !data.participantsDetailed ? (
                  <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    Dati partecipanti non dettagliati (prenotazione precedente):{" "}
                    {booking.adults} adulti
                    {booking.children > 0
                      ? ` + ${booking.children} bambini`
                      : ""}
                    .
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/30 text-xs text-muted-foreground">
                        <tr>
                          <th className="py-2 px-3 text-left font-semibold">
                            Tipo
                          </th>
                          <th className="py-2 px-3 text-left font-semibold">
                            Fascia
                          </th>
                          <th className="py-2 px-3 text-left font-semibold">
                            Raccolta
                          </th>
                          <th className="py-2 px-3 text-right font-semibold">
                            Base storica
                          </th>
                          <th className="py-2 px-3 text-right font-semibold">
                            Suppl. storico
                          </th>
                          <th className="py-2 px-3 text-right font-semibold">
                            Totale storico
                          </th>
                          <th className="py-2 px-3 text-center font-semibold">
                            Dati
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.participants.map((p) => (
                          <tr key={p.id} className="border-t border-border/50">
                            <td className="py-2 px-3">
                              {PARTICIPANT_TYPE_LABELS[p.participantType] ??
                                p.participantType}
                              {(p.firstName || p.lastName) && (
                                <span className="block text-xs text-muted-foreground">
                                  {[p.firstName, p.lastName]
                                    .filter(Boolean)
                                    .join(" ")}
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-muted-foreground">
                              {p.ageRangeLabel ?? "—"}
                            </td>
                            <td className="py-2 px-3 text-muted-foreground">
                              {p.pickupPointName ?? "—"}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {freeBooking
                                ? "Gratis"
                                : participantPricesAvailable
                                  ? formatEurCents(p.basePriceCents)
                                  : "n/d"}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {!freeBooking && !participantPricesAvailable
                                ? "n/d"
                                : p.pickupSurchargeCents !== 0
                                  ? formatEurCents(p.pickupSurchargeCents)
                                  : "—"}
                            </td>
                            <td className="py-2 px-3 text-right font-medium">
                              {freeBooking
                                ? "Gratis"
                                : participantPricesAvailable
                                  ? formatEurCents(p.finalPriceCents)
                                  : "n/d"}
                            </td>
                            <td className="py-2 px-3 text-center">
                              {p.dataCompleted ? (
                                <span className="text-emerald-600 text-xs font-medium">
                                  Completi
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-xs">
                                  Da raccogliere
                                </span>
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
                    Nessun consenso registrato (prenotazione precedente al nuovo
                    sistema).
                  </p>
                ) : (
                  <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {data.consents.map((c) => (
                      <li
                        key={c.id}
                        className="rounded-xl border border-border px-3 py-2.5 text-xs"
                      >
                        <div className="font-medium text-foreground">
                          {CONSENT_LABELS[c.consentType] ?? c.consentType}
                        </div>
                        <div
                          className={
                            c.accepted
                              ? "text-emerald-700"
                              : "text-muted-foreground"
                          }
                        >
                          {c.accepted ? "Accettato" : "Non accettato"}
                          {c.policyVersion ? ` · v${c.policyVersion}` : ""}
                        </div>
                        <div className="text-muted-foreground">
                          {formatDateTime(c.acceptedAt)}
                        </div>
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
                    Nessuna richiesta registrata (prenotazione precedente al
                    nuovo sistema): usa i pulsanti di stato nella tabella
                    prenotazioni.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {data.paymentRequests.map((r) => {
                      const st =
                        REQUEST_STATUS_LABELS[r.status] ??
                        REQUEST_STATUS_LABELS.pending;
                      return (
                        <li
                          key={r.id}
                          className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-4 py-3 text-sm"
                        >
                          <span className="font-medium text-foreground">
                            {REQUEST_TYPE_LABELS[r.type] ?? r.type}
                          </span>
                          <span className="font-semibold">
                            {formatEurCents(r.amountCents)}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}
                          >
                            {st.label}
                          </span>
                          {r.method && (
                            <span className="text-xs text-muted-foreground">
                              {METHOD_LABELS[r.method] ?? r.method}
                            </span>
                          )}
                          {r.deadline && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="w-3 h-3" />{" "}
                              {formatDateTime(r.deadline)}
                            </span>
                          )}
                          {r.graceUntil && (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                              Tolleranza fino al {formatDateTime(r.graceUntil)}
                            </span>
                          )}
                          {r.paidAt && (
                            <span className="text-xs text-emerald-700">
                              pagato il {formatDateTime(r.paidAt)}
                            </span>
                          )}
                          {r.transactionReference && (
                            <span className="text-xs font-mono text-muted-foreground">
                              {r.transactionReference}
                            </span>
                          )}
                          {(r.status === "pending" || r.status === "expired") &&
                            !booking.cancelledAt &&
                            (r.method === "bank_transfer" ||
                              r.method === "office") && (
                              <div className="ml-auto flex w-full flex-col gap-2 sm:w-auto sm:min-w-72">
                                <label
                                  htmlFor={`payment-reference-${r.id}`}
                                  className="text-xs font-medium text-foreground"
                                >
                                  {r.method === "bank_transfer"
                                    ? "CRO / TRN del bonifico"
                                    : "Riferimento ricevuta / cassa"}
                                </label>
                                <div className="flex flex-col gap-2 sm:flex-row">
                                  <input
                                    id={`payment-reference-${r.id}`}
                                    type="text"
                                    maxLength={500}
                                    value={manualPaymentReferences[r.id] ?? ""}
                                    onChange={(event) =>
                                      setManualPaymentReferences((current) => ({
                                        ...current,
                                        [r.id]: event.target.value,
                                      }))
                                    }
                                    placeholder="Riferimento obbligatorio"
                                    className="min-w-0 flex-1 rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs"
                                    data-testid={`input-payment-reference-${r.id}`}
                                  />
                                  <button
                                    type="button"
                                    disabled={
                                      busy ||
                                      !(
                                        manualPaymentReferences[r.id] ?? ""
                                      ).trim()
                                    }
                                    onClick={() => {
                                      const transactionReference = (
                                        manualPaymentReferences[r.id] ?? ""
                                      ).trim();
                                      if (!transactionReference) return;
                                      setActionError(null);
                                      markPaid({
                                        requestId: r.id,
                                        data: { transactionReference },
                                      });
                                    }}
                                    className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                                    data-testid={`button-mark-paid-${r.id}`}
                                  >
                                    <Check className="w-3.5 h-3.5" /> Segna
                                    pagato
                                  </button>
                                </div>
                              </div>
                            )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Stato tecnico di incassi e cleanup Stripe */}
              {((data.paymentAttempts ?? []).length > 0 ||
                (data.cleanupJobs ?? []).length > 0) && (
                <details className="rounded-xl border border-border bg-muted/10">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Wrench className="h-3.5 w-3.5" /> Stato tecnico pagamenti
                  </summary>
                  <div className="space-y-4 border-t border-border/60 px-4 py-4 text-xs">
                    {(data.paymentAttempts ?? []).length > 0 && (
                      <div>
                        <div className="mb-2 font-semibold text-foreground">
                          Tentativi di incasso
                        </div>
                        <ul className="space-y-2">
                          {(data.paymentAttempts ?? []).map((attempt) => (
                            <li
                              key={attempt.id}
                              className="rounded-lg border border-border/70 px-3 py-2"
                            >
                              <div className="flex flex-wrap gap-x-3 gap-y-1">
                                <strong>
                                  {formatEurCents(attempt.amountCents)}
                                </strong>
                                <span>
                                  {TECHNICAL_STATUS_LABELS[attempt.status] ??
                                    attempt.status}
                                </span>
                                <span className="text-muted-foreground">
                                  {attempt.provider} ·{" "}
                                  {formatDateTime(attempt.createdAt)}
                                </span>
                              </div>
                              {attempt.lastErrorMessage && (
                                <p className="mt-1 text-red-700">
                                  {attempt.lastErrorCode
                                    ? `${attempt.lastErrorCode}: `
                                    : ""}
                                  {attempt.lastErrorMessage}
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {(data.cleanupJobs ?? []).length > 0 && (
                      <div>
                        <div className="mb-2 font-semibold text-foreground">
                          Operazioni compensative Stripe
                        </div>
                        <ul className="space-y-2">
                          {(data.cleanupJobs ?? []).map((job) => (
                            <li
                              key={job.id}
                              className="rounded-lg border border-border/70 px-3 py-2"
                            >
                              <div className="flex flex-wrap gap-x-3 gap-y-1">
                                <strong>{job.operation}</strong>
                                <span>
                                  {TECHNICAL_STATUS_LABELS[job.status] ??
                                    job.status}
                                </span>
                                <span className="text-muted-foreground">
                                  tentativi {job.attemptCount}/{job.maxAttempts}
                                </span>
                              </div>
                              <div className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                                {job.stripeResourceId}
                              </div>
                              {job.manualCompletionReference && (
                                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                                  Chiusura manuale:{" "}
                                  {job.manualCompletionReference}
                                </p>
                              )}
                              {job.lastErrorMessage && (
                                <p className="mt-1 text-red-700">
                                  {job.lastErrorCode
                                    ? `${job.lastErrorCode}: `
                                    : ""}
                                  {job.lastErrorMessage}
                                </p>
                              )}
                              {job.status === "manual_required" && (
                                <div className="mt-3 space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
                                  <p className="font-semibold text-red-800">
                                    Verifica prima nella dashboard Stripe che la
                                    risorsa sia davvero chiusa. Questo comando
                                    registra l'esito: non esegue operazioni su
                                    Stripe.
                                  </p>
                                  <div className="flex flex-col gap-2 sm:flex-row">
                                    <input
                                      type="text"
                                      maxLength={500}
                                      value={
                                        manualCleanupReferences[job.id] ?? ""
                                      }
                                      onChange={(event) =>
                                        setManualCleanupReferences(
                                          (current) => ({
                                            ...current,
                                            [job.id]: event.target.value,
                                          }),
                                        )
                                      }
                                      placeholder="Riferimento verifica Stripe"
                                      className="min-w-0 flex-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs"
                                      data-testid={`input-cleanup-reference-${job.id}`}
                                    />
                                    <button
                                      type="button"
                                      disabled={
                                        busy ||
                                        !(
                                          manualCleanupReferences[job.id] ?? ""
                                        ).trim()
                                      }
                                      onClick={() => {
                                        const reference = (
                                          manualCleanupReferences[job.id] ?? ""
                                        ).trim();
                                        if (!reference) return;
                                        if (
                                          !window.confirm(
                                            "Hai verificato nella dashboard Stripe che questa operazione sia già conclusa? Il comando chiuderà soltanto il ledger interno.",
                                          )
                                        )
                                          return;
                                        setActionError(null);
                                        setCompletingCleanupId(job.id);
                                        completeManualCleanup({
                                          jobId: job.id,
                                          data: { reference },
                                        });
                                      }}
                                      className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg bg-red-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-50"
                                      data-testid={`button-complete-cleanup-${job.id}`}
                                    >
                                      {completingCleanupId === job.id ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Check className="h-3.5 w-3.5" />
                                      )}
                                      Chiudi dopo verifica su Stripe
                                    </button>
                                  </div>
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </details>
              )}

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
                        onClick={() => {
                          setActionError(null);
                          requestBalance({ bookingId });
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
                        data-testid="button-request-balance"
                      >
                        {isRequesting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CreditCard className="w-3.5 h-3.5" />
                        )}
                        Richiedi saldo (
                        {residual !== null ? formatEurCents(residual) : ""})
                      </button>
                    )}
                    {deadlineTarget ? (
                      <div className="rounded-xl border border-border bg-white p-3">
                        <p className="mb-2 text-[11px] text-muted-foreground">
                          Stai modificando soltanto l'obbligazione attiva più
                          recente:{" "}
                          {REQUEST_TYPE_LABELS[deadlineTarget.type] ??
                            deadlineTarget.type}{" "}
                          ({formatEurCents(deadlineTarget.amountCents)}).
                          {deadlineTarget.deadline
                            ? ` Scadenza attuale: ${formatDateTime(deadlineTarget.deadline)}.`
                            : ""}
                          {deadlineTarget.graceUntil
                            ? ` Tolleranza attuale fino al ${formatDateTime(deadlineTarget.graceUntil)}.`
                            : ""}
                        </p>
                        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end">
                          <div>
                            <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                              Nuova scadenza pagamento
                            </label>
                            <input
                              type="datetime-local"
                              value={deadlineInput}
                              onChange={(e) => setDeadlineInput(e.target.value)}
                              className="w-full px-3 py-1.5 border border-border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                              data-testid="input-new-deadline"
                            />
                          </div>
                          <button
                            type="button"
                            disabled={busy || !deadlineInput}
                            onClick={() => {
                              setActionError(null);
                              updateDeadline({
                                bookingId,
                                data: {
                                  paymentRequestId: deadlineTarget.id,
                                  deadline: new Date(
                                    deadlineInput,
                                  ).toISOString(),
                                },
                              });
                            }}
                            className="inline-flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-white border border-border text-foreground hover:bg-muted disabled:opacity-50"
                            data-testid="button-extend-deadline"
                          >
                            {isExtending ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <CalendarClock className="w-3.5 h-3.5" />
                            )}
                            Aggiorna scadenza
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        Nessuna richiesta pendente o scaduta è prorogabile.
                      </p>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Una proroga riattiva soltanto la richiesta selezionata e può
                    riacquisire i posti se ancora disponibili. La nuova
                    tolleranza viene ricalcolata e non supera mai la partenza.
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
