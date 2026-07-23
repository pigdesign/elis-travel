import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import {
  AlertCircle,
  Ban,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  Landmark,
  Loader2,
  MapPin,
  Ticket,
  Users,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/shared/Button";
import { useSeo } from "@/lib/seo";
import {
  buildStripeReturnUrl,
  classifyStripeReconciliationFailure,
  clearStripeRecovery,
  clearStripeReturnSignal,
  readStripeRecoveryContext,
  readStripeReturnSignal,
  saveStripeRecoveryContext,
  saveStripeReturnSignal,
  stripeReconciliationFailureFromError,
  stripeReconciliationFailureMessage,
  type StripeReconciliationFailureKind,
} from "@/lib/booking-stripe-recovery";

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as
  | string
  | undefined;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

type PaymentMethod = "card" | "bank_transfer" | "office";

class PortalRequestError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "PortalRequestError";
  }
}

type PortalData = {
  booking: {
    bookingCode: string;
    customerName: string;
    seats: number;
    paymentStatus: string;
    seatStatus: string;
    totalAmountCents: number;
    amountPaidCents: number;
    residualCents: number;
  };
  excursion: {
    name: string;
    location: string;
    date: string;
    departureAt: string | null;
    status: string;
  };
  participants: Array<{
    id: string;
    participantType: string;
    ageRangeLabel: string | null;
    firstName: string | null;
    lastName: string | null;
    pickupPointName: string | null;
    finalPriceCents: number;
  }>;
  paymentRequest: {
    id: string;
    type: string;
    amountCents: number;
    status: string;
    method: string | null;
    deadline: string | null;
    graceUntil: string | null;
    canPay: boolean;
  } | null;
  paymentMethods: { card: boolean; bankTransfer: boolean; office: boolean };
  bank: {
    iban: string | null;
    beneficiary: string | null;
    bank: string | null;
  };
  office: { address: string | null; openingHours: string | null };
  cancellation: {
    caseId: string | null;
    status: string | null;
    requestedAt: string | null;
    refundAmountCents: number | null;
    penaltyAmountCents: number | null;
    cancelledAt: string | null;
    canRequest: boolean;
  };
};

