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
  ChevronRight,
  RotateCcw,
  Mail,
  ClipboardCopy,
  CheckCheck,
} from "lucide-react";
import { ExcursionFormModal } from "@/components/admin/ExcursionFormModal";
import {
  useGetExcursion,
  useUpdateExcursion,
  useDeleteExcursion,
  useUpdateExcursionBookingPayment,
  useDeleteExcursionBooking,
  useAddExcursionBooking,
  useGetAdminSettings,
  getGetExcursionQueryKey,
  getListExcursionsQueryKey,
} from "@workspace/api-client-react";
import type { Booking } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CoverImageUploader } from "@/components/shared/CoverImageUploader";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: "Bozza", className: "bg-muted text-muted-foreground" },
  open: { label: "Aperta", className: "bg-sky-100 text-sky-700" },
  confirmed: { label: "Confermata", className: "bg-primary/10 text-primary" },
  completed: { label: "Completata", className: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "Annullata", className: "bg-destructive/10 text-destructive" },
};

const PAYMENT_STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  pending:           { label: "In attesa",        icon: Clock,       className: "text-muted-foreground" },
  deposit_requested: { label: "Richiesta acconto", icon: Clock,       className: "text-amber-600" },
  deposit:           { label: "Acconto",           icon: CreditCard,  className: "text-accent" },
  full_requested:    { label: "Richiesta totale",  icon: Clock,       className: "text-amber-600" },
  paid:              { label: "Saldato",           icon: CheckCircle, className: "text-primary" },
  refunded:          { label: "Rimborsato",        icon: RotateCcw,   className: "text-slate-500" },
};

