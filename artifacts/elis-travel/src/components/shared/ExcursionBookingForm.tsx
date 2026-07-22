import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/shared/Button";
import { useQueryClient } from "@tanstack/react-query";
import {
  quotePublicExcursion,
  createPublicExcursionBooking,
  confirmPublicExcursionBookingPayment,
  confirmPublicExcursionBookingCardSetup,
  getGetPublicExcursionQueryKey,
} from "@workspace/api-client-react";
import type {
  PublicExcursionDetail,
  QuoteParticipantInput,
  QuoteResponse,
  PublicBookingResponse,
} from "@workspace/api-client-react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import {
  Ticket,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Minus,
  Plus,
  Landmark,
  Building2,
  CreditCard,
  Clock,
  ArrowLeft,
  Check,
} from "lucide-react";
import {
  PARTICIPANT_NAME_MAX_LENGTH,
  emptyParticipantName,
  resizeParticipantNames,
  resizeStrings,
  syncUntouchedPrimaryParticipantName,
  updateParticipantName,
  type ParticipantNameDraft,
} from "@/lib/booking-participants";
import {
  buildHomePickupBookingFields,
  canRequestHomePickup,
} from "@/lib/excursion-home-pickup";
import {
  buildStripeReturnUrl,
  classifyStripeReconciliationFailure,
  clearStripeRecovery,
  paymentIntentIdFromClientSecret,
  readStripeRecoveryContext,
  readStripeReturnSignal,
  readVolatileStripeClientSecret,
  saveStripeRecoveryContext,
  saveStripeReturnSignal,
  setupIntentIdFromClientSecret,
  stripeReconciliationFailureMessage,
  type PublicBookingRecoverySummary,
  type StripeReconciliationFailureKind,
} from "@/lib/booking-stripe-recovery";

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as
  | string
  | undefined;
const stripePromise = stripePublishableKey
  ? loadStripe(stripePublishableKey)
  : null;