function euro(cents: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

function dateTime(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function cancellationCopy(status: string | null): {
  title: string;
  description: string;
} {
  switch (status) {
    case "pending":
      return {
        title: "Richiesta di annullamento in valutazione",
        description:
          "L'amministrazione deve ancora decidere. Nel frattempo non possono essere avviati nuovi pagamenti.",
      };
    case "approved":
    case "refunding":
      return {
        title: "Annullamento approvato",
        description:
          "La prenotazione è annullata. Gli eventuali rimborsi e le operazioni di chiusura sono in corso.",
      };
    case "manual_required":
      return {
        title: "Rimborso in lavorazione",
        description:
          "L'annullamento è approvato; l'amministrazione sta completando una parte del rimborso manualmente.",
      };
    case "completed":
      return {
        title: "Prenotazione annullata",
        description:
          "L'annullamento e le operazioni amministrative previste risultano completati.",
      };
    case "rejected":
      return {
        title: "Richiesta di annullamento non approvata",
        description:
          "La prenotazione resta attiva. Per chiarimenti, contatta l'agenzia citando il codice prenotazione.",
      };
    case "superseded":
      return {
        title: "Richiesta sostituita dall'annullamento della gita",
        description:
          "La richiesta individuale è stata assorbita dall'annullamento generale della gita. Consulta lo stato più recente o contatta l'agenzia.",
      };
    default:
      return {
        title: "Gestione annullamento",
        description: "Contatta l'agenzia se hai bisogno di assistenza.",
      };
  }
}

async function portalRequest<T>(
  token: string,
  path = "",
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api/booking-portal${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-booking-token": token,
      ...(init?.headers ?? {}),
    },
    credentials: "same-origin",
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    code?: string;
  };
  if (!response.ok) {
    throw new PortalRequestError(
      data.error || "Operazione non riuscita.",
      data.code,
    );
  }
  return data;
}

async function retryPortalStripeReconciliation(
  operation: () => Promise<unknown>,
): Promise<void> {
  let lastError: unknown;
  for (const delayMs of [0, 350, 1_000]) {
    if (delayMs > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    }
    try {
      await operation();
      return;
    } catch (error) {
      if (classifyStripeReconciliationFailure(error) === "refund_initiated") {
        throw error;
      }
      lastError = error;
    }
  }
  throw lastError;
}

function PortalCardPayment({
  token,
  paymentIntentId,
  amountCents,
  onPaid,
  onResolutionFailure,
}: {
  token: string;
  paymentIntentId: string;
  amountCents: number;
  onPaid: () => Promise<void>;
  onResolutionFailure: (failure: StripeReconciliationFailureKind) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolutionFailure, setResolutionFailure] =
    useState<StripeReconciliationFailureKind | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    const confirmation = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: { return_url: buildStripeReturnUrl(window.location.href) },
    });
    if (confirmation.error) {
      setError(confirmation.error.message || "Pagamento non riuscito.");
      setBusy(false);
      return;
    }
    const intent = confirmation.paymentIntent;
    if (
      !intent ||
      intent.id !== paymentIntentId ||
      intent.status !== "succeeded"
    ) {
      setError(
        "Il pagamento richiede ancora un'azione. Riprova o contatta l'agenzia.",
      );
      setBusy(false);
      return;
    }
    saveStripeReturnSignal({
      kind: "payment",
      intentId: intent.id,
      redirectStatus: "succeeded",
    });
    try {
      await portalRequest(token, "/payment-confirmed", {
        method: "POST",
        body: JSON.stringify({ paymentIntentId: intent.id }),
      });
      clearStripeRecovery();
      await onPaid();
    } catch (cause) {
      const failure = classifyStripeReconciliationFailure(cause);
      if (failure === "refund_initiated") clearStripeRecovery();
      setResolutionFailure(failure);
      onResolutionFailure(failure);
      setError(stripeReconciliationFailureMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <PaymentElement />
      </div>
      {error && (
        <p className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}
      <Button
        type="submit"
        disabled={!stripe || busy || resolutionFailure !== null}
        className="h-12 w-full rounded-full"
      >
        {resolutionFailure ? (
          <AlertCircle className="mr-2 h-4 w-4" />
        ) : busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <CreditCard className="mr-2 h-4 w-4" />
        )}
        {resolutionFailure === "refund_initiated"
          ? "Rimborso in verifica"
          : resolutionFailure === "pending"
            ? "Pagamento in verifica"
            : `Paga ${euro(amountCents)}`}
      </Button>
    </form>
  );
}