function formatEur(n: number) {
  return n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(dtStr: string) {
  const d = new Date(dtStr);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
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
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${colors[idx]}`}>
      {getInitials(name)}
    </div>
  );
}

const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  deposit_requested: ["deposit"],
  full_requested:    ["paid"],
  pending:           ["deposit", "paid"],
  deposit:           ["paid", "refunded"],
  paid:              ["refunded"],
  refunded:          [],
};

const TRANSITION_LABELS: Record<string, Record<string, string>> = {
  deposit_requested: { deposit:  "Conferma acconto" },
  full_requested:    { paid:     "Conferma pagamento" },
  pending:           { deposit:  "→ Acconto",  paid: "→ Saldato" },
  deposit:           { paid:     "→ Saldato",  refunded: "→ Rimborsa" },
  paid:              { refunded: "→ Rimborsa" },
};

function BookingRow({
  booking,
  excursionId,
  excursionName,
  excursionDate,
  excursionLocation,
  pricePerPerson,
  pickupPointName,
}: {
  booking: Booking;
  excursionId: string;
  excursionName: string;
  excursionDate: string;
  excursionLocation: string;
  pricePerPerson: string | null;
  pickupPointName?: string | null;
}) {
  const queryClient = useQueryClient();
  const paymentCfg = PAYMENT_STATUS_CONFIG[booking.paymentStatus] ?? PAYMENT_STATUS_CONFIG["pending"];
  const PayIcon = paymentCfg.icon;
  const allowedNextStates = ALLOWED_TRANSITIONS[booking.paymentStatus] ?? [];

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: getGetExcursionQueryKey(excursionId) });
    void queryClient.invalidateQueries({ queryKey: getListExcursionsQueryKey() });
  };

  const { mutateAsync: updateStatus, isPending: isUpdating } = useUpdateExcursionBookingPayment({
    mutation: { onSuccess: invalidate },
  });
  const { mutateAsync: deleteBooking, isPending: isDeleting } = useDeleteExcursionBooking({
    mutation: { onSuccess: invalidate },
  });

  const transitionTo = async (targetStatus: string) => {
    try {
      await updateStatus({
        id: excursionId,
        bookingId: booking.id,
        data: { paymentStatus: targetStatus as "pending" | "deposit_requested" | "deposit" | "full_requested" | "paid" | "refunded" },
      });
    } catch (e) {
      console.error(e);
      alert("Impossibile aggiornare lo stato.");
    }
  };

  const remove = async () => {
    if (!window.confirm(`Eliminare la prenotazione di ${booking.customerName}?`)) return;
    try {
      await deleteBooking({ id: excursionId, bookingId: booking.id });
    } catch (e) {
      console.error(e);
      alert("Impossibile eliminare la prenotazione.");
    }
  };

  const busy = isUpdating || isDeleting;
  const isCancelled = !!booking.cancelledAt;

  const isRequest =
    booking.paymentStatus === "deposit_requested" ||
    booking.paymentStatus === "full_requested";

  return (
    <>
    <tr className={`border-b ${isRequest ? "" : "border-border/50"} transition-colors ${isCancelled ? "bg-gray-50/80 opacity-70" : "hover:bg-muted/20"}`}
      data-testid={`booking-row-${booking.id}`}
    >
      <td className="py-2.5 pl-4 pr-2">
        <div className="flex items-center gap-2">
          <AvatarInitials name={booking.customerName} />
          <div className="min-w-0">
            <div className={`font-medium text-sm truncate ${isCancelled ? "line-through text-muted-foreground" : "text-foreground"}`}>
              {booking.customerName}
            </div>
            {booking.email && (
              <div className="text-xs text-muted-foreground truncate" data-testid={`text-booking-email-${booking.id}`}>
                {booking.email}
              </div>
            )}
            {pickupPointName && (
              <div className="text-xs text-primary mt-0.5 flex items-center gap-1 truncate" title={`Punto di raccolta: ${pickupPointName}`}>
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">{pickupPointName}</span>
              </div>
            )}
            {isCancelled && booking.cancelledAt && (
              <div className="text-xs text-red-500 mt-0.5">
                Annullata il {formatDateTimeFull(booking.cancelledAt)}
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="py-2.5 px-2 text-center">
        <div className="inline-flex flex-col items-center gap-1">
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground" title={`${booking.adults} adult${booking.adults === 1 ? "o" : "i"}${booking.children > 0 ? ` + ${booking.children} bambin${booking.children === 1 ? "o" : "i"}` : ""}`}>
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            {booking.children > 0 ? `${booking.adults}A+${booking.children}B` : booking.adults}
          </span>
          {booking.servizioCasa && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700" title="Richiesto servizio sotto casa">
              🏠 Casa
            </span>
          )}
        </div>
      </td>
      <td className="py-2.5 px-2">
        {isCancelled ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700"
            data-testid={`badge-cancelled-${booking.id}`}
          >
            Annullata
          </span>
        ) : (
          <span className={`inline-flex items-center gap-1 text-xs font-medium ${paymentCfg.className}`}>
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
          {!isCancelled && allowedNextStates.map((targetStatus) => {
            const label = TRANSITION_LABELS[booking.paymentStatus]?.[targetStatus] ?? `→ ${targetStatus}`;
            const isRefund = targetStatus === "refunded";
            return (
              <button
                key={targetStatus}
                type="button"
                onClick={() => transitionTo(targetStatus)}
                disabled={busy}
                className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                  isRefund
                    ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                    : "bg-primary/10 text-primary hover:bg-primary/20"
                }`}
                data-testid={`button-transition-${booking.id}-${targetStatus}`}
                title={label}
              >
                {label}
                <ChevronRight className="w-3 h-3" />
              </button>
            );
          })}
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
    {isRequest && (
      <tr className="border-b border-amber-100 bg-amber-50/30">
        <td colSpan={5} className="pb-1">
          <BookingEmailPanel
            booking={booking}
            excursionName={excursionName}
            excursionDate={excursionDate}
            excursionLocation={excursionLocation}
            pricePerPerson={pricePerPerson}
          />
        </td>
      </tr>
    )}
    </>
  );
}