function formatEuro(cents: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

function formatDeadline(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function createBookingAttemptId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  // Fallback solo per browser datati: genera comunque un UUID v4 valido.
  const bytes = new Uint8Array(16);
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10";

function bookingRecoverySummary(
  booking: PublicBookingResponse,
): PublicBookingRecoverySummary {
  return {
    id: booking.id,
    bookingCode: booking.bookingCode,
    seats: booking.seats,
    totalCents: booking.totalCents,
    amountDueCents: booking.amountDueCents,
    paymentType: booking.paymentType,
    paymentMethod: booking.paymentMethod,
    paymentStatus: booking.paymentStatus,
    paymentDeadline: booking.paymentDeadline,
    paymentGraceUntil: booking.paymentGraceUntil,
    message: booking.message,
    cardFlow: booking.cardFlow,
  };
}

async function retryPublicStripeReconciliation(
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

function Stepper({
  value,
  min,
  max,
  onChange,
  testId,
}: {
  value: number;
  min: number;
  max?: number;
  onChange: (v: number) => void;
  testId?: string;
}) {
  return (
    <div className="flex items-center gap-3" data-testid={testId}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-foreground transition hover:border-accent hover:text-accent disabled:opacity-30"
        aria-label="Diminuisci"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="w-6 text-center text-base font-semibold text-foreground">
        {value}
      </span>
      <button
        type="button"
        onClick={() =>
          onChange(max !== undefined ? Math.min(max, value + 1) : value + 1)
        }
        disabled={max !== undefined && value >= max}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-foreground transition hover:border-accent hover:text-accent disabled:opacity-30"
        aria-label="Aumenta"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

// Etichetta punto di raccolta per select/righe: "Andora – supplemento 10 €" o "Nessun supplemento"
function pickupOptionLabel(
  p: NonNullable<PublicExcursionDetail["pickupPoints"]>[number],
) {
  const parts = [p.name];
  if (p.province) parts.push(`(${p.province})`);
  if (p.pickupTime) parts.push(`· ore ${p.pickupTime}`);
  const surcharge = p.surcharge ?? 0;
  parts.push(
    surcharge > 0
      ? `· supplemento ${formatEuro(Math.round(surcharge * 100))}`
      : "· nessun supplemento",
  );
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Step pagamento con carta (PaymentIntent + PaymentElement)
// ---------------------------------------------------------------------------

function StripePaymentStep({
  excursionId,
  booking,
  onBack,
  onSuccess,
}: {
  excursionId: string;
  booking: PublicBookingResponse;
  onBack?: () => void;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [cardError, setCardError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [reconciliationFailure, setReconciliationFailure] =
    useState<StripeReconciliationFailureKind | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setCardError(null);
    setIsConfirming(true);

    const clientSecret = booking.stripeClientSecret;
    const expectedIntentId = clientSecret
      ? paymentIntentIdFromClientSecret(clientSecret)
      : null;
    if (expectedIntentId) {
      saveStripeRecoveryContext({
        flow: "public_payment",
        expectedIntentId,
        excursionId,
        booking: bookingRecoverySummary(booking),
      });
    }

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: { return_url: buildStripeReturnUrl(window.location.href) },
    });

    if (error) {
      setCardError(error.message ?? "Errore durante il pagamento. Riprova.");
      setIsConfirming(false);
      return;
    }
    if (!paymentIntent || paymentIntent.status !== "succeeded") {
      setCardError(
        "Il pagamento non risulta completato. Riprova o scegli un altro metodo.",
      );
      setIsConfirming(false);
      return;
    }

    saveStripeReturnSignal({
      kind: "payment",
      intentId: paymentIntent.id,
      redirectStatus: "succeeded",
    });

    try {
      await confirmPublicExcursionBookingPayment(excursionId, booking.id, {
        paymentIntentId: paymentIntent.id,
      });
    } catch (cause) {
      const failure = classifyStripeReconciliationFailure(cause);
      if (failure === "refund_initiated") clearStripeRecovery();
      setReconciliationFailure(failure);
      setCardError(stripeReconciliationFailureMessage(failure));
      setIsConfirming(false);
      return;
    }
    clearStripeRecovery();
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <p className="text-sm font-semibold text-foreground">
        Importo da pagare ora: {formatEuro(booking.amountDueCents)}
        {booking.paymentType === "deposit" && (
          <span className="ml-1 font-normal text-muted-foreground">
            (acconto — residuo{" "}
            {formatEuro(booking.totalCents - booking.amountDueCents)})
          </span>
        )}
      </p>
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5">
        <PaymentElement />
      </div>
      {cardError && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{cardError}</span>
        </div>
      )}
      <Button
        type="submit"
        disabled={isConfirming || !stripe || reconciliationFailure !== null}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
      >
        {reconciliationFailure ? (
          <>
            <AlertCircle className="h-4 w-4" />
            {reconciliationFailure === "refund_initiated"
              ? "Rimborso in verifica"
              : "Pagamento in verifica"}
          </>
        ) : isConfirming ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Pagamento in corso…
          </>
        ) : (
          <>
            <CreditCard className="h-4 w-4" />
            Paga {formatEuro(booking.amountDueCents)}
          </>
        )}
      </Button>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          disabled={isConfirming || reconciliationFailure !== null}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          ← Torna al riepilogo
        </button>
      )}
      <p className="text-center text-xs text-muted-foreground">
        Pagamento sicuro gestito da Stripe. I tuoi dati non vengono mai
        condivisi con noi.
      </p>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Salvataggio carta (SetupIntent): nessun addebito in questa fase
// ---------------------------------------------------------------------------

function StripeSetupStep({
  excursionId,
  booking,
  onBack,
  onSuccess,
}: {
  excursionId: string;
  booking: PublicBookingResponse;
  onBack?: () => void;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [cardError, setCardError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmedSetupIntentId, setConfirmedSetupIntentId] = useState<
    string | null
  >(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setCardError(null);
    setIsConfirming(true);

    let setupIntentId = confirmedSetupIntentId;
    if (!setupIntentId) {
      const clientSecret = booking.stripeSetupClientSecret;
      const expectedIntentId = clientSecret
        ? setupIntentIdFromClientSecret(clientSecret)
        : null;
      if (expectedIntentId) {
        saveStripeRecoveryContext({
          flow: "public_setup",
          expectedIntentId,
          excursionId,
          booking: bookingRecoverySummary(booking),
        });
      }
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: "if_required",
        confirmParams: {
          return_url: buildStripeReturnUrl(window.location.href),
        },
      });
      if (error) {
        setCardError(
          error.message ?? "Non è stato possibile salvare la carta. Riprova.",
        );
        setIsConfirming(false);
        return;
      }
      if (!setupIntent || setupIntent.status !== "succeeded") {
        setCardError(
          "La carta non risulta salvata. Riprova o scegli un altro metodo.",
        );
        setIsConfirming(false);
        return;
      }
      setupIntentId = setupIntent.id;
      setConfirmedSetupIntentId(setupIntent.id);
      saveStripeReturnSignal({
        kind: "setup",
        intentId: setupIntent.id,
        redirectStatus: "succeeded",
      });
    }

    try {
      await confirmPublicExcursionBookingCardSetup(excursionId, booking.id, {
        setupIntentId,
      });
      clearStripeRecovery();
      onSuccess();
    } catch (err: unknown) {
      const apiError = err as { data?: { error?: string }; message?: string };
      setCardError(
        apiError?.data?.error ??
          apiError?.message ??
          "La carta è stata acquisita, ma la verifica non è terminata. Premi di nuovo il pulsante senza reinserire i dati.",
      );
      setIsConfirming(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <strong>Nessun addebito ora.</strong> La carta verrà salvata in modo
        sicuro. L'acconto di{" "}
        <strong>{formatEuro(booking.amountDueCents)}</strong> sarà addebitato
        soltanto se la gita verrà confermata.
      </div>
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5">
        <PaymentElement />
      </div>
      {cardError && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{cardError}</span>
        </div>
      )}
      <Button
        type="submit"
        disabled={isConfirming || !stripe}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
      >
        {isConfirming ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Verifica in corso…
          </>
        ) : confirmedSetupIntentId ? (
          <>
            <Check className="h-4 w-4" />
            Completa la verifica
          </>
        ) : (
          <>
            <CreditCard className="h-4 w-4" />
            Salva carta senza addebito
          </>
        )}
      </Button>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          disabled={isConfirming || Boolean(confirmedSetupIntentId)}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          ← Torna al riepilogo
        </button>
      )}
      <p className="text-center text-xs text-muted-foreground">
        I dati della carta sono gestiti da Stripe e non vengono memorizzati sui
        sistemi ElisTravel.
      </p>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Form principale
// ---------------------------------------------------------------------------

type Step = "form" | "summary" | "stripe" | "instructions" | "done";
type BookingParticipantDraftInput = QuoteParticipantInput & {
  firstName: string;
  lastName: string;
};

export function ExcursionBookingForm({
  excursion,
}: {
  excursion: PublicExcursionDetail;
}) {
  const queryClient = useQueryClient();
  const excursionId = excursion.id;
  const [stripeRecovery] = useState(() => {
    const context = readStripeRecoveryContext();
    const signal = readStripeReturnSignal();
    if (
      !context ||
      !signal ||
      (context.flow !== "public_payment" && context.flow !== "public_setup") ||
      context.excursionId !== excursionId ||
      context.expectedIntentId !== signal.intentId ||
      (context.flow === "public_payment" && signal.kind !== "payment") ||
      (context.flow === "public_setup" && signal.kind !== "setup")
    ) {
      return null;
    }
    return {
      context,
      signal,
      clientSecret: readVolatileStripeClientSecret(signal.intentId),
    };
  });
  const isRident = excursion.tripType === "rident";
  const points = (excursion.pickupPoints ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const hasPickupPoints = points.length > 0;
  const homePickupAvailable = canRequestHomePickup({
    tripType: isRident ? "rident" : "standard",
    hasPickupPoints,
  });
  const ageRanges = excursion.ageRanges ?? [];
  const spotsLeft = excursion.spotsLeft ?? null;
  const depositConfig = excursion.depositConfig;
  const depositAvailable = depositConfig?.available === true;
  const methods = excursion.paymentMethods ?? {
    card: false,
    bankTransfer: true,
    office: true,
  };
  const thresholdReached = excursion.thresholdReached === true;
  const adultLabel = excursion.adultLabel ?? "Adulti (18+ anni)";
  const savedCardDepositAvailable =
    methods.card && excursion.cardFlow === "save_for_confirmation";
  const depositMethodAvailable =
    savedCardDepositAvailable || methods.bankTransfer || methods.office;
  const effectiveDepositAvailable = depositAvailable && depositMethodAvailable;

  // Referente
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  // Gite normali
  const [adults, setAdults] = useState(1);
  const [adultNames, setAdultNames] = useState<ParticipantNameDraft[]>([
    emptyParticipantName(),
  ]);
  const [childAgeRangeIds, setChildAgeRangeIds] = useState<string[]>([]);
  const [childNames, setChildNames] = useState<ParticipantNameDraft[]>([]);
  const [pickupPointId, setPickupPointId] = useState("");
  const [servizioCasa, setServizioCasa] = useState(false);
  const [homePickupAddress, setHomePickupAddress] = useState("");
  // Gite RIDENT
  const [patients, setPatients] = useState(1);
  const [patientNames, setPatientNames] = useState<ParticipantNameDraft[]>([
    emptyParticipantName(),
  ]);
  const [companions, setCompanions] = useState(0);
  const [companionNames, setCompanionNames] = useState<ParticipantNameDraft[]>(
    [],
  );
  const [patientPickups, setPatientPickups] = useState<string[]>([""]);
  const [companionPickups, setCompanionPickups] = useState<string[]>([]);
  // Pagamento
  const [paymentType, setPaymentType] = useState<"deposit" | "full">(
    effectiveDepositAvailable ? "deposit" : "full",
  );
  const defaultMethod =
    effectiveDepositAvailable && savedCardDepositAvailable
      ? "card"
      : methods.bankTransfer
        ? "bank_transfer"
        : methods.office
          ? "office"
          : "card";
  const [paymentMethod, setPaymentMethod] = useState<
    "card" | "bank_transfer" | "office"
  >(defaultMethod);
  // Consensi
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [mediaAccepted, setMediaAccepted] = useState(false);
  const [futureChargeConsent, setFutureChargeConsent] = useState(false);
  // Rimane invariato tra retry/doppio click: il backend riconosce lo stesso
  // tentativo e restituisce la prenotazione gia creata senza occupare altri posti.
  const [bookingAttemptId] = useState(createBookingAttemptId);

  const [step, setStep] = useState<Step>("form");
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [booking, setBooking] = useState<PublicBookingResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isRecoveringStripe, setIsRecoveringStripe] = useState(
    stripeRecovery?.signal.redirectStatus === "succeeded",
  );
  const [stripeReconciliationFailure, setStripeReconciliationFailure] =
    useState<StripeReconciliationFailureKind | null>(null);

  useEffect(() => {
    if (!stripeRecovery) return;
    let active = true;
    const { context, signal, clientSecret } = stripeRecovery;
    const restoredBooking: PublicBookingResponse = {
      ...context.booking,
      stripeClientSecret:
        context.flow === "public_payment" ? clientSecret : null,
      stripeSetupClientSecret:
        context.flow === "public_setup" ? clientSecret : null,
    };

    const recover = async () => {
      if (signal.redirectStatus !== "succeeded") {
        if (!clientSecret) {
          setErrorMsg(
            "La verifica Stripe non si è conclusa e la sessione non è più recuperabile da questa pagina. Non creare una seconda prenotazione: usa il link ricevuto via email o contatta l'agenzia citando il codice " +
              context.booking.bookingCode +
              ".",
          );
          return;
        }
        setBooking(restoredBooking);
        setStep("stripe");
        setErrorMsg(
          "L'autenticazione della carta non è stata completata. Puoi riprovare sullo stesso tentativo, senza creare una nuova prenotazione.",
        );
        return;
      }

      try {
        await retryPublicStripeReconciliation(() =>
          context.flow === "public_payment"
            ? confirmPublicExcursionBookingPayment(
                context.excursionId,
                context.booking.id,
                { paymentIntentId: signal.intentId },
              )
            : confirmPublicExcursionBookingCardSetup(
                context.excursionId,
                context.booking.id,
                { setupIntentId: signal.intentId },
              ),
        );
        if (!active) return;
        setBooking(restoredBooking);
        setStep("done");
        clearStripeRecovery();
        void queryClient.invalidateQueries({
          queryKey: getGetPublicExcursionQueryKey(excursionId),
        });
      } catch (cause) {
        if (!active) return;
        const failure = classifyStripeReconciliationFailure(cause);
        setBooking(restoredBooking);
        setStripeReconciliationFailure(failure);
        if (failure === "refund_initiated") clearStripeRecovery();
      } finally {
        if (active) setIsRecoveringStripe(false);
      }
    };

    void recover();
    return () => {
      active = false;
    };
  }, [excursionId, queryClient, stripeRecovery]);

  const children = childAgeRangeIds.length;
  const totalPeople = isRident ? patients + companions : adults + children;
  const maxPeople = spotsLeft !== null ? spotsLeft : undefined;
  const saveCardForConfirmation =
    excursion.cardFlow === "save_for_confirmation" &&
    paymentType === "deposit" &&
    paymentMethod === "card";
  const cardAvailableForSelection =
    methods.card &&
    (paymentType === "full" || excursion.cardFlow === "save_for_confirmation");

  const chooseDepositPayment = () => {
    setPaymentType("deposit");
    if (
      paymentMethod === "card" &&
      excursion.cardFlow !== "save_for_confirmation"
    ) {
      if (methods.bankTransfer) setPaymentMethod("bank_transfer");
      else if (methods.office) setPaymentMethod("office");
    }
  };

  const syncPrimaryParticipantFromContact = (
    field: "firstName" | "lastName",
    value: string,
  ) => {
    const setter = isRident ? setPatientNames : setAdultNames;
    setter((previous) =>
      syncUntouchedPrimaryParticipantName(previous, field, value),
    );
  };

  const setAdultsCount = (count: number) => {
    setAdults(count);
    setAdultNames((previous) => resizeParticipantNames(previous, count));
  };

  const setChildrenCount = (n: number) => {
    setChildAgeRangeIds((prev) => {
      const next = prev.slice(0, n);
      while (next.length < n) next.push("");
      return next;
    });
    setChildNames((previous) => resizeParticipantNames(previous, n));
  };

  const setRidentCounts = (p: number, c: number) => {
    setPatients(p);
    setCompanions(c);
    setPatientNames((previous) => resizeParticipantNames(previous, p));
    setCompanionNames((previous) => resizeParticipantNames(previous, c));
    setPatientPickups((previous) => resizeStrings(previous, p));
    setCompanionPickups((previous) => resizeStrings(previous, c));
  };

  const buildParticipants = (): BookingParticipantDraftInput[] => {
    if (isRident) {
      const list: BookingParticipantDraftInput[] = [];
      for (let i = 0; i < patients; i++) {
        const identity = patientNames[i] ?? emptyParticipantName();
        list.push({
          type: "patient",
          firstName: identity.firstName.trim(),
          lastName: identity.lastName.trim(),
          pickupPointId: patientPickups[i] || null,
        });
      }
      for (let i = 0; i < companions; i++) {
        const identity = companionNames[i] ?? emptyParticipantName();
        list.push({
          type: "companion",
          firstName: identity.firstName.trim(),
          lastName: identity.lastName.trim(),
          pickupPointId: companionPickups[i] || null,
        });
      }
      return list;
    }
    return [
      ...adultNames.slice(0, adults).map((identity) => ({
        type: "adult" as const,
        firstName: identity.firstName.trim(),
        lastName: identity.lastName.trim(),
      })),
      ...childAgeRangeIds.map((rangeId, index) => {
        const identity = childNames[index] ?? emptyParticipantName();
        return {
          type: "child" as const,
          firstName: identity.firstName.trim(),
          lastName: identity.lastName.trim(),
          ageRangeId: rangeId || null,
        };
      }),
    ];
  };

  const validateForm = (): string | null => {
    if (!firstName.trim() || !lastName.trim())
      return "Nome e cognome sono obbligatori.";
    if (!email.trim()) return "L'email è obbligatoria.";
    if (!phone.trim()) return "Il numero di telefono è obbligatorio.";
    if (
      firstName.trim().length > PARTICIPANT_NAME_MAX_LENGTH ||
      lastName.trim().length > PARTICIPANT_NAME_MAX_LENGTH
    ) {
      return `Nome e cognome del referente possono contenere al massimo ${PARTICIPANT_NAME_MAX_LENGTH} caratteri.`;
    }
    const participantInputs = buildParticipants();
    for (let index = 0; index < participantInputs.length; index += 1) {
      const participant = participantInputs[index];
      if (!participant?.firstName?.trim() || !participant.lastName?.trim()) {
        return `Inserisci nome e cognome per il partecipante ${index + 1}.`;
      }
      if (
        participant.firstName.length > PARTICIPANT_NAME_MAX_LENGTH ||
        participant.lastName.length > PARTICIPANT_NAME_MAX_LENGTH
      ) {
        return `Nome e cognome del partecipante ${index + 1} possono contenere al massimo ${PARTICIPANT_NAME_MAX_LENGTH} caratteri.`;
      }
    }
    if (isRident) {
      if (patients < 1) return "Serve almeno un paziente.";
      if (hasPickupPoints) {
        for (let i = 0; i < patients; i++) {
          if (!patientPickups[i])
            return `Seleziona il punto di raccolta per il paziente ${i + 1}.`;
        }
        for (let i = 0; i < companions; i++) {
          if (!companionPickups[i])
            return `Seleziona il punto di raccolta per l'accompagnatore ${i + 1}.`;
        }
      }
    } else {
      if (adults < 1) return "Serve almeno un adulto.";
      for (let i = 0; i < childAgeRangeIds.length; i++) {
        if (!childAgeRangeIds[i])
          return `Seleziona la fascia età per il bambino ${i + 1}.`;
      }
      if (hasPickupPoints && !pickupPointId)
        return "Seleziona il punto di raccolta.";
    }
    if (servizioCasa && !homePickupAddress.trim()) {
      return "Inserisci l'indirizzo completo per il servizio di trasporto da casa.";
    }
    if (homePickupAddress.trim().length > 500) {
      return "L'indirizzo per il servizio da casa non può superare 500 caratteri.";
    }
    if (maxPeople !== undefined && totalPeople > maxPeople) {
      return `Sono rimasti solo ${maxPeople} posti disponibili.`;
    }
    if (!termsAccepted)
      return "Devi accettare i Termini e Condizioni per prenotare.";
    if (!privacyAccepted)
      return "Devi accettare l'Informativa Privacy per prenotare.";
    if (saveCardForConfirmation && !futureChargeConsent) {
      return "Devi autorizzare il salvataggio della carta e l'addebito dell'acconto alla conferma della gita.";
    }
    if (
      paymentType === "deposit" &&
      paymentMethod === "card" &&
      excursion.cardFlow !== "save_for_confirmation"
    ) {
      return "Per l'acconto la carta non è disponibile: scegli l'importo completo oppure bonifico o pagamento in ufficio.";
    }
    return null;
  };

  const goToSummary = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const validationError = validateForm();
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }
    setIsBusy(true);
    try {
      const q = await quotePublicExcursion(excursionId, {
        participants: buildParticipants(),
        pickupPointId: !isRident && pickupPointId ? pickupPointId : null,
        paymentType,
      });
      setQuote(q);
      setStep("summary");
    } catch (err: unknown) {
      const e2 = err as { data?: { error?: string }; message?: string };
      setErrorMsg(
        e2?.data?.error ??
          e2?.message ??
          "Impossibile calcolare il preventivo. Riprova.",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const confirmBooking = async () => {
    if (!quote) return;
    setErrorMsg(null);
    setIsBusy(true);
    try {
      const res = await createPublicExcursionBooking(excursionId, {
        bookingAttemptId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        participants: buildParticipants(),
        pickupPointId: !isRident && pickupPointId ? pickupPointId : null,
        paymentType,
        paymentMethod,
        quotedTotalCents: quote.totalCents,
        quotedAmountDueCents: quote.amountDueCents,
        futureChargeConsent: saveCardForConfirmation
          ? futureChargeConsent
          : undefined,
        consents: {
          terms: termsAccepted,
          privacy: privacyAccepted,
          media: mediaAccepted,
        },
        ...buildHomePickupBookingFields(servizioCasa, homePickupAddress),
      });
      setBooking(res);
      void queryClient.invalidateQueries({
        queryKey: getGetPublicExcursionQueryKey(excursionId),
      });
      if (res.cardFlow === "no_payment_required") {
        setStep("done");
      } else if (res.stripeClientSecret || res.stripeSetupClientSecret) {
        setStep("stripe");
      } else if (
        res.paymentMethod === "card" &&
        (res.paymentStatus === "card_saved" || res.paymentStatus === "paid")
      ) {
        // Recupero idempotente dopo una risposta persa: Stripe/il webhook
        // avevano gia concluso l'operazione, quindi non chiediamo di ripeterla.
        setStep("done");
      } else {
        setStep("instructions");
      }
    } catch (err: unknown) {
      const e2 = err as {
        data?: { error?: string; code?: string };
        message?: string;
      };
      if (e2?.data?.code === "QUOTE_CHANGED") {
        try {
          const refreshedQuote = await quotePublicExcursion(excursionId, {
            participants: buildParticipants(),
            pickupPointId: !isRident && pickupPointId ? pickupPointId : null,
            paymentType,
          });
          setQuote(refreshedQuote);
          setErrorMsg(
            "Il prezzo è cambiato. Abbiamo aggiornato il riepilogo: controlla il nuovo totale e conferma di nuovo.",
          );
          setStep("summary");
          return;
        } catch {
          setErrorMsg(
            "Il prezzo è cambiato e non è stato possibile aggiornare il preventivo. Torna ai dati e riprova.",
          );
          setStep("form");
          return;
        }
      }
      setErrorMsg(
        e2?.data?.error ??
          e2?.message ??
          "Impossibile completare la prenotazione. Riprova.",
      );
      setStep("form");
    } finally {
      setIsBusy(false);
    }
  };

  const cardShell = (children: React.ReactNode) => (
    <div
      id="prenota"
      className="rounded-[30px] border border-slate-200/70 bg-white p-6 shadow-[0_18px_50px_rgba(20,36,43,0.08)] md:p-8"
      data-testid="card-booking-form"
    >
      {children}
    </div>
  );

  if (isRecoveringStripe && stripeRecovery) {
    return cardShell(
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-foreground">
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
        Stiamo verificando con Stripe l'esito dell'operazione. Non chiudere la
        pagina e non ripetere il pagamento.
      </div>,
    );
  }

  if (stripeReconciliationFailure && booking) {
    return cardShell(
      <div
        className={`rounded-2xl border p-5 text-sm ${
          stripeReconciliationFailure === "refund_initiated"
            ? "border-red-200 bg-red-50 text-red-900"
            : "border-amber-200 bg-amber-50 text-amber-900"
        }`}
      >
        <h2 className="font-semibold">
          {stripeReconciliationFailure === "refund_initiated"
            ? "Pagamento destinato al rimborso"
            : "Verifica del pagamento in corso"}
        </h2>
        <p className="mt-2">
          Prenotazione <strong>{booking.bookingCode}</strong>.{" "}
          {stripeReconciliationFailureMessage(stripeReconciliationFailure)}
        </p>
      </div>,
    );
  }

  // --- Posti esauriti / prenotazioni chiuse ---
  if (
    !stripeRecovery &&
    !booking &&
    (excursion.bookingClosed === true || (spotsLeft !== null && spotsLeft <= 0))
  ) {
    return (
      <div
        id="prenota"
        className="rounded-[30px] border border-red-200 bg-red-50 p-6 shadow-[0_18px_50px_rgba(20,36,43,0.08)] md:p-8"
        data-testid="card-booking-soldout"
      >
        <h2 className="mb-2 flex items-center gap-2 text-xl font-serif font-bold text-red-800">
          <AlertCircle className="h-5 w-5" />
          {excursion.bookingClosed ? "Prenotazioni chiuse" : "Posti esauriti"}
        </h2>
        <p className="text-sm leading-relaxed text-red-700">
          {excursion.bookingClosed
            ? "Le prenotazioni per questa gita sono chiuse. Contattaci per verificare eventuali disponibilità."
            : "Tutti i posti per questa gita sono già stati prenotati. Contattaci per essere inserito in lista d'attesa o verificare nuove disponibilità."}
        </p>
      </div>
    );
  }

  // --- Completato ---
  if (step === "done" && booking) {
    const cardSavedForConfirmation =
      booking.cardFlow === "save_for_confirmation";
    const noPaymentRequired = booking.cardFlow === "no_payment_required";
    return (
      <div
        id="prenota"
        className="rounded-[30px] border border-emerald-200 bg-emerald-50 p-6 shadow-[0_18px_50px_rgba(20,36,43,0.08)] md:p-8"
        data-testid="card-booking-success"
      >
        <h2 className="mb-3 flex items-center gap-2 text-xl font-serif font-bold text-emerald-800">
          <CheckCircle2 className="h-5 w-5" />
          {noPaymentRequired
            ? "Prenotazione gratuita confermata"
            : cardSavedForConfirmation
              ? "Carta salvata"
              : "Pagamento completato!"}
        </h2>
        <p className="text-sm text-emerald-900">
          {noPaymentRequired ? (
            <>
              La prenotazione <strong>{booking.bookingCode}</strong> è
              confermata e non è richiesto alcun pagamento. Riceverai una email
              di riepilogo con tutti i dettagli.
            </>
          ) : cardSavedForConfirmation ? (
            <>
              La prenotazione <strong>{booking.bookingCode}</strong> è
              registrata e non è stato effettuato alcun addebito. L'acconto di{" "}
              {formatEuro(booking.amountDueCents)} sarà addebitato soltanto se
              la gita verrà confermata.
            </>
          ) : (
            <>
              La tua prenotazione <strong>{booking.bookingCode}</strong> è
              confermata. Riceverai una email di riepilogo con tutti i dettagli.
            </>
          )}
        </p>
      </div>
    );
  }

  // --- Istruzioni bonifico / ufficio ---
  if (step === "instructions" && booking) {
    return cardShell(
      <>
        <h2 className="mb-3 flex items-center gap-2 text-xl font-serif font-bold text-foreground">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          Prenotazione registrata: {booking.bookingCode}
        </h2>
        <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
          {booking.message}
        </p>

        <div className="mb-5 space-y-2 rounded-2xl border border-slate-200 bg-[#f7faf9] p-5 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Importo da pagare</span>
            <strong className="text-foreground">
              {formatEuro(booking.amountDueCents)}
            </strong>
          </div>
          {booking.paymentType === "deposit" && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">
                Residuo dopo l'acconto
              </span>
              <span className="text-foreground">
                {formatEuro(booking.totalCents - booking.amountDueCents)}
              </span>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Scadenza pagamento</span>
            <strong className="capitalize text-accent">
              {formatDeadline(booking.paymentDeadline)}
            </strong>
          </div>
        </div>

        {booking.bank && (
          <div className="mb-5 rounded-2xl border border-slate-200 p-5 text-sm">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-foreground">
              <Landmark className="h-4 w-4 text-primary" />
              Coordinate per il bonifico
            </h3>
            <dl className="space-y-2">
              {booking.bank.beneficiary && (
                <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
                  <dt className="text-muted-foreground">Intestatario</dt>
                  <dd className="font-medium text-foreground">
                    {booking.bank.beneficiary}
                  </dd>
                </div>
              )}
              {booking.bank.iban && (
                <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
                  <dt className="text-muted-foreground">IBAN</dt>
                  <dd className="font-mono font-medium text-foreground">
                    {booking.bank.iban}
                  </dd>
                </div>
              )}
              {booking.bank.bank && (
                <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
                  <dt className="text-muted-foreground">Banca</dt>
                  <dd className="font-medium text-foreground">
                    {booking.bank.bank}
                  </dd>
                </div>
              )}
              <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
                <dt className="text-muted-foreground">
                  Causale (obbligatoria)
                </dt>
                <dd className="font-medium text-foreground">
                  {booking.bank.causale}
                </dd>
              </div>
            </dl>
          </div>
        )}

        {booking.office && (
          <div className="mb-5 rounded-2xl border border-slate-200 p-5 text-sm">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-foreground">
              <Building2 className="h-4 w-4 text-primary" />
              Pagamento in ufficio
            </h3>
            {booking.office.address && (
              <p className="mb-1 text-foreground">{booking.office.address}</p>
            )}
            {booking.office.openingHours && (
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {booking.office.openingHours}
              </p>
            )}
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Il posto è riservato temporaneamente fino alla scadenza indicata.
              Cita il codice prenotazione <strong>{booking.bookingCode}</strong>{" "}
              al momento del pagamento.
            </p>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Riceverai una email con il riepilogo e queste istruzioni. Per
          qualsiasi dubbio contattaci citando il codice {booking.bookingCode}.
        </p>
      </>,
    );
  }

  // --- Pagamento o salvataggio carta ---
  if (
    step === "stripe" &&
    booking &&
    (booking.stripeClientSecret || booking.stripeSetupClientSecret)
  ) {
    if (!stripePromise) {
      return cardShell(
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="mb-1 font-semibold">Pagamento non configurato</p>
            <p>
              La chiave Stripe pubblica non è impostata (
              <code>VITE_STRIPE_PUBLISHABLE_KEY</code>). Contattaci per
              completare il pagamento.
            </p>
          </div>
        </div>,
      );
    }
    if (
      booking.cardFlow === "save_for_confirmation" &&
      booking.stripeSetupClientSecret
    ) {
      return cardShell(
        <>
          <h2 className="mb-1 flex items-center gap-2 text-xl font-serif font-bold text-foreground">
            <CreditCard className="h-5 w-5 text-accent" />
            Salva la carta
          </h2>
          <p className="mb-5 text-sm text-muted-foreground">
            Prenotazione <strong>{booking.bookingCode}</strong> — completa il
            salvataggio sicuro della carta per mantenere riservato il posto.
          </p>
          <Elements
            stripe={stripePromise}
            options={{ clientSecret: booking.stripeSetupClientSecret }}
          >
            <StripeSetupStep
              excursionId={excursionId}
              booking={booking}
              onBack={stripeRecovery ? undefined : () => setStep("summary")}
              onSuccess={() => {
                void queryClient.invalidateQueries({
                  queryKey: getGetPublicExcursionQueryKey(excursionId),
                });
                setStep("done");
              }}
            />
          </Elements>
        </>,
      );
    }
    return cardShell(
      <>
        <h2 className="mb-1 flex items-center gap-2 text-xl font-serif font-bold text-foreground">
          <CreditCard className="h-5 w-5 text-accent" />
          Pagamento con carta
        </h2>
        <p className="mb-5 text-sm text-muted-foreground">
          Prenotazione <strong>{booking.bookingCode}</strong> — completa il
          pagamento per confermare il posto.
        </p>
        <Elements
          stripe={stripePromise}
          options={{ clientSecret: booking.stripeClientSecret! }}
        >
          <StripePaymentStep
            excursionId={excursionId}
            booking={booking}
            onBack={stripeRecovery ? undefined : () => setStep("summary")}
            onSuccess={() => {
              void queryClient.invalidateQueries({
                queryKey: getGetPublicExcursionQueryKey(excursionId),
              });
              setStep("done");
            }}
          />
        </Elements>
      </>,
    );
  }

  // --- Riepilogo ---
  if (step === "summary" && quote) {
    const isFreeQuote = quote.totalCents === 0;
    const methodLabel = isFreeQuote
      ? "Nessun pagamento richiesto"
      : paymentMethod === "card"
        ? "Carta di credito"
        : paymentMethod === "bank_transfer"
          ? "Bonifico bancario"
          : "Pagamento in ufficio";
    return cardShell(
      <>
        <h2 className="mb-1 flex items-center gap-2 text-xl font-serif font-bold text-foreground">
          <Ticket className="h-5 w-5 text-accent" />
          Riepilogo prenotazione
        </h2>
        <p className="mb-5 text-sm text-muted-foreground">
          Controlla i dettagli prima di confermare. Gli importi sono calcolati
          dal nostro sistema.
        </p>

        <ul className="mb-4 space-y-2">
          {quote.participants.map((p, i) => {
            const participantInput = buildParticipants()[i];
            const label =
              p.type === "adult"
                ? "Adulto"
                : p.type === "child"
                  ? `Bambino ${p.ageRangeLabel ?? ""}`
                  : p.type === "patient"
                    ? "Paziente"
                    : "Accompagnatore";
            return (
              <li
                key={i}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-[#f7faf9] px-4 py-2.5 text-sm"
              >
                <div>
                  <span className="font-medium text-foreground">
                    {label.trim()}
                  </span>
                  {participantInput && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {participantInput.firstName} {participantInput.lastName}
                    </span>
                  )}
                  {p.pickupPointName && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      raccolta {p.pickupPointName}
                      {p.pickupSurchargeCents > 0
                        ? ` (+${formatEuro(p.pickupSurchargeCents)})`
                        : ""}
                    </span>
                  )}
                </div>
                <span className="font-semibold text-foreground">
                  {formatEuro(p.finalPriceCents)}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="mb-5 space-y-2 rounded-2xl border border-slate-200 p-5 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Totale prenotazione</span>
            <strong className="text-lg text-foreground">
              {formatEuro(quote.totalCents)}
            </strong>
          </div>
          {paymentType === "deposit" && !isFreeQuote && (
            <>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">
                  {saveCardForConfirmation
                    ? "Acconto alla conferma della gita"
                    : "Acconto da versare ora"}
                </span>
                <strong className="text-accent">
                  {formatEuro(quote.depositCents)}
                </strong>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">
                  Saldo residuo da pagare successivamente
                </span>
                <span className="text-foreground">
                  {formatEuro(quote.totalCents - quote.depositCents)}
                </span>
              </div>
            </>
          )}
          <div className="flex justify-between gap-4 border-t border-slate-100 pt-2">
            <span className="text-muted-foreground">Metodo di pagamento</span>
            <span className="font-medium text-foreground">{methodLabel}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Referente</span>
            <span className="font-medium text-foreground">
              {firstName} {lastName}
            </span>
          </div>
          {servizioCasa && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Ritiro da casa</span>
              <span className="text-right font-medium text-foreground">
                {homePickupAddress.trim()}
              </span>
            </div>
          )}
        </div>

        {saveCardForConfirmation && !isFreeQuote && (
          <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-relaxed text-emerald-900">
            <strong>Nessun addebito viene effettuato ora.</strong> Nel passaggio
            successivo salverai la carta; ElisTravel addebiterà l'acconto di{" "}
            {formatEuro(quote.depositCents)} soltanto se la gita verrà
            confermata.
          </div>
        )}

        {errorMsg && (
          <div className="mb-4 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <Button
          type="button"
          onClick={() => void confirmBooking()}
          disabled={isBusy}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
          data-testid="button-confirm-booking"
        >
          {isBusy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Conferma in corso…
            </>
          ) : (
            <>
              <Check className="h-4 w-4" />
              {isFreeQuote
                ? "Conferma prenotazione gratuita"
                : saveCardForConfirmation
                  ? "Conferma e salva la carta"
                  : "Conferma prenotazione"}
            </>
          )}
        </Button>
        <button
          type="button"
          onClick={() => {
            setStep("form");
            setErrorMsg(null);
          }}
          disabled={isBusy}
          className="mt-3 flex w-full items-center justify-center gap-1 text-center text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Modifica i dati
        </button>
      </>,
    );
  }

  // --- Form ---
  const depositHint = (() => {
    if (!depositConfig?.value) return "Riserva il posto con un acconto.";
    if (depositConfig.type === "fixed") {
      return `${formatEuro(Math.round(depositConfig.value * 100))} a persona.`;
    }
    return `${depositConfig.value}% del totale.`;
  })();

  const participantNameInputs = ({
    identity,
    idPrefix,
    onFirstNameChange,
    onLastNameChange,
  }: {
    identity: ParticipantNameDraft;
    idPrefix: string;
    onFirstNameChange: (value: string) => void;
    onLastNameChange: (value: string) => void;
  }) => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label
          htmlFor={`${idPrefix}-first-name`}
          className="mb-1.5 block text-xs font-semibold text-foreground"
        >
          Nome *
        </label>
        <input
          id={`${idPrefix}-first-name`}
          type="text"
          required
          maxLength={PARTICIPANT_NAME_MAX_LENGTH}
          value={identity.firstName}
          onChange={(event) => onFirstNameChange(event.target.value)}
          className={inputCls}
          autoComplete="off"
          data-testid={`input-${idPrefix}-first-name`}
        />
      </div>
      <div>
        <label
          htmlFor={`${idPrefix}-last-name`}
          className="mb-1.5 block text-xs font-semibold text-foreground"
        >
          Cognome *
        </label>
        <input
          id={`${idPrefix}-last-name`}
          type="text"
          required
          maxLength={PARTICIPANT_NAME_MAX_LENGTH}
          value={identity.lastName}
          onChange={(event) => onLastNameChange(event.target.value)}
          className={inputCls}
          autoComplete="off"
          data-testid={`input-${idPrefix}-last-name`}
        />
      </div>
    </div>
  );

  return cardShell(
    <>
      <h2 className="mb-1 flex items-center gap-2 text-xl font-serif font-bold text-foreground">
        <Ticket className="h-5 w-5 text-accent" />
        Prenota un posto
      </h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Inserisci il referente e i nomi di tutti i partecipanti: saranno usati
        per la lista operativa della gita.
      </p>

      {!thresholdReached && depositAvailable && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
          La gita sarà confermata al raggiungimento del numero minimo di
          partecipanti.{" "}
          {excursion.cardFlow === "save_for_confirmation"
            ? "Se scegli carta e acconto, la carta viene salvata senza addebiti ora e l'acconto viene addebitato soltanto alla conferma."
            : "Puoi versare un acconto per riservare il posto: il saldo verrà richiesto dopo la conferma."}
        </div>
      )}

      <form onSubmit={goToSummary} className="space-y-6">
        {/* --- Referente --- */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="bk-first-name"
              className="mb-1.5 block text-xs font-semibold text-foreground"
            >
              Nome *
            </label>
            <input
              id="bk-first-name"
              type="text"
              required
              maxLength={PARTICIPANT_NAME_MAX_LENGTH}
              value={firstName}
              onChange={(e) => {
                setFirstName(e.target.value);
                syncPrimaryParticipantFromContact("firstName", e.target.value);
              }}
              className={inputCls}
              data-testid="input-booking-first-name"
            />
          </div>
          <div>
            <label
              htmlFor="bk-last-name"
              className="mb-1.5 block text-xs font-semibold text-foreground"
            >
              Cognome *
            </label>
            <input
              id="bk-last-name"
              type="text"
              required
              maxLength={PARTICIPANT_NAME_MAX_LENGTH}
              value={lastName}
              onChange={(e) => {
                setLastName(e.target.value);
                syncPrimaryParticipantFromContact("lastName", e.target.value);
              }}
              className={inputCls}
              data-testid="input-booking-last-name"
            />
          </div>
          <div>
            <label
              htmlFor="bk-email"
              className="mb-1.5 block text-xs font-semibold text-foreground"
            >
              Email *
            </label>
            <input
              id="bk-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              data-testid="input-booking-email"
            />
          </div>
          <div>
            <label
              htmlFor="bk-phone"
              className="mb-1.5 block text-xs font-semibold text-foreground"
            >
              Telefono *
            </label>
            <input
              id="bk-phone"
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputCls}
              data-testid="input-booking-phone"
            />
          </div>
        </div>

        {/* --- Partecipanti --- */}
        {isRident ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    Pazienti
                  </div>
                  {excursion.patientPrice !== null &&
                    excursion.patientPrice !== undefined && (
                      <div className="text-xs text-muted-foreground">
                        {formatEuro(Math.round(excursion.patientPrice * 100))} a
                        persona
                      </div>
                    )}
                </div>
                <Stepper
                  value={patients}
                  min={1}
                  max={
                    maxPeople !== undefined ? maxPeople - companions : undefined
                  }
                  onChange={(v) => setRidentCounts(v, companions)}
                  testId="stepper-patients"
                />
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    Accompagnatori
                  </div>
                  {excursion.companionPrice !== null &&
                    excursion.companionPrice !== undefined && (
                      <div className="text-xs text-muted-foreground">
                        {formatEuro(Math.round(excursion.companionPrice * 100))}{" "}
                        a persona
                      </div>
                    )}
                </div>
                <Stepper
                  value={companions}
                  min={0}
                  max={
                    maxPeople !== undefined ? maxPeople - patients : undefined
                  }
                  onChange={(v) => setRidentCounts(patients, v)}
                  testId="stepper-companions"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-xs font-semibold text-foreground">
                Dati di ogni partecipante *
              </div>
              {patientNames.slice(0, patients).map((identity, index) => (
                <div
                  key={`patient-${index}`}
                  className="space-y-3 rounded-2xl border border-slate-200 bg-[#f7faf9] px-4 py-4"
                >
                  <div className="text-xs font-medium text-muted-foreground">
                    Paziente {index + 1}
                  </div>
                  {participantNameInputs({
                    identity,
                    idPrefix: `patient-${index}`,
                    onFirstNameChange: (value) =>
                      setPatientNames((previous) =>
                        updateParticipantName(
                          previous,
                          index,
                          "firstName",
                          value,
                        ),
                      ),
                    onLastNameChange: (value) =>
                      setPatientNames((previous) =>
                        updateParticipantName(
                          previous,
                          index,
                          "lastName",
                          value,
                        ),
                      ),
                  })}
                  {hasPickupPoints && (
                    <div>
                      <label
                        htmlFor={`patient-${index}-pickup`}
                        className="mb-1.5 block text-xs font-semibold text-foreground"
                      >
                        Punto di raccolta *
                      </label>
                      <select
                        id={`patient-${index}-pickup`}
                        required
                        value={patientPickups[index] ?? ""}
                        onChange={(event) =>
                          setPatientPickups((previous) => {
                            const next = [...previous];
                            next[index] = event.target.value;
                            return next;
                          })
                        }
                        className={inputCls}
                        data-testid={`select-participant-pickup-${index}`}
                      >
                        <option value="">
                          — Seleziona punto di raccolta —
                        </option>
                        {points.map((point) => (
                          <option key={point.id} value={point.id}>
                            {pickupOptionLabel(point)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              ))}
              {companionNames.slice(0, companions).map((identity, index) => (
                <div
                  key={`companion-${index}`}
                  className="space-y-3 rounded-2xl border border-slate-200 bg-[#f7faf9] px-4 py-4"
                >
                  <div className="text-xs font-medium text-muted-foreground">
                    Accompagnatore {index + 1}
                  </div>
                  {participantNameInputs({
                    identity,
                    idPrefix: `companion-${index}`,
                    onFirstNameChange: (value) =>
                      setCompanionNames((previous) =>
                        updateParticipantName(
                          previous,
                          index,
                          "firstName",
                          value,
                        ),
                      ),
                    onLastNameChange: (value) =>
                      setCompanionNames((previous) =>
                        updateParticipantName(
                          previous,
                          index,
                          "lastName",
                          value,
                        ),
                      ),
                  })}
                  {hasPickupPoints && (
                    <div>
                      <label
                        htmlFor={`companion-${index}-pickup`}
                        className="mb-1.5 block text-xs font-semibold text-foreground"
                      >
                        Punto di raccolta *
                      </label>
                      <select
                        id={`companion-${index}-pickup`}
                        required
                        value={companionPickups[index] ?? ""}
                        onChange={(event) =>
                          setCompanionPickups((previous) => {
                            const next = [...previous];
                            next[index] = event.target.value;
                            return next;
                          })
                        }
                        className={inputCls}
                        data-testid={`select-participant-pickup-${patients + index}`}
                      >
                        <option value="">
                          — Seleziona punto di raccolta —
                        </option>
                        {points.map((point) => (
                          <option key={point.id} value={point.id}>
                            {pickupOptionLabel(point)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
                <div className="text-sm font-semibold text-foreground">
                  {adultLabel}
                </div>
                <Stepper
                  value={adults}
                  min={1}
                  max={
                    maxPeople !== undefined ? maxPeople - children : undefined
                  }
                  onChange={setAdultsCount}
                  testId="stepper-adults"
                />
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
                <div className="text-sm font-semibold text-foreground">
                  Bambini
                </div>
                <Stepper
                  value={children}
                  min={0}
                  max={maxPeople !== undefined ? maxPeople - adults : undefined}
                  onChange={setChildrenCount}
                  testId="stepper-children"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-xs font-semibold text-foreground">
                Dati di ogni partecipante *
              </div>
              {adultNames.slice(0, adults).map((identity, index) => (
                <div
                  key={`adult-${index}`}
                  className="space-y-3 rounded-2xl border border-slate-200 bg-[#f7faf9] px-4 py-4"
                >
                  <div className="text-xs font-medium text-muted-foreground">
                    Adulto {index + 1}
                  </div>
                  {participantNameInputs({
                    identity,
                    idPrefix: `adult-${index}`,
                    onFirstNameChange: (value) =>
                      setAdultNames((previous) =>
                        updateParticipantName(
                          previous,
                          index,
                          "firstName",
                          value,
                        ),
                      ),
                    onLastNameChange: (value) =>
                      setAdultNames((previous) =>
                        updateParticipantName(
                          previous,
                          index,
                          "lastName",
                          value,
                        ),
                      ),
                  })}
                </div>
              ))}
              {childNames.slice(0, children).map((identity, index) => (
                <div
                  key={`child-${index}`}
                  className="space-y-3 rounded-2xl border border-slate-200 bg-[#f7faf9] px-4 py-4"
                >
                  <div className="text-xs font-medium text-muted-foreground">
                    Bambino {index + 1}
                  </div>
                  {participantNameInputs({
                    identity,
                    idPrefix: `child-${index}`,
                    onFirstNameChange: (value) =>
                      setChildNames((previous) =>
                        updateParticipantName(
                          previous,
                          index,
                          "firstName",
                          value,
                        ),
                      ),
                    onLastNameChange: (value) =>
                      setChildNames((previous) =>
                        updateParticipantName(
                          previous,
                          index,
                          "lastName",
                          value,
                        ),
                      ),
                  })}
                  <div>
                    <label
                      htmlFor={`child-${index}-age-range`}
                      className="mb-1.5 block text-xs font-semibold text-foreground"
                    >
                      Fascia età *
                    </label>
                    <select
                      id={`child-${index}-age-range`}
                      required
                      value={childAgeRangeIds[index] ?? ""}
                      onChange={(event) =>
                        setChildAgeRangeIds((previous) => {
                          const next = [...previous];
                          next[index] = event.target.value;
                          return next;
                        })
                      }
                      className={inputCls}
                      data-testid={`select-child-age-${index}`}
                    >
                      <option value="">— Seleziona fascia età —</option>
                      {ageRanges.map((range) => (
                        <option key={range.id} value={range.id}>
                          {range.label} —{" "}
                          {range.price > 0
                            ? formatEuro(Math.round(range.price * 100))
                            : "gratuito"}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>

            {hasPickupPoints && (
              <div>
                <label
                  htmlFor="bk-pickup"
                  className="mb-1.5 block text-xs font-semibold text-foreground"
                >
                  Punto di raccolta *
                </label>
                <select
                  id="bk-pickup"
                  required
                  value={pickupPointId}
                  onChange={(e) => setPickupPointId(e.target.value)}
                  className={inputCls}
                  data-testid="select-booking-pickup"
                >
                  <option value="">— Seleziona punto di raccolta —</option>
                  {points.map((p) => (
                    <option key={p.id} value={p.id}>
                      {pickupOptionLabel(p)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {homePickupAvailable && (
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-[#f7faf9] px-4 py-4">
            <label className="group flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={servizioCasa}
                onChange={(event) => {
                  setServizioCasa(event.target.checked);
                  if (!event.target.checked) setHomePickupAddress("");
                }}
                className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
                data-testid="checkbox-servizio-casa"
              />
              <div>
                <span className="text-sm font-semibold text-foreground transition-colors group-hover:text-accent">
                  Richiedo il servizio di trasporto da casa
                </span>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Indica ora l'indirizzo operativo che verrà conservato nella
                  prenotazione.
                </p>
              </div>
            </label>
            {servizioCasa && (
              <div>
                <label
                  htmlFor="bk-home-pickup-address"
                  className="mb-1.5 block text-xs font-semibold text-foreground"
                >
                  Indirizzo completo per il ritiro *
                </label>
                <input
                  id="bk-home-pickup-address"
                  type="text"
                  required
                  maxLength={500}
                  value={homePickupAddress}
                  onChange={(event) => setHomePickupAddress(event.target.value)}
                  placeholder="Via, numero civico, CAP, città"
                  className={inputCls}
                  data-testid="input-home-pickup-address"
                />
              </div>
            )}
          </div>
        )}

        {/* --- Acconto / importo completo --- */}
        <div>
          <div className="mb-2 block text-xs font-semibold text-foreground">
            Come vuoi pagare? *
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {effectiveDepositAvailable && (
              <label
                className={
                  "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors " +
                  (paymentType === "deposit"
                    ? "border-accent bg-accent/5 shadow-[0_8px_24px_rgba(255,122,26,0.10)]"
                    : "border-slate-200 hover:bg-[#f7faf9]")
                }
                data-testid="radio-payment-deposit"
              >
                <input
                  type="radio"
                  name="paymentType"
                  value="deposit"
                  checked={paymentType === "deposit"}
                  onChange={chooseDepositPayment}
                  className="mt-1 accent-accent"
                />
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    Acconto
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {depositHint}
                  </div>
                </div>
              </label>
            )}
            <label
              className={
                "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors " +
                (paymentType === "full"
                  ? "border-accent bg-accent/5 shadow-[0_8px_24px_rgba(255,122,26,0.10)]"
                  : "border-slate-200 hover:bg-[#f7faf9]")
              }
              data-testid="radio-payment-full"
            >
              <input
                type="radio"
                name="paymentType"
                value="full"
                checked={paymentType === "full"}
                onChange={() => setPaymentType("full")}
                className="mt-1 accent-accent"
              />
              <div>
                <div className="text-sm font-semibold text-foreground">
                  Importo completo
                </div>
                <div className="text-xs text-muted-foreground">
                  Paga subito l'intera quota.
                </div>
              </div>
            </label>
          </div>
          {!effectiveDepositAvailable && (
            <p className="mt-2 text-xs text-muted-foreground">
              {depositAvailable && !depositMethodAvailable
                ? "L'acconto non ha al momento un metodo di pagamento sicuro disponibile; è richiesto il pagamento completo."
                : "Per questa gita è richiesto il pagamento completo."}
            </p>
          )}
        </div>

        {/* --- Metodo di pagamento --- */}
        <div>
          <div className="mb-2 block text-xs font-semibold text-foreground">
            Metodo di pagamento *
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {cardAvailableForSelection && (
              <label
                className={
                  "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors " +
                  (paymentMethod === "card"
                    ? "border-accent bg-accent/5"
                    : "border-slate-200 hover:bg-[#f7faf9]")
                }
                data-testid="radio-method-card"
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value="card"
                  checked={paymentMethod === "card"}
                  onChange={() => setPaymentMethod("card")}
                  className="mt-1 accent-accent"
                />
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <CreditCard className="h-4 w-4 text-primary" /> Carta
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {saveCardForConfirmation
                      ? "Salva ora la carta; nessun addebito fino alla conferma."
                      : "Pagamento immediato online."}
                  </div>
                </div>
              </label>
            )}
            {methods.bankTransfer && (
              <label
                className={
                  "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors " +
                  (paymentMethod === "bank_transfer"
                    ? "border-accent bg-accent/5"
                    : "border-slate-200 hover:bg-[#f7faf9]")
                }
                data-testid="radio-method-bank"
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value="bank_transfer"
                  checked={paymentMethod === "bank_transfer"}
                  onChange={() => setPaymentMethod("bank_transfer")}
                  className="mt-1 accent-accent"
                />
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Landmark className="h-4 w-4 text-primary" /> Bonifico
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Riceverai IBAN e causale.
                  </div>
                </div>
              </label>
            )}
            {methods.office && (
              <label
                className={
                  "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors " +
                  (paymentMethod === "office"
                    ? "border-accent bg-accent/5"
                    : "border-slate-200 hover:bg-[#f7faf9]")
                }
                data-testid="radio-method-office"
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value="office"
                  checked={paymentMethod === "office"}
                  onChange={() => setPaymentMethod("office")}
                  className="mt-1 accent-accent"
                />
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Building2 className="h-4 w-4 text-primary" /> In ufficio
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Paga in sede entro la scadenza.
                  </div>
                </div>
              </label>
            )}
          </div>
          {methods.card &&
            paymentType === "deposit" &&
            excursion.cardFlow !== "save_for_confirmation" && (
              <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Per l'acconto la carta è disponibile soltanto quando è attiva
                l'autorizzazione al salvataggio e all'addebito alla conferma.
                Scegli bonifico o ufficio, oppure seleziona l'importo completo
                per pagare subito con carta.
              </p>
            )}
        </div>

        {/* --- Consensi --- */}
        <div className="space-y-3 border-t border-slate-100 pt-4">
          {saveCardForConfirmation && (
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <input
                type="checkbox"
                checked={futureChargeConsent}
                onChange={(e) => setFutureChargeConsent(e.target.checked)}
                className="mt-1 shrink-0 accent-accent"
                data-testid="checkbox-consent-future-card-charge"
              />
              <span className="text-xs leading-relaxed text-emerald-950">
                <strong>Nessun addebito ora.</strong> Autorizzo ElisTravel a
                salvare in modo sicuro la carta e addebitare l'acconto soltanto
                se la gita verrà confermata. Se la gita viene annullata, non
                verrà effettuato alcun addebito. *
              </span>
            </label>
          )}
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="mt-1 shrink-0 accent-accent"
              data-testid="checkbox-consent-terms"
            />
            <span className="text-xs leading-snug text-muted-foreground">
              Dichiaro di aver letto e accettato i{" "}
              <Link
                href="/termini-e-condizioni"
                className="text-primary hover:underline"
                target="_blank"
              >
                Termini e Condizioni
              </Link>{" "}
              di partecipazione alla gita. *
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={privacyAccepted}
              onChange={(e) => setPrivacyAccepted(e.target.checked)}
              className="mt-1 shrink-0 accent-accent"
              data-testid="checkbox-consent-privacy"
            />
            <span className="text-xs leading-snug text-muted-foreground">
              Dichiaro di aver letto l'{" "}
              <Link
                href="/privacy-policy"
                className="text-primary hover:underline"
                target="_blank"
              >
                Informativa Privacy
              </Link>{" "}
              e autorizzo il trattamento dei dati personali necessario alla
              gestione della prenotazione. *
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={mediaAccepted}
              onChange={(e) => setMediaAccepted(e.target.checked)}
              className="mt-1 shrink-0 accent-accent"
              data-testid="checkbox-consent-media"
            />
            <span className="text-xs leading-snug text-muted-foreground">
              Autorizzo Elis Travel all'utilizzo di foto e video realizzati
              durante la gita per finalità promozionali e comunicative.{" "}
              <em>(facoltativo)</em>
            </span>
          </label>
        </div>

        {errorMsg && (
          <div
            className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            data-testid="text-booking-error"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <Button
          type="submit"
          disabled={isBusy}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
          data-testid="button-submit-booking"
        >
          {isBusy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Calcolo in corso…
            </>
          ) : (
            <>
              <Ticket className="h-4 w-4" />
              Vai al riepilogo
            </>
          )}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Nel prossimo passaggio vedrai il totale calcolato e potrai confermare
          la prenotazione.
        </p>
      </form>
    </>,
  );
}