export function BookingPortalPage({ token }: { token: string }) {
  useSeo({
    title: "Gestisci prenotazione",
    description:
      "Area riservata per gestire il pagamento della prenotazione Elis Travel.",
    noindex: true,
  });
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyMethod, setBusyMethod] = useState<PaymentMethod | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(
    null,
  );
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentResolutionFailure, setPaymentResolutionFailure] =
    useState<StripeReconciliationFailureKind | null>(null);
  const [showCancellationForm, setShowCancellationForm] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [cancellationBusy, setCancellationBusy] = useState(false);
  const [cancellationMessage, setCancellationMessage] = useState<string | null>(
    null,
  );
  const [stripeRecovery] = useState(() => {
    const context = readStripeRecoveryContext();
    if (!context || context.flow !== "portal_payment") return null;
    const signal = readStripeReturnSignal();
    return {
      context,
      signal:
        signal?.kind === "payment" &&
        signal.intentId === context.expectedIntentId
          ? signal
          : null,
    };
  });
  const attemptId = useRef(
    stripeRecovery?.context.attemptId ??
      globalThis.crypto?.randomUUID?.() ??
      `attempt-${Date.now()}`,
  );

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "referrer";
    meta.content = "no-referrer";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  const refresh = useCallback(async () => {
    const next = await portalRequest<PortalData>(token);
    setData(next);
    setSelectedMethod(
      (current) =>
        current ?? (next.paymentRequest?.method as PaymentMethod | null),
    );
    return next;
  }, [token]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const bootstrap = async () => {
      let reconciliationError: unknown = null;
      if (
        stripeRecovery?.signal?.redirectStatus === "succeeded" &&
        stripeRecovery.signal.intentId ===
          stripeRecovery.context.expectedIntentId
      ) {
        try {
          await retryPortalStripeReconciliation(() =>
            portalRequest(token, "/payment-confirmed", {
              method: "POST",
              body: JSON.stringify({
                paymentIntentId: stripeRecovery.signal!.intentId,
              }),
            }),
          );
        } catch (cause) {
          reconciliationError = cause;
        }
      }

      let next = await refresh();
      if (!active) return;

      const reconciliationFailure = reconciliationError
        ? classifyStripeReconciliationFailure(reconciliationError)
        : null;
      const context = stripeRecovery?.context;
      if (
        context &&
        reconciliationFailure !== "refund_initiated" &&
        next.paymentRequest?.id === context.paymentRequestId &&
        next.paymentRequest.canPay &&
        next.booking.residualCents > 0
      ) {
        try {
          const resumed = await portalRequest<{
            clientSecret: string | null;
            paymentIntentId: string;
            status: string;
          }>(token, "/payment-intent", {
            method: "POST",
            body: JSON.stringify({
              paymentRequestId: context.paymentRequestId,
              attemptId: context.attemptId,
            }),
          });
          if (resumed.status === "succeeded") {
            next = await refresh();
            clearStripeRecovery();
          } else if (resumed.clientSecret) {
            setSelectedMethod("card");
            setClientSecret(resumed.clientSecret);
            setPaymentIntentId(resumed.paymentIntentId);
            saveStripeRecoveryContext({
              flow: "portal_payment",
              expectedIntentId: resumed.paymentIntentId,
              paymentRequestId: context.paymentRequestId,
              attemptId: context.attemptId,
            });
          }
        } catch (cause) {
          reconciliationError ??= cause;
        }
      } else if (context) {
        clearStripeRecovery();
      }

      if (
        stripeRecovery?.signal &&
        stripeRecovery.signal.redirectStatus !== "succeeded"
      ) {
        setError(
          "L'autenticazione della carta non è stata completata. Il medesimo tentativo è stato ripristinato: puoi riprovare senza creare un secondo pagamento.",
        );
      } else if (reconciliationFailure) {
        setPaymentResolutionFailure(reconciliationFailure);
        setError(stripeReconciliationFailureMessage(reconciliationFailure));
      }
      clearStripeReturnSignal();
    };

    void bootstrap()
      .catch((cause) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Link non valido.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refresh, stripeRecovery, token]);

  const selectOffline = async (method: "bank_transfer" | "office") => {
    if (!data?.paymentRequest || paymentResolutionFailure) return;
    setBusyMethod(method);
    setError(null);
    try {
      await portalRequest(token, "/payment-method", {
        method: "POST",
        body: JSON.stringify({
          paymentRequestId: data.paymentRequest.id,
          method,
        }),
      });
      setSelectedMethod(method);
      setClientSecret(null);
      setPaymentIntentId(null);
      clearStripeRecovery();
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Impossibile cambiare metodo.",
      );
    } finally {
      setBusyMethod(null);
    }
  };

  const startCard = async () => {
    if (!data?.paymentRequest || paymentResolutionFailure) return;
    setBusyMethod("card");
    setError(null);
    try {
      const result = await portalRequest<{
        clientSecret: string | null;
        paymentIntentId: string;
        status: string;
      }>(token, "/payment-intent", {
        method: "POST",
        body: JSON.stringify({
          paymentRequestId: data.paymentRequest.id,
          attemptId: attemptId.current,
        }),
      });
      if (result.status === "succeeded") {
        setSelectedMethod("card");
        setClientSecret(null);
        setPaymentIntentId(null);
        await refresh();
        clearStripeRecovery();
        return;
      }
      if (!result.clientSecret)
        throw new Error("Sessione carta non disponibile.");
      setSelectedMethod("card");
      setClientSecret(result.clientSecret);
      setPaymentIntentId(result.paymentIntentId);
      saveStripeRecoveryContext({
        flow: "portal_payment",
        expectedIntentId: result.paymentIntentId,
        paymentRequestId: data.paymentRequest.id,
        attemptId: attemptId.current,
      });
    } catch (cause) {
      const resolutionFailure = stripeReconciliationFailureFromError(cause);
      if (resolutionFailure) {
        if (resolutionFailure === "refund_initiated") clearStripeRecovery();
        setPaymentResolutionFailure(resolutionFailure);
        setError(stripeReconciliationFailureMessage(resolutionFailure));
        return;
      }
      if (
        cause instanceof PortalRequestError &&
        cause.code === "payment_attempt_cancelled"
      ) {
        attemptId.current =
          globalThis.crypto?.randomUUID?.() ?? `attempt-${Date.now()}`;
      }
      setError(
        cause instanceof Error
          ? cause.message
          : "Impossibile avviare il pagamento.",
      );
    } finally {
      setBusyMethod(null);
    }
  };

  const requestCancellation = async (event: React.FormEvent) => {
    event.preventDefault();
    const reason = cancellationReason.trim();
    if (!reason) {
      setError("Indica il motivo della richiesta di annullamento.");
      return;
    }
    setCancellationBusy(true);
    setError(null);
    setCancellationMessage(null);
    try {
      const result = await portalRequest<{ kind: "requested" | "cancelled" }>(
        token,
        "/cancellation",
        {
          method: "POST",
          body: JSON.stringify({ reason }),
        },
      );
      setCancellationMessage(
        result.kind === "cancelled"
          ? "La prenotazione è stata annullata e i posti sono stati liberati."
          : "Richiesta inviata. I nuovi pagamenti sono sospesi finché l'amministrazione non avrà deciso.",
      );
      setShowCancellationForm(false);
      setClientSecret(null);
      setPaymentIntentId(null);
      clearStripeRecovery();
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Impossibile inviare la richiesta di annullamento.",
      );
    } finally {
      setCancellationBusy(false);
    }
  };

  const methodOptions = useMemo(() => {
    if (!data) return [];
    return [
      data.paymentMethods.card && {
        id: "card" as const,
        label: "Carta",
        icon: CreditCard,
      },
      data.paymentMethods.bankTransfer && {
        id: "bank_transfer" as const,
        label: "Bonifico",
        icon: Landmark,
      },
      data.paymentMethods.office && {
        id: "office" as const,
        label: "In ufficio",
        icon: Building2,
      },
    ].filter(Boolean) as Array<{
      id: PaymentMethod;
      label: string;
      icon: typeof CreditCard;
    }>;
  }, [data]);

  const cancellationInProgress = data
    ? ["pending", "approved", "refunding", "manual_required"].includes(
        data.cancellation.status ?? "",
      )
    : false;
  const bookingCancelled = data
    ? Boolean(data.cancellation.cancelledAt) ||
      data.cancellation.status === "completed"
    : false;

  return (
    <div className="min-h-screen bg-[#f5f8f7]">
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
        {loading ? (
          <div className="flex min-h-[360px] items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>
        ) : error && !data ? (
          <div className="rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm">
            <AlertCircle className="mx-auto mb-3 h-9 w-9 text-red-600" />
            <h1 className="text-2xl font-bold text-foreground">
              Link non disponibile
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          </div>
        ) : data ? (
          <div className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                    <Ticket className="h-4 w-4" /> Prenotazione{" "}
                    {data.booking.bookingCode}
                  </p>
                  <h1 className="mt-2 text-2xl font-bold text-foreground">
                    {data.excursion.name}
                  </h1>
                  <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" /> {data.excursion.location}
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    {dateTime(data.excursion.departureAt) ??
                      dateTime(data.excursion.date)}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-5 py-4 text-sm">
                  <p className="text-muted-foreground">Totale</p>
                  <p className="text-xl font-bold text-foreground">
                    {euro(data.booking.totalAmountCents)}
                  </p>
                  <p className="mt-1 text-emerald-700">
                    Pagato {euro(data.booking.amountPaidCents)}
                  </p>
                </div>
              </div>
              <div className="mt-6 flex items-center gap-2 border-t border-slate-100 pt-5 text-sm text-foreground">
                <Users className="h-4 w-4 text-primary" />
                {data.booking.customerName} · {data.booking.seats}{" "}
                {data.booking.seats === 1 ? "persona" : "persone"}
              </div>
            </section>

            {cancellationMessage && (
              <p className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                {cancellationMessage}
              </p>
            )}

            {error && !data.paymentRequest && (
              <p className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </p>
            )}

            {(data.cancellation.status || data.cancellation.cancelledAt) && (
              <section
                className={`rounded-3xl border p-6 ${
                  bookingCancelled
                    ? "border-slate-300 bg-slate-100"
                    : data.cancellation.status === "rejected"
                      ? "border-red-200 bg-red-50"
                      : "border-amber-200 bg-amber-50"
                }`}
              >
                <div className="flex items-start gap-3">
                  <Ban
                    className={`mt-0.5 h-6 w-6 shrink-0 ${
                      data.cancellation.status === "rejected"
                        ? "text-red-700"
                        : bookingCancelled
                          ? "text-slate-700"
                          : "text-amber-700"
                    }`}
                  />
                  <div>
                    <h2 className="text-lg font-bold text-foreground">
                      {cancellationCopy(data.cancellation.status).title}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {cancellationCopy(data.cancellation.status).description}
                    </p>
                    {data.cancellation.requestedAt && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Richiesta inviata:{" "}
                        {dateTime(data.cancellation.requestedAt)}
                      </p>
                    )}
                    {data.cancellation.refundAmountCents !== null &&
                      data.cancellation.refundAmountCents > 0 && (
                        <p className="mt-2 text-sm font-semibold text-foreground">
                          Rimborso approvato:{" "}
                          {euro(data.cancellation.refundAmountCents)}
                        </p>
                      )}
                    {data.cancellation.penaltyAmountCents !== null &&
                      data.cancellation.penaltyAmountCents > 0 && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          Importo trattenuto:{" "}
                          {euro(data.cancellation.penaltyAmountCents)}
                        </p>
                      )}
                  </div>
                </div>
              </section>
            )}

            {bookingCancelled || cancellationInProgress ? null : data.booking
                .residualCents <= 0 || data.booking.paymentStatus === "paid" ? (
              <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-7 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-700" />
                <h2 className="mt-3 text-xl font-bold text-emerald-900">
                  Prenotazione saldata
                </h2>
                <p className="mt-1 text-sm text-emerald-800">
                  Il pagamento è completo. Non resta che partire!
                </p>
              </section>
            ) : data.paymentRequest ? (
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <h2 className="text-xl font-bold text-foreground">
                      Saldo da pagare
                    </h2>
                    <p className="mt-1 text-3xl font-bold text-primary">
                      {euro(data.paymentRequest.amountCents)}
                    </p>
                  </div>
                  <div className="text-sm text-muted-foreground sm:text-right">
                    {data.paymentRequest.deadline && (
                      <p>
                        Scadenza:{" "}
                        <strong>
                          {dateTime(data.paymentRequest.deadline)}
                        </strong>
                      </p>
                    )}
                    {data.paymentRequest.graceUntil && (
                      <p className="mt-1 text-amber-700">
                        Tolleranza amministrativa fino a{" "}
                        <strong>
                          {dateTime(data.paymentRequest.graceUntil)}
                        </strong>
                      </p>
                    )}
                  </div>
                </div>

                {!data.paymentRequest.canPay ? (
                  <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    La richiesta non è più pagabile online. Contatta l'agenzia
                    per verificare la prenotazione e i posti.
                  </div>
                ) : (
                  <>
                    <h3 className="mt-7 text-sm font-semibold text-foreground">
                      Scegli come pagare il saldo
                    </h3>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      {methodOptions.map((option) => {
                        const Icon = option.icon;
                        const active = selectedMethod === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            disabled={
                              busyMethod !== null ||
                              paymentResolutionFailure !== null
                            }
                            onClick={() =>
                              option.id === "card"
                                ? void startCard()
                                : void selectOffline(option.id)
                            }
                            className={`rounded-2xl border p-4 text-left transition ${active ? "border-primary bg-primary/5" : "border-slate-200 hover:border-primary/50"}`}
                          >
                            <Icon className="mb-2 h-5 w-5 text-primary" />
                            <span className="text-sm font-semibold text-foreground">
                              {option.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {busyMethod && (
                      <Loader2 className="mx-auto mt-6 h-5 w-5 animate-spin text-primary" />
                    )}
                    {error && (
                      <p className="mt-5 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{" "}
                        {error}
                      </p>
                    )}

                    {selectedMethod === "card" &&
                      clientSecret &&
                      paymentIntentId &&
                      stripePromise && (
                        <div className="mt-6">
                          <Elements
                            key={clientSecret}
                            stripe={stripePromise}
                            options={{ clientSecret, locale: "it" }}
                          >
                            <PortalCardPayment
                              token={token}
                              paymentIntentId={paymentIntentId}
                              amountCents={data.paymentRequest.amountCents}
                              onPaid={async () => {
                                setClientSecret(null);
                                setPaymentIntentId(null);
                                clearStripeRecovery();
                                await refresh();
                              }}
                              onResolutionFailure={setPaymentResolutionFailure}
                            />
                          </Elements>
                        </div>
                      )}

                    {selectedMethod === "bank_transfer" && (
                      <div className="mt-6 rounded-2xl bg-slate-50 p-5 text-sm">
                        <h3 className="font-semibold text-foreground">
                          Coordinate bonifico
                        </h3>
                        {data.bank.beneficiary && (
                          <p className="mt-2">
                            Intestatario:{" "}
                            <strong>{data.bank.beneficiary}</strong>
                          </p>
                        )}
                        {data.bank.iban && (
                          <p>
                            IBAN:{" "}
                            <strong className="font-mono">
                              {data.bank.iban}
                            </strong>
                          </p>
                        )}
                        {data.bank.bank && <p>Banca: {data.bank.bank}</p>}
                        <p className="mt-2">
                          Causale:{" "}
                          <strong>
                            {data.booking.bookingCode} —{" "}
                            {data.booking.customerName}
                          </strong>
                        </p>
                        <p className="mt-3 text-xs text-muted-foreground">
                          Il pagamento sarà verificato manualmente
                          dall'amministrazione.
                        </p>
                      </div>
                    )}

                    {selectedMethod === "office" && (
                      <div className="mt-6 rounded-2xl bg-slate-50 p-5 text-sm">
                        <h3 className="font-semibold text-foreground">
                          Pagamento in ufficio
                        </h3>
                        {data.office.address && (
                          <p className="mt-2">{data.office.address}</p>
                        )}
                        {data.office.openingHours && (
                          <p className="text-muted-foreground">
                            {data.office.openingHours}
                          </p>
                        )}
                        <p className="mt-3 text-xs text-muted-foreground">
                          Cita il codice {data.booking.bookingCode}. Il
                          pagamento sarà registrato manualmente.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </section>
            ) : (
              <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
                Non risultano richieste di pagamento attive. Se pensi sia un
                errore, contatta l'agenzia citando il codice{" "}
                {data.booking.bookingCode}.
              </section>
            )}

            {!bookingCancelled &&
              !cancellationInProgress &&
              data.cancellation.canRequest && (
                <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                  <h2 className="text-lg font-bold text-foreground">
                    Devi annullare la prenotazione?
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Invia una richiesta motivata all'amministrazione. Se non hai
                    ancora versato importi, l'annullamento può essere completato
                    subito; in caso contrario l'agenzia valuterà l'eventuale
                    rimborso.
                  </p>

                  {showCancellationForm ? (
                    <form
                      onSubmit={requestCancellation}
                      className="mt-5 space-y-4"
                    >
                      <label className="block text-sm font-medium text-foreground">
                        Motivo della richiesta
                        <textarea
                          value={cancellationReason}
                          onChange={(event) =>
                            setCancellationReason(event.target.value)
                          }
                          maxLength={1000}
                          rows={4}
                          disabled={cancellationBusy}
                          className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                          placeholder="Spiega brevemente perché vuoi annullare"
                        />
                      </label>
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                        L'invio sospende nuovi pagamenti ma non promette
                        automaticamente un rimborso: l'esito e l'importo saranno
                        comunicati dall'agenzia.
                      </div>
                      {error && (
                        <p className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{" "}
                          {error}
                        </p>
                      )}
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <Button
                          type="submit"
                          disabled={cancellationBusy}
                          className="rounded-full"
                        >
                          {cancellationBusy && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          Invia richiesta
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={cancellationBusy}
                          className="rounded-full"
                          onClick={() => {
                            setShowCancellationForm(false);
                            setError(null);
                          }}
                        >
                          Torna indietro
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-5 rounded-full border-red-200 text-red-700 hover:bg-red-50"
                      onClick={() => {
                        setShowCancellationForm(true);
                        setError(null);
                      }}
                    >
                      <Ban className="mr-2 h-4 w-4" />
                      Richiedi annullamento
                    </Button>
                  )}
                </section>
              )}
          </div>
        ) : null}
      </main>
      <Footer />
    </div>
  );
}