function BookingEmailPanel({
  booking,
  excursionName,
  excursionDate,
  excursionLocation,
  pricePerPerson,
}: {
  booking: Booking;
  excursionName: string;
  excursionDate: string;
  excursionLocation: string;
  pricePerPerson: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { data: settings } = useGetAdminSettings();

  const isRequest =
    booking.paymentStatus === "deposit_requested" ||
    booking.paymentStatus === "full_requested";
  if (!isRequest) return null;

  const totalPeople = booking.adults + booking.children;
  const price = pricePerPerson ? Number(pricePerPerson) : null;
  const totalAmount =
    price !== null && !Number.isNaN(price)
      ? new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(
          price * totalPeople,
        )
      : null;

  const dateLabel = (() => {
    const d = new Date(excursionDate + "T00:00:00");
    return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  })();

  const participantsLine =
    booking.children > 0
      ? `${booking.adults} adult${booking.adults === 1 ? "o" : "i"} + ${booking.children} bambin${booking.children === 1 ? "o" : "i"}`
      : `${booking.adults} adult${booking.adults === 1 ? "o" : "i"}`;

  const hasPaymentInfo =
    settings?.payment_iban || settings?.payment_beneficiary || settings?.payment_bank;

  const emailText = [
    `Gentile ${booking.customerName},`,
    "",
    `in seguito alla sua richiesta di prenotazione per la gita "${excursionName}" (${excursionLocation}, ${dateLabel}), le inviamo le coordinate per il pagamento.`,
    "",
    `— DETTAGLI PRENOTAZIONE —`,
    `Gita: ${excursionName}`,
    `Data: ${dateLabel}`,
    `Partecipanti: ${participantsLine}`,
    ...(totalAmount ? [`Totale: ${totalAmount}`] : []),
    "",
    ...(booking.paymentStatus === "deposit_requested"
      ? [`Modalità: Acconto (il saldo verrà richiesto in prossimità della partenza)`]
      : [`Modalità: Pagamento completo`]),
    "",
    ...(hasPaymentInfo
      ? [
          `— COORDINATE DI PAGAMENTO —`,
          ...(settings?.payment_beneficiary ? [`Intestatario: ${settings.payment_beneficiary}`] : []),
          ...(settings?.payment_iban ? [`IBAN: ${settings.payment_iban}`] : []),
          ...(settings?.payment_bank ? [`Banca: ${settings.payment_bank}`] : []),
          ...(settings?.payment_notes ? [`Causale: ${settings.payment_notes}`] : [`Causale: Prenotazione gita ${excursionName} – ${booking.customerName}`]),
          "",
        ]
      : [`[INSERIRE QUI LE COORDINATE DI PAGAMENTO]`, ""]),
    ...(booking.servizioCasa
      ? [
          `— SERVIZIO SOTTO CASA —`,
          `Ha richiesto il servizio di trasporto da casa al punto di raccolta. La preghiamo di comunicarci l'indirizzo di partenza e un recapito telefonico per organizzare il ritiro.`,
          "",
        ]
      : []),
    `Per confermare la prenotazione, le chiediamo inoltre di comunicarci i nominativi e i recapiti di tutti i partecipanti.`,
    "",
    `Rimaniamo a disposizione per qualsiasi informazione.`,
    "",
    `Cordiali saluti,`,
    `Elis Travel`,
  ].join("\n");

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(emailText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
    }
  };

  return (
    <div className="mt-2 mx-4 mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 font-medium border border-amber-200 transition-colors"
      >
        <Mail className="w-3.5 h-3.5" />
        {open ? "Chiudi email" : "Genera email"}
      </button>
      {open && (
        <div className="mt-2 p-3 bg-gray-50 border border-border rounded-lg">
          {!hasPaymentInfo && (
            <div className="mb-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              Le coordinate di pagamento non sono configurate. Vai in{" "}
              <a href="/admin/settings" className="underline font-medium">Impostazioni</a>{" "}
              per aggiungerle.
            </div>
          )}
          <textarea
            readOnly
            value={emailText}
            rows={Math.min(20, emailText.split("\n").length + 2)}
            className="w-full text-xs font-mono bg-white border border-border rounded p-2 resize-y focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            type="button"
            onClick={copyToClipboard}
            className="mt-2 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-medium transition-colors"
          >
            {copied ? (
              <><CheckCheck className="w-3.5 h-3.5" />Copiato!</>
            ) : (
              <><ClipboardCopy className="w-3.5 h-3.5" />Copia testo</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function AddParticipantModal({
  excursionId,
  onClose,
}: {
  excursionId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "deposit_requested" | "full_requested" | "deposit" | "paid">("pending");
  const [servizioCasa, setServizioCasa] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { mutateAsync, isPending } = useAddExcursionBooking({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetExcursionQueryKey(excursionId) });
        void queryClient.invalidateQueries({ queryKey: getListExcursionsQueryKey() });
      },
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!name.trim()) {
      setErrorMsg("Il nome è obbligatorio.");
      return;
    }
    try {
      await mutateAsync({
        id: excursionId,
        data: {
          customerName: name.trim(),
          email: email.trim() || null,
          adults,
          children,
          paymentStatus,
          servizioCasa,
        },
      });
      onClose();
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string };
      setErrorMsg(e?.data?.error ?? e?.message ?? "Impossibile aggiungere il partecipante.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" data-testid="modal-add-participant">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-foreground">Aggiungi partecipante</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted/50"
            data-testid="button-close-modal"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Nome e cognome *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="input-add-name"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="input-add-email"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Adulti *</label>
              <input
                type="number"
                min={1}
                max={50}
                required
                value={adults}
                onChange={(e) => setAdults(Math.max(1, Number(e.target.value) || 1))}
                className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                data-testid="input-add-adults"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Bambini</label>
              <input
                type="number"
                min={0}
                max={50}
                value={children}
                onChange={(e) => setChildren(Math.max(0, Number(e.target.value) || 0))}
                className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                data-testid="input-add-children"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Stato pagamento</label>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as "pending" | "deposit_requested" | "full_requested" | "deposit" | "paid")}
                className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                data-testid="select-add-payment"
              >
                <option value="pending">In attesa</option>
                <option value="deposit_requested">Richiesta acconto</option>
                <option value="full_requested">Richiesta saldo</option>
                <option value="deposit">Acconto versato</option>
                <option value="paid">Saldato</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={servizioCasa}
              onChange={(e) => setServizioCasa(e.target.checked)}
              className="w-4 h-4 accent-accent"
              data-testid="checkbox-add-servizio-casa"
            />
            <span className="text-sm text-foreground">Servizio sotto casa richiesto</span>
          </label>
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
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Aggiungi
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
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const { mutateAsync: updateExcursion } = useUpdateExcursion({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetExcursionQueryKey(excursionId) });
        void queryClient.invalidateQueries({ queryKey: getListExcursionsQueryKey() });
      },
    },
  });
  const { mutateAsync: deleteExcursion, isPending: isDeleting } = useDeleteExcursion({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListExcursionsQueryKey() });
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
      const e = err as { status?: number; data?: { error?: string }; message?: string };
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
  const marginePerPersona = price - mealCost - entranceCost - extraCost;
  const capacityMax = exc.currentCapacity > 0 ? exc.currentCapacity : Math.max(exc.adherentsCount, exc.minThreshold, 1);
  const adherentsPct = Math.min((exc.adherentsCount / capacityMax) * 100, 100);
  const thresholdPct = Math.min((exc.minThreshold / capacityMax) * 100, 100);
  const overThreshold = exc.adherentsCount >= exc.minThreshold;
  const needsVehicleAlert =
    exc.switchThreshold != null &&
    exc.switchVehicleId != null &&
    exc.adherentsCount >= exc.switchThreshold;
  const allBookings = exc.bookings ?? [];
  const activeBookings = allBookings.filter((b) => !b.cancelledAt);
  const cancelledBookings = allBookings.filter((b) => !!b.cancelledAt);
  const bookings = showCancelled ? allBookings : activeBookings;
  const pickupPointById = new Map(
    (exc.pickupPoints ?? []).map((p) => [
      p.id,
      `${p.location.name}${p.pickupTime ? ` (ore ${p.pickupTime})` : ""}`,
    ] as const),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/excursions" className="p-2 rounded-xl hover:bg-muted/50 transition-colors">
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground truncate">{exc.name}</h1>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusCfg.className}`}>
              {statusCfg.label}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{exc.location}</span>
            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{formatDate(exc.date)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowEditModal(true)}
            className="inline-flex items-center gap-1.5 bg-white hover:bg-muted/50 border border-border text-foreground text-sm font-medium px-3 py-2 rounded-xl transition-colors"
            data-testid="button-edit-excursion"
          >
            <Pencil className="w-3.5 h-3.5" />
            Modifica
          </button>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-primary mb-4 pb-2 border-b border-primary/10">
              Immagine di copertina
            </h2>
            <CoverImageUploader
              value={exc.coverImageUrl}
              onChange={async (url) => {
                await updateExcursion({ id: excursionId, data: { coverImageUrl: url } });
              }}
              testIdPrefix="excursion-cover"
            />
          </div>

          <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-primary mb-4 flex items-center gap-1.5 pb-2 border-b border-primary/10">
              <Users className="w-4 h-4" /> Stato Adesioni
            </h2>

            <div className="flex items-end gap-4 mb-4">
              <div>
                <div className="text-4xl font-bold text-foreground">{exc.adherentsCount}</div>
                <div className="text-sm text-muted-foreground">aderenti su {capacityMax} posti</div>
              </div>
              <div className="flex gap-3 pb-1">
                <div className="text-center">
                  <div className="text-xl font-bold text-accent">{exc.depositsCount}</div>
                  <div className="text-xs text-muted-foreground">acconti</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-primary">{exc.balancesCount}</div>
                  <div className="text-xs text-muted-foreground">saldi</div>
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
            <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <Users className="w-4 h-4" /> Partecipanti ({activeBookings.length})
                </h2>
                {cancelledBookings.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowCancelled((v) => !v)}
                    className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-colors ${showCancelled ? "bg-red-100 border-red-300 text-red-700" : "bg-gray-100 border-gray-200 text-gray-500 hover:bg-red-50 hover:border-red-200 hover:text-red-600"}`}
                    data-testid="button-toggle-cancelled"
                  >
                    {cancelledBookings.length} annullat{cancelledBookings.length === 1 ? "a" : "e"}
                    {showCancelled ? " ✕" : ""}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                data-testid="button-add-participant"
              >
                <Plus className="w-3.5 h-3.5" />
                Aggiungi partecipante
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/20 border-b border-border/50">
                    <th className="py-2 pl-4 pr-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nome</th>
                    <th className="py-2 px-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Posti</th>
                    <th className="py-2 px-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pagamento</th>
                    <th className="py-2 px-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Prenotato il</th>
                    <th className="py-2 pr-4 pl-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => (
                    <BookingRow
                      key={b.id}
                      booking={b}
                      excursionId={excursionId}
                      excursionName={exc.name}
                      excursionDate={exc.date}
                      excursionLocation={exc.location}
                      pricePerPerson={exc.pricePerPerson}
                      pickupPointName={b.pickupPointId ? pickupPointById.get(b.pickupPointId) ?? null : null}
                    />
                  ))}
                  {bookings.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-muted-foreground">
                        {allBookings.length === 0
                          ? "Nessuna prenotazione ancora"
                          : "Tutte le prenotazioni sono state annullate"}
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
                <span className="font-medium">{formatEur(exc.ricaviStimati)}</span>
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
              <div className="h-px bg-border/50 my-2" />
              <div className="flex justify-between font-semibold text-base">
                <span>Margine netto</span>
                <span className={exc.margineNetto >= 0 ? "text-primary" : "text-destructive"}>
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
                <div className="flex justify-between text-muted-foreground">
                  <span>− Extra</span>
                  <span>{formatEur(extraCost)}</span>
                </div>
                <div className="flex justify-between font-medium border-t border-border/50 pt-1.5">
                  <span>Margine/persona</span>
                  <span className={marginePerPersona >= 0 ? "text-primary" : "text-destructive"}>
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
                  Soglia cambio mezzo raggiunta ({exc.switchThreshold} aderenti). Valutare veicolo alternativo.
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
        </div>
      </div>

      {showAddModal && (
        <AddParticipantModal excursionId={excursionId} onClose={() => setShowAddModal(false)} />
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
