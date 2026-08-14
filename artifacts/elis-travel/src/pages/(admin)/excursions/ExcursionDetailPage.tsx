import { Link, useLocation } from "wouter";
import { useState } from "react";
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Users,
  Bus,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  CreditCard,
  Trash2,
  Copy,
  Plus,
  Pencil,
  X,
  Loader2,
  RotateCcw,
  CheckCheck,
  Printer,
  FileText,
  ExternalLink,
  Link2,
} from "lucide-react";
import { ExcursionFormModal } from "@/components/admin/ExcursionFormModal";
import { BookingDetailsModal } from "@/components/admin/BookingDetailsModal";
import {
  useGetExcursion,
  useUpdateExcursion,
  useDeleteExcursion,
  useDeleteExcursionBooking,
  useAddExcursionBooking,
  useListExcursionAgePrices,
  useListExcursionPickupPoints,
  useCancelExcursionTrip,
  useCompleteExcursionTrip,
  useConfirmTrip,
  useExpireOverdueBookings,
  getExcursionPickupReport,
  getGetExcursionQueryKey,
  getListExcursionsQueryKey,
} from "@workspace/api-client-react";
import type {
  Booking,
  ExcursionAgePriceRow,
  ExcursionPickupPoint,
  ManualBookingParticipantInput,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CoverImageUploader } from "@/components/shared/CoverImageUploader";
import { buildSlugUrl } from "@/lib/seo";
import { formatDepartureInRome } from "@/lib/excursion-time";
import {
  PARTICIPANT_NAME_MAX_LENGTH,
  emptyParticipantName,
  resizeParticipantNames,
  syncUntouchedPrimaryParticipantName,
  updateParticipantName,
  type ParticipantNameDraft,
} from "@/lib/booking-participants";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: "Bozza", className: "bg-muted text-muted-foreground" },
  open: { label: "Aperta", className: "bg-sky-100 text-sky-700" },
  confirmed: { label: "Confermata", className: "bg-primary/10 text-primary" },
  completed: {
    label: "Completata",
    className: "bg-emerald-100 text-emerald-700",
  },
  cancelled: {
    label: "Annullata",
    className: "bg-destructive/10 text-destructive",
  },
};

const PAYMENT_STATUS_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; className: string; rowCls?: string }
> = {
  pending: {
    label: "In attesa",
    icon: Clock,
    className: "text-muted-foreground",
  },
  pending_card: {
    label: "Carta in attesa",
    icon: Clock,
    className: "text-amber-600",
  },
  card_setup_pending: {
    label: "Carta da salvare",
    icon: Clock,
    className: "text-amber-600",
  },
  deposit_requested: {
    label: "Richiesta acconto",
    icon: Clock,
    className: "text-amber-600",
  },
  deposit: { label: "Acconto", icon: CreditCard, className: "text-accent" },
  card_saved: {
    label: "Carta salvata",
    icon: CreditCard,
    className: "text-sky-600",
  },
  full_requested: {
    label: "Richiesta totale",
    icon: Clock,
    className: "text-amber-600",
  },
  paid: { label: "Saldato", icon: CheckCircle, className: "text-primary" },
  charge_failed: {
    label: "Addebito fallito",
    icon: AlertCircle,
    className: "text-red-600",
    rowCls: "bg-red-50/60",
  },
  charge_skipped: {
    label: "Nessun addebito",
    icon: RotateCcw,
    className: "text-slate-400",
  },
  refunded: {
    label: "Rimborsato",
    icon: RotateCcw,
    className: "text-slate-500",
  },
  partially_refunded: {
    label: "Rimborso parziale",
    icon: RotateCcw,
    className: "text-amber-700",
  },
  balance_requested: {
    label: "Saldo richiesto",
    icon: Clock,
    className: "text-amber-600",
  },
  expired: {
    label: "Scaduto",
    icon: AlertCircle,
    className: "text-red-600",
    rowCls: "bg-red-50/40",
  },
};

function formatEur(n: number) {
  return n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

function parseEurCents(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [euros, decimals = ""] = normalized.split(".");
  const cents = Number(euros) * 100 + Number(decimals.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

function resizeStringValues(values: string[], count: number): string[] {
  return Array.from({ length: count }, (_, index) => values[index] ?? "");
}

function CopyLinkRow({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard non disponibile */
    }
  };
  return (
    <div>
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
        {label}
      </p>
      <div className="flex items-center gap-2">
        <div
          className="flex-1 min-w-0 truncate text-sm text-foreground font-mono bg-muted/40 border border-border rounded-lg px-3 py-2"
          title={url}
        >
          {url}
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 shrink-0 text-xs font-medium px-3 py-2 rounded-xl bg-white border border-border text-foreground hover:bg-muted transition-colors"
          title="Apri in una nuova scheda"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Apri
        </a>
        <button
          type="button"
          onClick={copy}
          className={`inline-flex items-center gap-1.5 shrink-0 text-xs font-medium px-3 py-2 rounded-xl border transition-colors ${
            copied
              ? "bg-primary/10 border-primary/20 text-primary"
              : "bg-white border-border text-foreground hover:bg-muted"
          }`}
        >
          {copied ? (
            <>
              <CheckCheck className="w-3.5 h-3.5" />
              Copiato
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              Copia
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// Box link condivisibile: mostrato per le gite Rident, con il link diretto alla
// pagina pubblica della gita, comodo da condividere direttamente.
function RidentLinksBox({
  excursionId,
  excursionName,
}: {
  excursionId: string;
  excursionName: string;
}) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const excursionUrl = `${origin}${buildSlugUrl("gite", excursionId, excursionName)}`;
  return (
    <div className="bg-gradient-to-b from-primary/[0.06] to-transparent border border-border rounded-3xl p-4 md:p-5 shadow-sm space-y-4">
      <div className="px-1">
        <div className="flex items-center gap-2 text-primary mb-1">
          <Link2 className="w-4 h-4" />
          <span className="text-xs font-semibold uppercase tracking-wide">
            Gita Rident
          </span>
        </div>
        <h2 className="text-lg font-bold text-foreground">
          Link da condividere
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Link diretto a questa gita, comodo da condividere. La gita è comunque
          visibile nella pagina Rident del sito.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-border p-4 md:p-5 space-y-4">
        <CopyLinkRow label="Link diretto di questa gita" url={excursionUrl} />
      </div>
    </div>
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatExcursionDeparture(
  departureAt: string | null | undefined,
  legacyDate: string,
) {
  return (
    formatDepartureInRome(departureAt) ??
    `${formatDate(legacyDate)} · orario da impostare`
  );
}

function formatDateTime(dtStr: string) {
  const d = new Date(dtStr);
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTimeFull(dtStr: string) {
  const d = new Date(dtStr);
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function AvatarInitials({ name }: { name: string }) {
  const colors = [
    "bg-blue-100 text-blue-700",
    "bg-emerald-100 text-emerald-700",
    "bg-purple-100 text-purple-700",
    "bg-amber-100 text-amber-700",
    "bg-rose-100 text-rose-700",
  ];
  const idx = name.charCodeAt(0) % colors.length;
  return (
    <div
      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${colors[idx]}`}
    >
      {getInitials(name)}
    </div>
  );
}

function BookingRow({
  booking,
  excursionId,
  pickupPointName,
  onOpenDetails,
}: {
  booking: Booking;
  excursionId: string;
  pickupPointName?: string | null;
  onOpenDetails: (bookingId: string) => void;
}) {
  const queryClient = useQueryClient();
  const paymentCfg =
    PAYMENT_STATUS_CONFIG[booking.paymentStatus] ??
    PAYMENT_STATUS_CONFIG["pending"];
  const PayIcon = paymentCfg.icon;
  const isChargeFailed = booking.paymentStatus === "charge_failed";

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: getGetExcursionQueryKey(excursionId),
    });
    void queryClient.invalidateQueries({
      queryKey: getListExcursionsQueryKey(),
    });
  };

  const { mutateAsync: deleteBooking, isPending: isDeleting } =
    useDeleteExcursionBooking({
      mutation: { onSuccess: invalidate },
    });

  const remove = async () => {
    if (
      !window.confirm(`Eliminare la prenotazione di ${booking.customerName}?`)
    )
      return;
    try {
      await deleteBooking({ id: excursionId, bookingId: booking.id });
    } catch (e) {
      console.error(e);
      alert("Impossibile eliminare la prenotazione.");
    }
  };

  const busy = isDeleting;
  const isCancelled = !!booking.cancelledAt;
  const hasReleasedSeats = booking.seatStatus === "released";
  const isOperationallyInactive = isCancelled || hasReleasedSeats;

  return (
    <tr
      className={`border-b border-border/50 transition-colors ${
        isOperationallyInactive
          ? "bg-gray-50/80 opacity-70"
          : isChargeFailed
            ? `${paymentCfg.rowCls ?? ""} hover:brightness-95`
            : "hover:bg-muted/20"
      }`}
      data-testid={`booking-row-${booking.id}`}
    >
      <td className="py-2.5 pl-4 pr-2">
        <div className="flex items-center gap-2">
          <AvatarInitials name={booking.customerName} />
          <div className="min-w-0">
            <div
              className={`font-medium text-sm truncate ${isCancelled ? "line-through text-muted-foreground" : "text-foreground"}`}
            >
              {booking.customerName}
              {booking.bookingCode && (
                <span className="ml-1.5 font-mono text-[10px] text-primary/80">
                  {booking.bookingCode}
                </span>
              )}
            </div>
            {booking.email && (
              <div
                className="text-xs text-muted-foreground truncate"
                data-testid={`text-booking-email-${booking.id}`}
              >
                {booking.email}
              </div>
            )}
            {booking.totalAmountCents != null && (
              <div className="text-xs text-muted-foreground mt-0.5">
                {formatEur((booking.amountPaidCents ?? 0) / 100)} /{" "}
                {formatEur(booking.totalAmountCents / 100)}
                {booking.paymentDeadline &&
                  !["paid", "refunded"].includes(booking.paymentStatus) && (
                    <span
                      className={
                        new Date(booking.paymentDeadline) < new Date()
                          ? "ml-1.5 text-red-600 font-medium"
                          : "ml-1.5"
                      }
                    >
                      · scad. {formatDateTime(booking.paymentDeadline)}
                    </span>
                  )}
              </div>
            )}
            {pickupPointName && (
              <div
                className="text-xs text-primary mt-0.5 flex items-center gap-1 truncate"
                title={`Punto di raccolta: ${pickupPointName}`}
              >
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">{pickupPointName}</span>
              </div>
            )}
            {isCancelled && booking.cancelledAt && (
              <div className="text-xs text-red-500 mt-0.5">
                Annullata il {formatDateTimeFull(booking.cancelledAt)}
              </div>
            )}
            {!isCancelled && hasReleasedSeats && (
              <div className="text-xs text-amber-700 mt-0.5">
                Posti rilasciati: prenotazione esclusa dall'operatività
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="py-2.5 px-2 text-center">
        <div className="inline-flex flex-col items-center gap-1">
          <span
            className="inline-flex items-center gap-1 text-sm text-muted-foreground"
            title={`${booking.adults} adult${booking.adults === 1 ? "o" : "i"}${booking.children > 0 ? ` + ${booking.children} bambin${booking.children === 1 ? "o" : "i"}` : ""}`}
          >
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            {booking.children > 0
              ? `${booking.adults}A+${booking.children}B`
              : booking.adults}
          </span>
          {booking.servizioCasa && (
            <span
              className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700"
              title={
                booking.homePickupAddress?.trim() ||
                "Servizio sotto casa richiesto, indirizzo non registrato"
              }
            >
              🏠 Casa
            </span>
          )}
        </div>
      </td>
      <td className="py-2.5 px-2">
        {isCancelled ? (
          <span
            className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700"
            data-testid={`badge-cancelled-${booking.id}`}
          >
            Annullata
          </span>
        ) : hasReleasedSeats ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
            Posti rilasciati
          </span>
        ) : (
          <span
            className={`inline-flex items-center gap-1 text-xs font-medium ${paymentCfg.className}`}
          >
            <PayIcon className="w-3.5 h-3.5" />
            {paymentCfg.label}
          </span>
        )}
      </td>
      <td className="py-2.5 px-2 text-sm text-muted-foreground">
        {formatDateTime(booking.bookedAt)}
      </td>
      <td className="py-2.5 pr-4 pl-2 text-right">
        <div className="inline-flex items-center gap-1 flex-wrap justify-end">
          <button
            type="button"
            onClick={() => onOpenDetails(booking.id)}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium bg-muted text-foreground hover:bg-muted/70 transition-colors"
            data-testid={`button-details-${booking.id}`}
            title="Dettaglio prenotazione: partecipanti, consensi, pagamenti"
          >
            Dettagli
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md text-red-600 hover:bg-red-50 disabled:opacity-50"
            data-testid={`button-delete-${booking.id}`}
            title="Elimina prenotazione"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function AddParticipantModal({
  excursionId,
  isRident,
  excursionStatus,
  departureAt,
  pickupPoints,
  ageRanges,
  onClose,
}: {
  excursionId: string;
  isRident: boolean;
  excursionStatus: string;
  departureAt: string | null | undefined;
  pickupPoints: ExcursionPickupPoint[];
  ageRanges: ExcursionAgePriceRow[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [clientCommandId] = useState(() => crypto.randomUUID());
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sendCustomerEmail, setSendCustomerEmail] = useState(false);
  const [primaryCount, setPrimaryCount] = useState(1);
  const [secondaryCount, setSecondaryCount] = useState(0);
  const [primaryNames, setPrimaryNames] = useState<ParticipantNameDraft[]>([
    emptyParticipantName(),
  ]);
  const [secondaryNames, setSecondaryNames] = useState<ParticipantNameDraft[]>(
    [],
  );
  const [paymentStatus, setPaymentStatus] = useState<
    "deposit_requested" | "full_requested" | "deposit" | "paid"
  >(excursionStatus === "confirmed" ? "full_requested" : "deposit_requested");
  const [totalAmount, setTotalAmount] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<
    "bank_transfer" | "office"
  >("bank_transfer");
  const [paymentDeadline, setPaymentDeadline] = useState("");
  const [transactionReference, setTransactionReference] = useState("");
  const [commonPickupPointId, setCommonPickupPointId] = useState("");
  const [primaryPickupPointIds, setPrimaryPickupPointIds] = useState<string[]>([
    "",
  ]);
  const [secondaryPickupPointIds, setSecondaryPickupPointIds] = useState<
    string[]
  >([]);
  const [secondaryAgeRangeIds, setSecondaryAgeRangeIds] = useState<string[]>(
    [],
  );
  const [servizioCasa, setServizioCasa] = useState(false);
  const [homePickupAddress, setHomePickupAddress] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const primaryType = isRident ? "patient" : "adult";
  const secondaryType = isRident ? "companion" : "child";
  const primaryLabel = isRident ? "Pazienti" : "Adulti";
  const secondaryLabel = isRident ? "Accompagnatori" : "Bambini";
  const primarySingular = isRident ? "Paziente" : "Adulto";
  const secondarySingular = isRident ? "Accompagnatore" : "Bambino";
  const activePickupPoints = pickupPoints.filter(
    (pickupPoint) =>
      (
        pickupPoint.location as typeof pickupPoint.location & {
          active?: boolean;
        }
      ).active !== false,
  );
  const parsedTotalAmountCents = parseEurCents(totalAmount);
  const isFreeBooking = parsedTotalAmountCents === 0;
  const effectivePaymentStatus = isFreeBooking ? "paid" : paymentStatus;
  const isDepositPayment =
    effectivePaymentStatus === "deposit_requested" ||
    effectivePaymentStatus === "deposit";
  const isRequestedPayment =
    effectivePaymentStatus === "deposit_requested" ||
    effectivePaymentStatus === "full_requested";
  const isPaidPayment =
    effectivePaymentStatus === "deposit" || effectivePaymentStatus === "paid";
  const inputClass =
    "w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary";

  const { mutateAsync, isPending } = useAddExcursionBooking({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: getGetExcursionQueryKey(excursionId),
        });
        void queryClient.invalidateQueries({
          queryKey: getListExcursionsQueryKey(),
        });
      },
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!firstName.trim() || !lastName.trim()) {
      setErrorMsg("Nome e cognome del referente sono obbligatori.");
      return;
    }
    const participants: ManualBookingParticipantInput[] = [
      ...primaryNames.slice(0, primaryCount).map((participant, index) => ({
        type: primaryType as ManualBookingParticipantInput["type"],
        firstName: participant.firstName.trim(),
        lastName: participant.lastName.trim(),
        pickupPointId: isRident ? primaryPickupPointIds[index] || null : null,
      })),
      ...secondaryNames.slice(0, secondaryCount).map((participant, index) => ({
        type: secondaryType as ManualBookingParticipantInput["type"],
        firstName: participant.firstName.trim(),
        lastName: participant.lastName.trim(),
        pickupPointId: isRident ? secondaryPickupPointIds[index] || null : null,
        ageRangeId: !isRident ? secondaryAgeRangeIds[index] || null : null,
      })),
    ];
    const incompleteIndex = participants.findIndex(
      (participant) => !participant.firstName || !participant.lastName,
    );
    if (incompleteIndex >= 0) {
      setErrorMsg(
        `Inserisci nome e cognome per il partecipante ${incompleteIndex + 1}.`,
      );
      return;
    }
    if (participants.length > 100) {
      setErrorMsg("Massimo 100 partecipanti per prenotazione manuale.");
      return;
    }
    if (
      activePickupPoints.length > 0 &&
      (isRident
        ? participants.some((participant) => !participant.pickupPointId)
        : !commonPickupPointId)
    ) {
      setErrorMsg(
        isRident
          ? "Seleziona il punto di raccolta di ogni partecipante."
          : "Seleziona il punto di raccolta comune.",
      );
      return;
    }
    if (
      !isRident &&
      ageRanges.length > 0 &&
      secondaryAgeRangeIds.slice(0, secondaryCount).some((id) => !id)
    ) {
      setErrorMsg("Seleziona la fascia età di ogni bambino.");
      return;
    }
    if (sendCustomerEmail && !email.trim()) {
      setErrorMsg(
        "Inserisci l'indirizzo email oppure disattiva l'invio automatico al cliente.",
      );
      return;
    }
    const totalAmountCents = parsedTotalAmountCents;
    if (totalAmountCents === null) {
      setErrorMsg("Inserisci un totale valido, anche pari a zero.");
      return;
    }
    const requestedAmountCents = isFreeBooking
      ? 0
      : isDepositPayment
        ? parseEurCents(paymentAmount)
        : totalAmountCents;
    if (
      requestedAmountCents === null ||
      (!isFreeBooking && requestedAmountCents <= 0)
    ) {
      setErrorMsg(
        "Inserisci un importo di pagamento valido e maggiore di zero.",
      );
      return;
    }
    if (isDepositPayment && requestedAmountCents >= totalAmountCents) {
      setErrorMsg("L'acconto deve essere inferiore al totale.");
      return;
    }
    let paymentDeadlineIso: string | null = null;
    if (isRequestedPayment) {
      const parsedDeadline = paymentDeadline ? new Date(paymentDeadline) : null;
      if (!parsedDeadline || !Number.isFinite(parsedDeadline.getTime())) {
        setErrorMsg("Inserisci una scadenza valida per il pagamento.");
        return;
      }
      if (departureAt && parsedDeadline >= new Date(departureAt)) {
        setErrorMsg("La scadenza deve precedere la partenza della gita.");
        return;
      }
      paymentDeadlineIso = parsedDeadline.toISOString();
    }
    if (isPaidPayment && !isFreeBooking && !transactionReference.trim()) {
      setErrorMsg(
        paymentMethod === "bank_transfer"
          ? "Inserisci CRO o TRN del bonifico."
          : "Inserisci il riferimento della ricevuta o della cassa.",
      );
      return;
    }
    if (servizioCasa && !homePickupAddress.trim()) {
      setErrorMsg("Inserisci l'indirizzo completo per il servizio sotto casa.");
      return;
    }
    try {
      await mutateAsync({
        id: excursionId,
        data: {
          clientCommandId,
          customerName: `${firstName.trim()} ${lastName.trim()}`,
          email: email.trim() || null,
          phone: phone.trim() || null,
          sendCustomerEmail,
          participants,
          paymentStatus: effectivePaymentStatus,
          totalAmountCents,
          paymentAmountCents: requestedAmountCents,
          paymentMethod: isFreeBooking ? null : paymentMethod,
          paymentDeadline: paymentDeadlineIso,
          transactionReference:
            isPaidPayment && !isFreeBooking
              ? transactionReference.trim()
              : null,
          pickupPointId: isRident ? null : commonPickupPointId || null,
          servizioCasa,
          homePickupAddress: servizioCasa ? homePickupAddress.trim() : null,
        },
      });
      onClose();
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string };
      setErrorMsg(
        e?.data?.error ??
          e?.message ??
          "Impossibile aggiungere la prenotazione.",
      );
    }
  };

  const setPrimaryParticipantsCount = (count: number) => {
    const next = Math.max(1, Math.min(100 - secondaryCount, count));
    setPrimaryCount(next);
    setPrimaryNames((previous) => resizeParticipantNames(previous, next));
    setPrimaryPickupPointIds((previous) => resizeStringValues(previous, next));
  };

  const setSecondaryParticipantsCount = (count: number) => {
    const next = Math.max(0, Math.min(100 - primaryCount, count));
    setSecondaryCount(next);
    setSecondaryNames((previous) => resizeParticipantNames(previous, next));
    setSecondaryPickupPointIds((previous) =>
      resizeStringValues(previous, next),
    );
    setSecondaryAgeRangeIds((previous) => resizeStringValues(previous, next));
  };

  const participantNameFields = (
    participant: ParticipantNameDraft,
    index: number,
    kind: "primary" | "secondary",
  ) => {
    const setNames = kind === "primary" ? setPrimaryNames : setSecondaryNames;
    const idPrefix = `manual-${kind}-${index}`;
    const participantLabel =
      kind === "primary" ? primarySingular : secondarySingular;
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <input
          id={`${idPrefix}-first-name`}
          type="text"
          required
          maxLength={PARTICIPANT_NAME_MAX_LENGTH}
          value={participant.firstName}
          onChange={(event) =>
            setNames((previous) =>
              updateParticipantName(
                previous,
                index,
                "firstName",
                event.target.value,
              ),
            )
          }
          placeholder="Nome"
          aria-label={`${participantLabel} ${index + 1}, nome`}
          className={inputClass}
          data-testid={`input-${idPrefix}-first-name`}
        />
        <input
          id={`${idPrefix}-last-name`}
          type="text"
          required
          maxLength={PARTICIPANT_NAME_MAX_LENGTH}
          value={participant.lastName}
          onChange={(event) =>
            setNames((previous) =>
              updateParticipantName(
                previous,
                index,
                "lastName",
                event.target.value,
              ),
            )
          }
          placeholder="Cognome"
          aria-label={`${participantLabel} ${index + 1}, cognome`}
          className={inputClass}
          data-testid={`input-${idPrefix}-last-name`}
        />
      </div>
    );
  };

  const participantAssignmentFields = (
    index: number,
    kind: "primary" | "secondary",
  ) => {
    const pickupIds =
      kind === "primary" ? primaryPickupPointIds : secondaryPickupPointIds;
    const setPickupIds =
      kind === "primary"
        ? setPrimaryPickupPointIds
        : setSecondaryPickupPointIds;
    return (
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {isRident && activePickupPoints.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">
              Punto di raccolta *
            </label>
            <select
              required
              value={pickupIds[index] ?? ""}
              onChange={(event) =>
                setPickupIds((previous) => {
                  const next = [...previous];
                  next[index] = event.target.value;
                  return next;
                })
              }
              className={inputClass}
              data-testid={`select-manual-${kind}-${index}-pickup`}
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
        {!isRident && kind === "secondary" && ageRanges.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">
              Fascia età *
            </label>
            <select
              required
              value={secondaryAgeRangeIds[index] ?? ""}
              onChange={(event) =>
                setSecondaryAgeRangeIds((previous) => {
                  const next = [...previous];
                  next[index] = event.target.value;
                  return next;
                })
              }
              className={inputClass}
              data-testid={`select-manual-child-${index}-age-range`}
            >
              <option value="">Seleziona...</option>
              {ageRanges.map((ageRange) => (
                <option key={ageRange.ageRangeId} value={ageRange.ageRangeId}>
                  {ageRange.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto"
      data-testid="modal-add-participant"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 my-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-foreground">
            Aggiungi prenotazione manuale
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted/50"
            data-testid="button-close-modal"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          I posti vengono riservati subito. Inserisci tutti i nominativi:
          saranno usati nella lista operativa della gita.
        </p>
        <form onSubmit={handleSubmit} className="space-y-5">
          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Referente
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Nome *
                </label>
                <input
                  type="text"
                  required
                  maxLength={PARTICIPANT_NAME_MAX_LENGTH}
                  value={firstName}
                  onChange={(event) => {
                    setFirstName(event.target.value);
                    setPrimaryNames((previous) =>
                      syncUntouchedPrimaryParticipantName(
                        previous,
                        "firstName",
                        event.target.value,
                      ),
                    );
                  }}
                  className={inputClass}
                  data-testid="input-add-first-name"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Cognome *
                </label>
                <input
                  type="text"
                  required
                  maxLength={PARTICIPANT_NAME_MAX_LENGTH}
                  value={lastName}
                  onChange={(event) => {
                    setLastName(event.target.value);
                    setPrimaryNames((previous) =>
                      syncUntouchedPrimaryParticipantName(
                        previous,
                        "lastName",
                        event.target.value,
                      ),
                    );
                  }}
                  className={inputClass}
                  data-testid="input-add-last-name"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={inputClass}
                  data-testid="input-add-email"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Telefono
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className={inputClass}
                  data-testid="input-add-phone"
                />
              </div>
              <label className="sm:col-span-2 flex items-start gap-2 rounded-lg border border-border bg-muted/20 p-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sendCustomerEmail}
                  onChange={(event) =>
                    setSendCustomerEmail(event.target.checked)
                  }
                  className="mt-0.5 h-4 w-4 accent-accent"
                  data-testid="checkbox-add-send-customer-email"
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">
                    Abilita le comunicazioni cliente per questa prenotazione
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                    Disattiva per impostazione predefinita. Comprende istruzioni
                    di pagamento, conferma gita, saldo e comunicazioni di
                    annullamento; i promemoria automatici restano globalmente
                    disattivati salvo futura attivazione. L'amministrazione
                    riceve comunque la propria notifica.
                  </span>
                </span>
              </label>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Partecipanti
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  {primaryLabel} *
                </label>
                <input
                  type="number"
                  min={1}
                  max={100 - secondaryCount}
                  required
                  value={primaryCount}
                  onChange={(event) =>
                    setPrimaryParticipantsCount(Number(event.target.value) || 1)
                  }
                  className={inputClass}
                  data-testid="input-add-adults"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  {secondaryLabel}
                </label>
                <input
                  type="number"
                  min={0}
                  max={100 - primaryCount}
                  value={secondaryCount}
                  onChange={(event) =>
                    setSecondaryParticipantsCount(
                      Number(event.target.value) || 0,
                    )
                  }
                  className={inputClass}
                  data-testid="input-add-children"
                />
              </div>
            </div>

            {!isRident && activePickupPoints.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Punto di raccolta comune *
                </label>
                <select
                  required
                  value={commonPickupPointId}
                  onChange={(event) =>
                    setCommonPickupPointId(event.target.value)
                  }
                  className={inputClass}
                  data-testid="select-manual-common-pickup"
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

            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {primaryNames.slice(0, primaryCount).map((participant, index) => (
                <div
                  key={`primary-${index}`}
                  className="rounded-xl border border-border bg-muted/20 p-3 space-y-2"
                >
                  <div className="text-xs font-medium text-muted-foreground">
                    {primarySingular} {index + 1}
                  </div>
                  {participantNameFields(participant, index, "primary")}
                  {participantAssignmentFields(index, "primary")}
                </div>
              ))}
              {secondaryNames
                .slice(0, secondaryCount)
                .map((participant, index) => (
                  <div
                    key={`secondary-${index}`}
                    className="rounded-xl border border-border bg-muted/20 p-3 space-y-2"
                  >
                    <div className="text-xs font-medium text-muted-foreground">
                      {secondarySingular} {index + 1}
                    </div>
                    {participantNameFields(participant, index, "secondary")}
                    {participantAssignmentFields(index, "secondary")}
                  </div>
                ))}
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-border bg-muted/10 p-4">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Situazione economica reale
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                La procedura crea una richiesta di pagamento vera. Un incasso
                già avvenuto richiede sempre il riferimento del bonifico o della
                ricevuta. Con totale € 0 la prenotazione viene invece confermata
                come gratuita, senza movimento di pagamento.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Operazione *
                </label>
                <select
                  value={effectivePaymentStatus}
                  disabled={isFreeBooking}
                  onChange={(event) =>
                    setPaymentStatus(event.target.value as typeof paymentStatus)
                  }
                  className={inputClass}
                  data-testid="select-add-payment"
                >
                  {excursionStatus !== "confirmed" && (
                    <>
                      <option value="deposit_requested">
                        Acconto da richiedere
                      </option>
                      <option value="deposit">Acconto già incassato</option>
                    </>
                  )}
                  <option value="full_requested">Totale da richiedere</option>
                  <option value="paid">Totale già incassato</option>
                </select>
              </div>
              {!isFreeBooking && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    Metodo offline *
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(event) =>
                      setPaymentMethod(
                        event.target.value as typeof paymentMethod,
                      )
                    }
                    className={inputClass}
                    data-testid="select-add-payment-method"
                  >
                    <option value="bank_transfer">Bonifico</option>
                    <option value="office">Pagamento in ufficio</option>
                  </select>
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Totale prenotazione (€) *
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={totalAmount}
                  onChange={(event) => setTotalAmount(event.target.value)}
                  placeholder="es. 250,00"
                  className={inputClass}
                  data-testid="input-add-total-amount"
                />
              </div>
              {isFreeBooking && (
                <div className="flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  Gratuita: saldata a € 0, posti confermati e nessun movimento
                  contabile.
                </div>
              )}
              {isDepositPayment && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    Importo acconto (€) *
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    value={paymentAmount}
                    onChange={(event) => setPaymentAmount(event.target.value)}
                    placeholder="es. 50,00"
                    className={inputClass}
                    data-testid="input-add-payment-amount"
                  />
                </div>
              )}
              {isRequestedPayment && (
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    Scadenza richiesta *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={paymentDeadline}
                    onChange={(event) => setPaymentDeadline(event.target.value)}
                    className={inputClass}
                    data-testid="input-add-payment-deadline"
                  />
                  <p className="mt-1 text-[11px] text-amber-700">
                    Alla scadenza si applica il periodo di tolleranza definito
                    nelle impostazioni, comunque mai oltre la partenza.
                  </p>
                </div>
              )}
              {isPaidPayment && !isFreeBooking && (
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    {paymentMethod === "bank_transfer"
                      ? "CRO / TRN del bonifico *"
                      : "Riferimento ricevuta / cassa *"}
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={500}
                    value={transactionReference}
                    onChange={(event) =>
                      setTransactionReference(event.target.value)
                    }
                    className={inputClass}
                    data-testid="input-add-transaction-reference"
                  />
                </div>
              )}
            </div>
          </section>

          {activePickupPoints.length > 0 && (
            <section className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={servizioCasa}
                  onChange={(event) => {
                    setServizioCasa(event.target.checked);
                    if (!event.target.checked) setHomePickupAddress("");
                  }}
                  className="w-4 h-4 accent-accent"
                  data-testid="checkbox-add-servizio-casa"
                />
                <span className="text-sm text-foreground">
                  Servizio sotto casa richiesto
                </span>
              </label>
              {servizioCasa && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    Indirizzo completo per il ritiro *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={500}
                    value={homePickupAddress}
                    onChange={(event) =>
                      setHomePickupAddress(event.target.value)
                    }
                    placeholder="Via, numero civico, CAP, città"
                    className={inputClass}
                    data-testid="input-add-home-pickup-address"
                  />
                </div>
              )}
            </section>
          )}
          {errorMsg && (
            <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-sm rounded-md hover:bg-muted/50 text-muted-foreground"
              data-testid="button-cancel-add"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              data-testid="button-submit-add"
            >
              {isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              Aggiungi prenotazione
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface ExcursionDetailPageProps {
  excursionId: string;
}

export function ExcursionDetailPage({ excursionId }: ExcursionDetailPageProps) {
  const { data: exc, isLoading, error } = useGetExcursion(excursionId);
  const { data: excursionPickupPoints } =
    useListExcursionPickupPoints(excursionId);
  const { data: excursionAgeRanges } = useListExcursionAgePrices(excursionId);
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [detailsBookingId, setDetailsBookingId] = useState<string | null>(null);
  const [confirmResult, setConfirmResult] = useState<string | null>(null);
  const [completionFailure, setCompletionFailure] = useState<{
    error: string;
    blockers: Array<{
      bookingId: string;
      bookingCode?: string | null;
      issues: Array<{ code: string; message: string }>;
    }>;
  } | null>(null);

  const invalidateExcursion = () => {
    void queryClient.invalidateQueries({
      queryKey: getGetExcursionQueryKey(excursionId),
    });
    void queryClient.invalidateQueries({
      queryKey: getListExcursionsQueryKey(),
    });
  };
  const { mutateAsync: confirmTrip, isPending: isConfirming } = useConfirmTrip({
    mutation: { onSuccess: invalidateExcursion },
  });
  const { mutateAsync: expireOverdue, isPending: isExpiring } =
    useExpireOverdueBookings({
      mutation: { onSuccess: invalidateExcursion },
    });

  const handleConfirmTrip = async () => {
    if (!exc) return;
    const isRecovery = exc.status === "confirmed";
    const belowThreshold = exc.adherentsCount < exc.minThreshold;
    if (
      !window.confirm(
        isRecovery
          ? "Rielaborare il workflow di conferma? Il comando è idempotente: recupera addebiti acconto realmente interrotti e richieste saldo mancanti senza duplicare quelle già concluse. I pagamenti già affidati al cliente come ‘azione richiesta’ restano invece nel portale e non vengono addebitati di nuovo automaticamente."
          : belowThreshold
            ? `ATTENZIONE: la soglia minima non è stata raggiunta (${exc.adherentsCount}/${exc.minThreshold}). Confermare comunque la gita? Verranno generate le richieste di saldo per chi ha già versato l'acconto.`
            : "Confermare la gita? Verranno generate le richieste di saldo per chi ha già versato l'acconto (una sola volta).",
      )
    )
      return;
    try {
      const r = await confirmTrip({ id: excursionId });
      setConfirmResult(
        `${isRecovery ? "Rielaborazione conclusa" : "Gita confermata"}: ${r.cardCharged} acconti carta addebitati, ${r.balanceRequestsCreated} richieste saldo create, ${r.actionRequired} pagamenti che richiedono azione cliente, ${r.skipped} prenotazioni senza azioni necessarie.`,
      );
    } catch {
      alert("Impossibile confermare la gita.");
    }
  };

  // Report raccolta bus: persone per punto (RIDENT: punto per persona)
  const handlePrintPickupReport = async () => {
    try {
      const report = await getExcursionPickupReport(excursionId);
      const typeLabel: Record<string, string> = {
        adult: "Adulto",
        child: "Bambino",
        patient: "Paziente",
        companion: "Accompagnatore",
      };
      const missingParticipantDetails =
        (
          report as typeof report & {
            missingParticipantDetails: Array<{
              bookingId: string;
              bookingCode?: string | null;
              customerName: string;
              referente: string;
              phone?: string | null;
              seats: number;
              servizioCasa: boolean;
              homePickupAddress?: string | null;
              participantsDetailed: false;
              warning: string;
            }>;
          }
        ).missingParticipantDetails ?? [];
      const groupsHtml = report.groups
        .map(
          (g) => `
        <h2>${escapeHtml(g.pickupPointName)}${g.province ? ` (${escapeHtml(g.province)})` : ""}${g.pickupTime ? ` — ore ${escapeHtml(g.pickupTime)}` : ""}</h2>
        <p class="meta">${g.totalPeople} person${g.totalPeople === 1 ? "a" : "e"}${g.patients + g.companions > 0 ? ` · Pazienti: ${g.patients} · Accompagnatori: ${g.companions}` : g.children > 0 ? ` · Adulti: ${g.adults} · Bambini: ${g.children}` : ""}</p>
        <table>
          <thead><tr><th>#</th><th>Nominativo</th><th>Tipo</th><th>Prenotazione</th><th>Referente / Tel.</th><th>Check</th></tr></thead>
          <tbody>
          ${g.people
            .map(
              (p, i) => `<tr>
                <td class="center">${i + 1}</td>
                <td>${escapeHtml(p.name)}</td>
                <td>${escapeHtml(typeLabel[p.participantType] ?? p.participantType)}${p.ageRangeLabel ? ` (${escapeHtml(p.ageRangeLabel)})` : ""}</td>
                <td>${escapeHtml(p.bookingCode ?? "—")}</td>
                <td>${escapeHtml(p.referente)}${p.phone ? ` · ${escapeHtml(p.phone)}` : ""}${p.servizioCasa ? `<br><strong>Casa:</strong> ${escapeHtml(p.homePickupAddress ?? "ATTENZIONE: indirizzo mancante")}` : ""}</td>
                <td class="check"><span class="box"></span></td>
              </tr>`,
            )
            .join("")}
          </tbody>
        </table>`,
        )
        .join("");
      const missingHtml = missingParticipantDetails.length
        ? `<h2 class="warning-title">Prenotazioni da completare — non omettere dalla gestione operativa</h2>
          <p class="warning">Queste prenotazioni occupano posti ma hanno nominativi mancanti, incompleti o in numero diverso dai posti. Completare e verificare i dati prima della partenza.</p>
          <table>
            <thead><tr><th>Prenotazione</th><th>Referente / Tel.</th><th>Posti</th><th>Anomalia</th></tr></thead>
            <tbody>${missingParticipantDetails
              .map(
                (item) => `<tr>
                  <td>${escapeHtml(item.bookingCode ?? item.bookingId)}</td>
                  <td>${escapeHtml(item.referente)}${item.phone ? ` · ${escapeHtml(item.phone)}` : ""}${item.servizioCasa ? `<br><strong>Casa:</strong> ${escapeHtml(item.homePickupAddress ?? "ATTENZIONE: indirizzo mancante")}` : ""}</td>
                  <td class="center">${item.seats}</td>
                  <td>${escapeHtml(item.warning)}</td>
                </tr>`,
              )
              .join("")}</tbody>
          </table>`
        : "";
      const win = window.open("", "_blank");
      if (!win) return;
      win.document
        .write(`<!DOCTYPE html><html lang="it"><head><meta charset="utf-8" />
        <title>Report raccolta — ${escapeHtml(exc?.name ?? "")}</title>
        <style>
          body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #14242b; padding: 24px; }
          h1 { font-size: 20px; margin: 0 0 2px; }
          h2 { font-size: 15px; margin: 22px 0 2px; color: #0b5b60; }
          .meta { color: #5b6b72; font-size: 12px; margin: 0 0 8px; }
          .warning-title { color: #9a3412; }
          .warning { color: #9a3412; font-size: 12px; font-weight: 600; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #cbd5db; padding: 5px 8px; text-align: left; }
          th { background: #f1f5f7; }
          .center { text-align: center; }
          .check { width: 46px; text-align: center; }
          .box { display: inline-block; width: 14px; height: 14px; border: 1.5px solid #14242b; border-radius: 3px; }
        </style></head><body>
        <h1>Report raccolta bus — ${escapeHtml(exc?.name ?? "")}</h1>
        <p class="meta">${escapeHtml(formatDate(report.excursion.date))} · Nominativi dettagliati: ${report.totalPeople} · Prenotazioni da completare: ${missingParticipantDetails.length}</p>
        ${groupsHtml || "<p>Nessun partecipante con punto di raccolta registrato.</p>"}
        ${missingHtml}
        </body></html>`);
      win.document.close();
      setTimeout(() => win.print(), 300);
    } catch {
      alert("Impossibile generare il report raccolta.");
    }
  };

  const handleExpireOverdue = async () => {
    try {
      const r = await expireOverdue({ id: excursionId, data: {} });
      const cancellationWarning =
        r.requiresCancellationDecision > 0
          ? `\n\nAttenzione: ${r.requiresCancellationDecision} prenotazion${r.requiresCancellationDecision === 1 ? "e scaduta ha" : "i scadute hanno"} fondi o riferimenti finanziari. I posti restano occupati finché l'amministrazione non apre e risolve il relativo annullamento.`
          : "";
      const stripeCleanupNote =
        r.stripeCancellationsScheduled > 0
          ? `\nSono state pianificate ${r.stripeCancellationsScheduled} operazion${r.stripeCancellationsScheduled === 1 ? "e" : "i"} di cleanup Stripe.`
          : "";
      alert(
        r.expired > 0
          ? `${r.expired} prenotazioni segnate come scadute${r.releasedSeats > 0 ? `, ${r.releasedSeats} posti liberati` : " (nessun posto liberato automaticamente)"}.${cancellationWarning}${stripeCleanupNote}`
          : "Nessuna prenotazione oltre scadenza.",
      );
    } catch {
      alert("Verifica scadute non riuscita.");
    }
  };
  const { mutateAsync: updateExcursion, isPending: isUpdatingExcursion } =
    useUpdateExcursion({
      mutation: {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getGetExcursionQueryKey(excursionId),
          });
          void queryClient.invalidateQueries({
            queryKey: getListExcursionsQueryKey(),
          });
        },
      },
    });
  const { mutateAsync: cancelExcursionTrip, isPending: isCancellingTrip } =
    useCancelExcursionTrip({
      mutation: { onSuccess: invalidateExcursion },
    });
  const { mutateAsync: completeExcursionTrip, isPending: isCompletingTrip } =
    useCompleteExcursionTrip({
      mutation: { onSuccess: invalidateExcursion },
    });
  const { mutateAsync: deleteExcursion, isPending: isDeleting } =
    useDeleteExcursion({
      mutation: {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getListExcursionsQueryKey(),
          });
        },
      },
    });

  const handleDelete = async () => {
    if (!exc) return;
    if (
      !window.confirm(
        `Eliminare definitivamente la gita "${exc.name}"? L'operazione non è reversibile.`,
      )
    )
      return;
    try {
      await deleteExcursion({ id: excursionId });
      navigate("/excursions");
    } catch (err: unknown) {
      const e = err as {
        status?: number;
        data?: { error?: string };
        message?: string;
      };
      if (e?.status === 409) {
        alert(
          e?.data?.error ??
            "Impossibile eliminare: la gita ha prenotazioni. Elimina prima tutte le prenotazioni oppure annulla la gita.",
        );
      } else {
        alert(e?.data?.error ?? e?.message ?? "Impossibile eliminare la gita.");
      }
    }
  };

  const handleCancelExcursion = async () => {
    if (!exc) return;
    const confirmed = window.confirm(
      `Annullare la gita "${exc.name}"?\n\nI posti saranno liberati, i pagamenti con carta verranno accodati per il rimborso integrale e i rimborsi di bonifici/ufficio resteranno evidenziati come attività manuali. L'operazione non riapre automaticamente la gita.`,
    );
    if (!confirmed) return;
    try {
      await cancelExcursionTrip({ id: excursionId });
      alert(
        "Gita annullata. Controlla le singole prenotazioni per lo stato dei rimborsi automatici e manuali.",
      );
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string };
      alert(e?.data?.error ?? e?.message ?? "Impossibile annullare la gita.");
    }
  };

  const handleCompleteExcursion = async () => {
    if (!exc?.departureAt) return;
    if (new Date(exc.departureAt).getTime() > Date.now()) {
      alert(
        "La gita può essere completata soltanto dopo l'orario di partenza.",
      );
      return;
    }
    if (
      !window.confirm(
        `Completare la gita "${exc.name}"? Il sistema verificherà saldi, partecipanti, cancellazioni, rimborsi e operazioni Stripe ancora aperte.`,
      )
    )
      return;
    setCompletionFailure(null);
    try {
      await completeExcursionTrip({ id: excursionId });
    } catch (error: unknown) {
      const apiError = error as {
        data?: {
          error?: string;
          blockers?: Array<{
            bookingId: string;
            bookingCode?: string | null;
            issues: Array<{ code: string; message: string }>;
          }>;
        };
        message?: string;
      };
      setCompletionFailure({
        error:
          apiError.data?.error ??
          apiError.message ??
          "Impossibile completare la gita.",
        blockers: apiError.data?.blockers ?? [],
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-60 text-muted-foreground">
        Caricamento gita...
      </div>
    );
  }

  if (error || !exc) {
    return (
      <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
        <AlertCircle className="w-4 h-4 shrink-0" />
        Gita non trovata.
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[exc.status] ?? STATUS_CONFIG["draft"];
  const price = parseFloat(exc.pricePerPerson ?? "0");
  const mealCost = parseFloat(exc.mealCostPerPerson ?? "0");
  const entranceCost = parseFloat(exc.entranceCostPerPerson ?? "0");
  const extraCost = parseFloat(exc.extraCostPerPerson ?? "0");
  const vehicleCost = parseFloat(exc.vehicleFixedCost ?? "0");
  // Altri costi: fissi a carico dell'agenzia (non per persona), non incidono sul margine/persona.
  const otherCostsTotal = parseFloat(exc.otherCostsTotal ?? "0");
  const marginePerPersona = price - mealCost - entranceCost - extraCost;
  const capacityMax =
    exc.currentCapacity > 0
      ? exc.currentCapacity
      : Math.max(exc.adherentsCount, exc.minThreshold, 1);
  const adherentsPct = Math.min((exc.adherentsCount / capacityMax) * 100, 100);
  const thresholdPct = Math.min((exc.minThreshold / capacityMax) * 100, 100);
  const overThreshold = exc.adherentsCount >= exc.minThreshold;
  const needsVehicleAlert =
    exc.switchThreshold != null &&
    exc.switchVehicleId != null &&
    exc.adherentsCount >= exc.switchThreshold;
  const allBookings = exc.bookings ?? [];
  const activeBookings = allBookings.filter(
    (b) => !b.cancelledAt && b.seatStatus !== "released",
  );
  const canAddManualBooking =
    exc.status === "open" || exc.status === "confirmed";
  const inactiveBookings = allBookings.filter(
    (b) => !!b.cancelledAt || b.seatStatus === "released",
  );
  const chargeFailedBookings = activeBookings.filter(
    (b) => b.paymentStatus === "charge_failed",
  );
  const bookings = showCancelled ? allBookings : activeBookings;
  const pickupPointById = new Map(
    (excursionPickupPoints ?? []).map(
      (p) =>
        [
          p.id,
          `${p.location.name}${p.pickupTime ? ` (ore ${p.pickupTime})` : ""}`,
        ] as const,
    ),
  );

  const reportRows = activeBookings
    .map((b) => ({
      name: b.customerName,
      phone: b.phone ?? "",
      // Prenotazione "a punti divisi": pickupPointId è null ma la gita ha punti →
      // i punti sono per-partecipante, visibili nel dettaglio della prenotazione.
      pickup: b.pickupPointId
        ? (pickupPointById.get(b.pickupPointId) ?? "")
        : excursionPickupPoints && excursionPickupPoints.length > 0
          ? "Punti diversi"
          : "",
      adults: b.adults,
      children: b.children,
      servizioCasa: !!b.servizioCasa,
      homePickupAddress: b.homePickupAddress?.trim() ?? "",
      paymentLabel:
        PAYMENT_STATUS_CONFIG[b.paymentStatus]?.label ?? b.paymentStatus,
    }))
    .sort((a, b) => {
      const pa = a.pickup || "￿";
      const pb = b.pickup || "￿";
      if (pa !== pb) return pa.localeCompare(pb, "it");
      return a.name.localeCompare(b.name, "it");
    });

  const totalPeople = activeBookings.reduce(
    (sum, b) => sum + b.adults + b.children,
    0,
  );
  const paidCount = activeBookings.filter(
    (b) => b.paymentStatus === "paid",
  ).length;
  const depositCount = activeBookings.filter(
    (b) => b.paymentStatus === "deposit",
  ).length;
  const pendingCount = activeBookings.length - paidCount - depositCount;

  const toBookParts: string[] = [];
  if (mealCost > 0) toBookParts.push(`${totalPeople} pasti`);
  if (entranceCost > 0) toBookParts.push(`${totalPeople} ingressi`);
  const toBookLabel = toBookParts.length > 0 ? toBookParts.join(" · ") : "—";

  const handlePrintReport = () => {
    const rowsHtml = reportRows
      .map(
        (r, i) => `
        <tr>
          <td class="center">${i + 1}</td>
          <td>${escapeHtml(r.name)}</td>
          <td>${escapeHtml(r.phone) || "—"}</td>
          <td>${escapeHtml(r.pickup) || "—"}</td>
          <td class="center">${r.children > 0 ? `${r.adults}A+${r.children}B` : `${r.adults}A`}</td>
          <td>${r.servizioCasa ? escapeHtml(r.homePickupAddress) || "ATTENZIONE: indirizzo mancante" : "—"}</td>
          <td>${escapeHtml(r.paymentLabel)}</td>
          <td class="check"><span class="box"></span></td>
        </tr>`,
      )
      .join("");

    const printedAt = new Date().toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8" />
<title>Report gita - ${escapeHtml(exc.name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #14242b; margin: 0; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { color: #5b6b72; font-size: 13px; }
  .summary { display: flex; gap: 10px; flex-wrap: wrap; margin: 16px 0 18px; font-size: 12px; }
  .summary span { background: #f1f5f7; border-radius: 6px; padding: 5px 10px; }
  .summary b { color: #0f1f26; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #cbd5db; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #0e3a4a; color: #fff; font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; }
  td.center { text-align: center; }
  td.check { width: 56px; text-align: center; }
  .box { display: inline-block; width: 15px; height: 15px; border: 1.5px solid #5b6b72; border-radius: 3px; }
  tbody tr:nth-child(even) { background: #f7fafb; }
  footer { margin-top: 16px; font-size: 11px; color: #5b6b72; display: flex; justify-content: space-between; }
  @page { size: A4 landscape; margin: 12mm; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <h1>${escapeHtml(exc.name)}</h1>
  <div class="meta">${escapeHtml(exc.location)} · ${escapeHtml(formatExcursionDeparture(exc.departureAt, exc.date))} · ${escapeHtml(statusCfg.label)}</div>
  <div class="summary">
    <span><b>${activeBookings.length}</b> prenotazioni · <b>${totalPeople}</b> persone</span>
    <span>Saldati <b>${paidCount}</b> · Acconto <b>${depositCount}</b> · In attesa <b>${pendingCount}</b></span>
    <span>Da prenotare: <b>${escapeHtml(toBookLabel)}</b></span>
  </div>
  <table>
    <thead>
      <tr>
        <th class="center">#</th>
        <th>Nome e cognome</th>
        <th>Telefono</th>
        <th>Punto di raccolta</th>
        <th class="center">Posti</th>
        <th>Ritiro casa</th>
        <th>Pagamento</th>
        <th class="center">Presenza</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <footer>
    <span>Elis Travel — Report gita</span>
    <span>Stampato il ${printedAt}</span>
  </footer>
</body>
</html>`;

    const win = window.open("", "_blank", "width=1024,height=720");
    if (!win) {
      alert(
        "Per stampare il report consenti le finestre popup per questo sito.",
      );
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/excursions"
          className="p-2 rounded-xl hover:bg-muted/50 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground truncate">
              {exc.name}
            </h1>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusCfg.className}`}
            >
              {statusCfg.label}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              {exc.location}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {formatExcursionDeparture(exc.departureAt, exc.date)}
            </span>
            {!exc.departureAt && (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                <AlertCircle className="w-3 h-3" /> Completa l'orario
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Le gite Rident non hanno locandina: impianto grafico pensato per
              le gite standard. */}
          {exc.category !== "rident" && (
            <Link
              href={`/pdf/excursion/${exc.id}`}
              className="inline-flex items-center gap-1.5 bg-white hover:bg-muted/50 border border-border text-foreground text-sm font-medium px-3 py-2 rounded-xl transition-colors"
              data-testid="button-poster-excursion"
              title="Genera locandina"
            >
              <Printer className="w-3.5 h-3.5" />
              Locandina
            </Link>
          )}
          <button
            type="button"
            onClick={() => void handlePrintPickupReport()}
            className="inline-flex items-center gap-1.5 bg-white hover:bg-muted/50 border border-border text-foreground text-sm font-medium px-3 py-2 rounded-xl transition-colors"
            data-testid="button-pickup-report"
            title="Report raccolta bus: persone per punto di raccolta"
          >
            <Bus className="w-3.5 h-3.5" />
            Raccolta
          </button>
          {exc.status !== "cancelled" && (
            <button
              type="button"
              onClick={() => setShowEditModal(true)}
              className="inline-flex items-center gap-1.5 bg-white hover:bg-muted/50 border border-border text-foreground text-sm font-medium px-3 py-2 rounded-xl transition-colors"
              data-testid="button-edit-excursion"
            >
              <Pencil className="w-3.5 h-3.5" />
              Modifica
            </button>
          )}
          {exc.status === "confirmed" &&
            (exc.departureAt &&
            new Date(exc.departureAt).getTime() <= Date.now() ? (
              <button
                type="button"
                onClick={() => void handleCompleteExcursion()}
                disabled={isCompletingTrip}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-50 disabled:opacity-60"
                data-testid="button-complete-excursion"
                title="Verifica e completa amministrativamente la gita"
              >
                {isCompletingTrip ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCheck className="h-3.5 w-3.5" />
                )}
                Completa gita
              </button>
            ) : (
              <span
                className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
                title="Il comando sarà disponibile dopo l'orario di partenza"
              >
                Completa dopo la partenza
              </span>
            ))}
          {!["cancelled", "completed", "archived"].includes(exc.status) && (
            <button
              type="button"
              onClick={() => void handleCancelExcursion()}
              disabled={isCancellingTrip}
              className="inline-flex items-center gap-1.5 bg-white hover:bg-amber-50 border border-amber-300 text-amber-800 text-sm font-medium px-3 py-2 rounded-xl transition-colors disabled:opacity-60"
              data-testid="button-cancel-excursion"
              title="Annulla la gita e avvia rimborsi/attività amministrative"
            >
              {isCancellingTrip ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <X className="w-3.5 h-3.5" />
              )}
              Annulla gita
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowDuplicateModal(true)}
            className="inline-flex items-center gap-1.5 bg-white hover:bg-muted/50 border border-border text-foreground text-sm font-medium px-3 py-2 rounded-xl transition-colors"
            data-testid="button-duplicate-excursion"
            title="Duplica gita"
          >
            <Copy className="w-3.5 h-3.5" />
            Duplica
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="inline-flex items-center gap-1.5 bg-white hover:bg-red-50 border border-red-200 text-red-600 text-sm font-medium px-3 py-2 rounded-xl transition-colors disabled:opacity-60"
            data-testid="button-delete-excursion"
            title="Elimina gita"
          >
            {isDeleting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            Elimina
          </button>
        </div>
      </div>

      {exc.category === "rident" && (
        <RidentLinksBox excursionId={exc.id} excursionName={exc.name} />
      )}

      {/* La conferma è sempre un comando esplicito, con evidenza della soglia. */}
      {exc.status === "open" && (
        <div
          className={`flex flex-wrap items-center gap-3 rounded-2xl border px-5 py-4 ${
            overThreshold
              ? "border-emerald-200 bg-emerald-50"
              : "border-amber-300 bg-amber-50"
          }`}
        >
          {overThreshold ? (
            <CheckCircle className="w-5 h-5 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0 text-amber-700" />
          )}
          <div
            className={`flex-1 text-sm ${
              overThreshold ? "text-emerald-900" : "text-amber-950"
            }`}
          >
            <strong>
              {overThreshold
                ? "Soglia minima raggiunta"
                : "Soglia minima non raggiunta"}
            </strong>{" "}
            ({exc.adherentsCount} persone su {exc.minThreshold} richieste).{" "}
            {overThreshold
              ? "Puoi confermare la gita: verranno generate le richieste di saldo per chi ha versato l'acconto."
              : "La conferma anticipata resta possibile, ma richiede una conferma esplicita dell'amministrazione."}
          </div>
          <button
            type="button"
            onClick={handleConfirmTrip}
            disabled={isConfirming}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
              overThreshold
                ? "bg-emerald-600 hover:bg-emerald-700"
                : "bg-amber-700 hover:bg-amber-800"
            }`}
            data-testid="button-confirm-trip"
          >
            {isConfirming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            {overThreshold ? "Conferma gita" : "Conferma comunque"}
          </button>
        </div>
      )}
      {exc.status === "confirmed" && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4">
          <RotateCcw className="h-5 w-5 shrink-0 text-sky-700" />
          <div className="flex-1 text-sm text-sky-950">
            <strong>Recupero manuale della conferma.</strong> Se una precedente
            elaborazione si è interrotta, puoi rieseguirla: verranno recuperati
            soltanto acconti carta e richieste saldo ancora mancanti, senza
            duplicare le operazioni già concluse. I pagamenti con azione cliente
            richiesta restano nel portale: la rielaborazione non tenta un
            secondo addebito automatico.
          </div>
          <button
            type="button"
            onClick={handleConfirmTrip}
            disabled={isConfirming}
            className="inline-flex items-center gap-1.5 rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
            data-testid="button-recover-confirm-trip"
          >
            {isConfirming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            Rielabora conferma
          </button>
        </div>
      )}
      {confirmResult && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 px-5 py-3 text-sm text-foreground">
          {confirmResult}
        </div>
      )}
      {completionFailure && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-900">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
            <div className="min-w-0 flex-1">
              <strong>{completionFailure.error}</strong>
              {completionFailure.blockers.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {completionFailure.blockers.map((blocker) => (
                    <li
                      key={blocker.bookingId}
                      className="rounded-lg border border-red-200 bg-white/70 px-3 py-2 text-xs"
                    >
                      <div className="font-semibold">
                        Prenotazione {blocker.bookingCode ?? blocker.bookingId}
                      </div>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-red-800">
                        {blocker.issues.map((issue) => (
                          <li key={`${issue.code}-${issue.message}`}>
                            {issue.message}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-primary mb-4 pb-2 border-b border-primary/10">
              Immagine di copertina
            </h2>
            <CoverImageUploader
              value={exc.coverImageUrl}
              onChange={async (url) => {
                await updateExcursion({
                  id: excursionId,
                  data: { coverImageUrl: url },
                });
              }}
              testIdPrefix="excursion-cover"
            />
          </div>

          <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-primary mb-4 flex items-center gap-1.5 pb-2 border-b border-primary/10">
              <Users className="w-4 h-4" /> Stato Adesioni
            </h2>

            <div className="flex items-end gap-4 mb-4 flex-wrap">
              <div>
                <div className="text-4xl font-bold text-foreground">
                  {exc.adherentsCount}
                </div>
                <div className="text-sm text-muted-foreground">
                  persone su {capacityMax} posti
                </div>
              </div>
              <div className="flex gap-4 pb-1">
                <div className="text-center">
                  <div className="text-xl font-bold text-foreground">
                    {activeBookings.length}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    prenotazioni
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-accent">
                    {exc.depositsCount}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    acconti ricevuti
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-primary">
                    {exc.balancesCount}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    saldi ricevuti
                  </div>
                </div>
              </div>
            </div>

            <div className="relative h-3.5 bg-muted rounded-full overflow-hidden mb-1">
              {adherentsPct > 0 && (
                <div
                  className={`absolute left-0 top-0 h-full rounded-full transition-all ${overThreshold ? "bg-primary" : "bg-accent"}`}
                  style={{ width: `${adherentsPct}%` }}
                />
              )}
              {thresholdPct > 0 && thresholdPct < 100 && (
                <div
                  className="absolute top-0 h-full w-0.5 bg-foreground/25"
                  style={{ left: `${thresholdPct}%` }}
                />
              )}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0</span>
              <span>Soglia min: {exc.minThreshold}</span>
              <span>{capacityMax}</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            {chargeFailedBookings.length > 0 && (
              <div className="px-5 py-3 bg-red-50 border-b border-red-200 flex items-start gap-2 text-sm text-red-800">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />
                <span>
                  <strong>
                    {chargeFailedBookings.length} prenotazion
                    {chargeFailedBookings.length === 1 ? "e" : "i"} con addebito
                    fallito
                  </strong>{" "}
                  — contattare i clienti per aggiornare il metodo di pagamento.
                  {chargeFailedBookings.map((b) => (
                    <span
                      key={b.id}
                      className="block text-xs text-red-700 mt-0.5 ml-0.5"
                    >
                      · {b.customerName}
                      {b.email ? ` (${b.email})` : ""}
                    </span>
                  ))}
                </span>
              </div>
            )}
            <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <Users className="w-4 h-4" /> Prenotazioni:{" "}
                  {activeBookings.length} · Persone: {totalPeople}
                </h2>
                <button
                  type="button"
                  onClick={handleExpireOverdue}
                  disabled={isExpiring}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-border bg-white text-muted-foreground hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50"
                  data-testid="button-expire-overdue"
                  title="Segna come scadute le prenotazioni oltre la scadenza di pagamento"
                >
                  {isExpiring ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Clock className="w-3 h-3" />
                  )}
                  Verifica scadute
                </button>
                {inactiveBookings.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowCancelled((v) => !v)}
                    className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-colors ${showCancelled ? "bg-red-100 border-red-300 text-red-700" : "bg-gray-100 border-gray-200 text-gray-500 hover:bg-red-50 hover:border-red-200 hover:text-red-600"}`}
                    data-testid="button-toggle-cancelled"
                  >
                    {inactiveBookings.length} non operativ
                    {inactiveBookings.length === 1 ? "a" : "e"}
                    {showCancelled ? " ✕" : ""}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                disabled={!canAddManualBooking}
                title={
                  canAddManualBooking
                    ? "Aggiungi una prenotazione manuale"
                    : "La gita deve essere aperta o confermata"
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                data-testid="button-add-participant"
              >
                <Plus className="w-3.5 h-3.5" />
                Aggiungi prenotazione
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/20 border-b border-border/50">
                    <th className="py-2 pl-4 pr-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Nome
                    </th>
                    <th className="py-2 px-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Posti
                    </th>
                    <th className="py-2 px-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Pagamento
                    </th>
                    <th className="py-2 px-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Prenotato il
                    </th>
                    <th className="py-2 pr-4 pl-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Azioni
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => (
                    <BookingRow
                      key={b.id}
                      booking={b}
                      excursionId={excursionId}
                      pickupPointName={
                        b.pickupPointId
                          ? (pickupPointById.get(b.pickupPointId) ?? null)
                          : null
                      }
                      onOpenDetails={setDetailsBookingId}
                    />
                  ))}
                  {bookings.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-10 text-center text-muted-foreground"
                      >
                        {allBookings.length === 0
                          ? "Nessuna prenotazione ancora"
                          : "Tutte le prenotazioni sono annullate o hanno i posti rilasciati"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4" /> Conto Economico
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ricavi stimati</span>
                <span className="font-medium">
                  {formatEur(exc.ricaviStimati)}
                </span>
              </div>
              <div className="h-px bg-border/50 my-2" />
              <div className="flex justify-between text-muted-foreground">
                <span>Costo veicolo</span>
                <span>– {formatEur(vehicleCost)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Costi variabili</span>
                <span>– {formatEur(exc.costiVariabili)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Altri costi</span>
                <span>– {formatEur(otherCostsTotal)}</span>
              </div>
              {exc.otherCosts && exc.otherCosts.length > 0 && (
                <div className="pl-3 space-y-1">
                  {exc.otherCosts.map((oc, i) => (
                    <div
                      key={i}
                      className="flex justify-between text-xs text-muted-foreground/70"
                    >
                      <span className="truncate pr-2">
                        {oc.name?.trim() || "Voce"}
                      </span>
                      <span className="shrink-0">
                        – {formatEur(Number(oc.price) || 0)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="h-px bg-border/50 my-2" />
              <div className="flex justify-between font-semibold text-base">
                <span>Margine netto</span>
                <span
                  className={
                    exc.margineNetto >= 0 ? "text-primary" : "text-destructive"
                  }
                >
                  {formatEur(exc.margineNetto)}
                </span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-border/50">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Dettaglio per persona
              </h3>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Prezzo</span>
                  <span>{formatEur(price)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>− Pasto</span>
                  <span>{formatEur(mealCost)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>− Ingressi</span>
                  <span>{formatEur(entranceCost)}</span>
                </div>
                {exc.extras && exc.extras.length > 0 ? (
                  exc.extras.map((ex, i) => (
                    <div
                      key={i}
                      className="flex justify-between text-muted-foreground"
                    >
                      <span className="truncate pr-2">
                        − {ex.name?.trim() || "Extra"}
                      </span>
                      <span className="shrink-0">
                        {formatEur(Number(ex.price) || 0)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="flex justify-between text-muted-foreground">
                    <span>− Extra</span>
                    <span>{formatEur(extraCost)}</span>
                  </div>
                )}
                <div className="flex justify-between font-medium border-t border-border/50 pt-1.5">
                  <span>Margine/persona</span>
                  <span
                    className={
                      marginePerPersona >= 0
                        ? "text-primary"
                        : "text-destructive"
                    }
                  >
                    {formatEur(marginePerPersona)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-primary mb-3 flex items-center gap-1.5 pb-2 border-b border-primary/10">
              <Bus className="w-4 h-4" /> Logistica Mezzo
            </h2>
            {needsVehicleAlert && (
              <div className="mb-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  Soglia cambio mezzo raggiunta ({exc.switchThreshold}{" "}
                  aderenti). Valutare veicolo alternativo.
                </span>
              </div>
            )}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Costo fisso</span>
                <span className="font-medium">{formatEur(vehicleCost)}</span>
              </div>
              {exc.currentCapacity > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Capienza</span>
                  <span>{exc.currentCapacity} posti</span>
                </div>
              )}
              {exc.switchThreshold != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Soglia cambio</span>
                  <span>{exc.switchThreshold} aderenti</span>
                </div>
              )}
              {exc.operationalNotes && (
                <div className="mt-2 pt-2 border-t border-border/50 text-muted-foreground text-xs leading-relaxed">
                  {exc.operationalNotes}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-primary mb-3 flex items-center gap-1.5 pb-2 border-b border-primary/10">
              <FileText className="w-4 h-4" /> Report
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Partecipanti</span>
                <span className="font-medium">
                  {activeBookings.length}{" "}
                  <span className="font-normal text-muted-foreground">
                    ({totalPeople} pers.)
                  </span>
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground shrink-0">
                  Pagamenti
                </span>
                <span className="font-medium text-right">
                  {paidCount} saldati · {depositCount} acconto · {pendingCount}{" "}
                  in attesa
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Da prenotare</span>
                <span className="font-medium">{toBookLabel}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handlePrintReport}
              disabled={activeBookings.length === 0}
              className="mt-4 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              data-testid="button-print-report"
            >
              <Printer className="w-4 h-4" /> Stampa report
            </button>
            {activeBookings.length === 0 && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Nessun partecipante da stampare.
              </p>
            )}
          </div>
        </div>
      </div>

      {showAddModal && (
        <AddParticipantModal
          excursionId={excursionId}
          isRident={exc.category === "rident"}
          excursionStatus={exc.status}
          departureAt={exc.departureAt}
          pickupPoints={excursionPickupPoints ?? []}
          ageRanges={excursionAgeRanges ?? []}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {detailsBookingId && (
        <BookingDetailsModal
          bookingId={detailsBookingId}
          excursionId={excursionId}
          excursionStatus={exc.status}
          isRident={exc.category === "rident"}
          pickupPoints={excursionPickupPoints ?? []}
          ageRanges={excursionAgeRanges ?? []}
          onClose={() => setDetailsBookingId(null)}
        />
      )}

      {showEditModal && (
        <ExcursionFormModal
          mode="edit"
          initial={exc}
          onClose={() => setShowEditModal(false)}
        />
      )}

      {showDuplicateModal && (
        <ExcursionFormModal
          mode="create"
          initial={exc}
          isDuplicate
          onClose={() => setShowDuplicateModal(false)}
          onSaved={(saved) => {
            setShowDuplicateModal(false);
            navigate(`/excursions/${saved.id}`);
          }}
        />
      )}
    </div>
  );
}
