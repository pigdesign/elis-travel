import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/shared/Button";
import { useQueryClient } from "@tanstack/react-query";
import {
  quotePublicExcursion,
  createPublicExcursionBooking,
  confirmPublicExcursionBookingPayment,
  getGetPublicExcursionQueryKey,
} from "@workspace/api-client-react";
import type {
  PublicExcursionDetail,
  QuoteParticipantInput,
  QuoteResponse,
  PublicBookingResponse,
} from "@workspace/api-client-react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
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

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

function formatEuro(cents: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

function formatDeadline(iso: string) {
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

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10";

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
      <span className="w-6 text-center text-base font-semibold text-foreground">{value}</span>
      <button
        type="button"
        onClick={() => onChange(max !== undefined ? Math.min(max, value + 1) : value + 1)}
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
function pickupOptionLabel(p: NonNullable<PublicExcursionDetail["pickupPoints"]>[number]) {
  const parts = [p.name];
  if (p.province) parts.push(`(${p.province})`);
  if (p.pickupTime) parts.push(`· ore ${p.pickupTime}`);
  const surcharge = p.surcharge ?? 0;
  if (surcharge > 0) parts.push(`· supplemento ${formatEuro(Math.round(surcharge * 100))}`);
  else if (surcharge < 0) parts.push(`· sconto ${formatEuro(Math.round(-surcharge * 100))}`);
  else parts.push("· nessun supplemento");
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
  onBack: () => void;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [cardError, setCardError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setCardError(null);
    setIsConfirming(true);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: { return_url: window.location.href },
    });

    if (error) {
      setCardError(error.message ?? "Errore durante il pagamento. Riprova.");
      setIsConfirming(false);
      return;
    }
    if (!paymentIntent || paymentIntent.status !== "succeeded") {
      setCardError("Il pagamento non risulta completato. Riprova o scegli un altro metodo.");
      setIsConfirming(false);
      return;
    }

    try {
      await confirmPublicExcursionBookingPayment(excursionId, booking.id, {
        paymentIntentId: paymentIntent.id,
      });
    } catch {
      // Il webhook Stripe aggiornerà comunque la prenotazione: non blocchiamo l'utente.
    }
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <p className="text-sm font-semibold text-foreground">
        Importo da pagare ora: {formatEuro(booking.amountDueCents)}
        {booking.paymentType === "deposit" && (
          <span className="ml-1 font-normal text-muted-foreground">
            (acconto — residuo {formatEuro(booking.totalCents - booking.amountDueCents)})
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
        disabled={isConfirming || !stripe}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
      >
        {isConfirming ? (
          <><Loader2 className="h-4 w-4 animate-spin" />Pagamento in corso…</>
        ) : (
          <><CreditCard className="h-4 w-4" />Paga {formatEuro(booking.amountDueCents)}</>
        )}
      </Button>
      <button
        type="button"
        onClick={onBack}
        disabled={isConfirming}
        className="w-full text-center text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
      >
        ← Torna al riepilogo
      </button>
      <p className="text-center text-xs text-muted-foreground">
        Pagamento sicuro gestito da Stripe. I tuoi dati non vengono mai condivisi con noi.
      </p>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Form principale
// ---------------------------------------------------------------------------

type Step = "form" | "summary" | "stripe" | "instructions" | "done";

export function ExcursionBookingForm({ excursion }: { excursion: PublicExcursionDetail }) {
  const queryClient = useQueryClient();
  const excursionId = excursion.id;
  const isRident = excursion.tripType === "rident";
  const points = (excursion.pickupPoints ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const hasPickupPoints = points.length > 0;
  const ageRanges = excursion.ageRanges ?? [];
  const spotsLeft = excursion.spotsLeft ?? null;
  const depositConfig = excursion.depositConfig;
  const depositAvailable = depositConfig?.available === true;
  const methods = excursion.paymentMethods ?? { card: false, bankTransfer: true, office: true };
  const thresholdReached = excursion.thresholdReached === true;
  const adultLabel = excursion.adultLabel ?? "Adulti (18+ anni)";

  // Referente
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  // Gite normali
  const [adults, setAdults] = useState(1);
  const [childAgeRangeIds, setChildAgeRangeIds] = useState<string[]>([]);
  const [pickupPointId, setPickupPointId] = useState("");
  const [servizioCasa, setServizioCasa] = useState(false);
  // Gite normali: false = tutti allo stesso punto (default); true = un punto per partecipante.
  const [splitPickup, setSplitPickup] = useState(false);
  // Gite RIDENT
  const [patients, setPatients] = useState(1);
  const [companions, setCompanions] = useState(0);
  const [participantPickups, setParticipantPickups] = useState<string[]>([""]);
  // Pagamento
  const [paymentType, setPaymentType] = useState<"deposit" | "full">(depositAvailable ? "deposit" : "full");
  const defaultMethod = methods.card ? "card" : methods.bankTransfer ? "bank_transfer" : "office";
  const [paymentMethod, setPaymentMethod] = useState<"card" | "bank_transfer" | "office">(defaultMethod);
  // Consensi
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [mediaAccepted, setMediaAccepted] = useState(false);

  const [step, setStep] = useState<Step>("form");
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [booking, setBooking] = useState<PublicBookingResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const children = childAgeRangeIds.length;
  const totalPeople = isRident ? patients + companions : adults + children;
  const maxPeople = spotsLeft !== null ? spotsLeft : undefined;

  // Tiene i punti per-partecipante allineati al numero di partecipanti (Rident e "punti divisi").
  useEffect(() => {
    setParticipantPickups((prev) => {
      if (prev.length === totalPeople) return prev;
      const next = prev.slice(0, totalPeople);
      while (next.length < totalPeople) next.push("");
      return next;
    });
  }, [totalPeople]);

  const setChildrenCount = (n: number) => {
    setChildAgeRangeIds((prev) => {
      const next = prev.slice(0, n);
      while (next.length < n) next.push("");
      return next;
    });
  };

  const setRidentCounts = (p: number, c: number) => {
    setPatients(p);
    setCompanions(c);
    setParticipantPickups((prev) => {
      const next = prev.slice(0, p + c);
      while (next.length < p + c) next.push("");
      return next;
    });
  };

  const buildParticipants = (): QuoteParticipantInput[] => {
    if (isRident) {
      const list: QuoteParticipantInput[] = [];
      for (let i = 0; i < patients; i++) {
        list.push({ type: "patient", pickupPointId: participantPickups[i] || null });
      }
      for (let i = 0; i < companions; i++) {
        list.push({ type: "companion", pickupPointId: participantPickups[patients + i] || null });
      }
      return list;
    }
    return [
      ...Array.from({ length: adults }, (_, i) => ({
        type: "adult" as const,
        pickupPointId: splitPickup ? participantPickups[i] || null : null,
      })),
      ...childAgeRangeIds.map((rangeId, i) => ({
        type: "child" as const,
        ageRangeId: rangeId || null,
        pickupPointId: splitPickup ? participantPickups[adults + i] || null : null,
      })),
    ];
  };

  const validateForm = (): string | null => {
    if (!firstName.trim() || !lastName.trim()) return "Nome e cognome sono obbligatori.";
    if (!email.trim()) return "L'email è obbligatoria.";
    if (!phone.trim()) return "Il numero di telefono è obbligatorio.";
    if (isRident) {
      if (patients < 1) return "Serve almeno un paziente.";
      if (hasPickupPoints) {
        for (let i = 0; i < patients + companions; i++) {
          if (!participantPickups[i]) return `Seleziona il punto di raccolta per il partecipante ${i + 1}.`;
        }
      }
    } else {
      if (adults < 1) return "Serve almeno un adulto.";
      for (let i = 0; i < childAgeRangeIds.length; i++) {
        if (!childAgeRangeIds[i]) return `Seleziona la fascia età per il bambino ${i + 1}.`;
      }
      if (hasPickupPoints) {
        if (splitPickup) {
          for (let i = 0; i < totalPeople; i++) {
            if (!participantPickups[i]) return `Seleziona il punto di raccolta per il partecipante ${i + 1}.`;
          }
        } else if (!pickupPointId) {
          return "Seleziona il punto di raccolta.";
        }
      }
    }
    if (maxPeople !== undefined && totalPeople > maxPeople) {
      return `Sono rimasti solo ${maxPeople} posti disponibili.`;
    }
    if (!termsAccepted) return "Devi accettare i Termini e Condizioni per prenotare.";
    if (!privacyAccepted) return "Devi accettare l'Informativa Privacy per prenotare.";
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
        pickupPointId: !isRident && !splitPickup && pickupPointId ? pickupPointId : null,
        paymentType,
      });
      setQuote(q);
      setStep("summary");
    } catch (err: unknown) {
      const e2 = err as { data?: { error?: string }; message?: string };
      setErrorMsg(e2?.data?.error ?? e2?.message ?? "Impossibile calcolare il preventivo. Riprova.");
    } finally {
      setIsBusy(false);
    }
  };

  const confirmBooking = async () => {
    setErrorMsg(null);
    setIsBusy(true);
    try {
      const res = await createPublicExcursionBooking(excursionId, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        participants: buildParticipants(),
        pickupPointId: !isRident && !splitPickup && pickupPointId ? pickupPointId : null,
        paymentType,
        paymentMethod,
        consents: { terms: termsAccepted, privacy: privacyAccepted, media: mediaAccepted },
        servizioCasa: servizioCasa || undefined,
      });
      setBooking(res);
      void queryClient.invalidateQueries({ queryKey: getGetPublicExcursionQueryKey(excursionId) });
      if (res.stripeClientSecret) {
        setStep("stripe");
      } else {
        setStep("instructions");
      }
    } catch (err: unknown) {
      const e2 = err as { data?: { error?: string }; message?: string };
      setErrorMsg(e2?.data?.error ?? e2?.message ?? "Impossibile completare la prenotazione. Riprova.");
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

  // --- Posti esauriti / prenotazioni chiuse ---
  if (excursion.bookingClosed === true || (spotsLeft !== null && spotsLeft <= 0)) {
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
    return (
      <div
        id="prenota"
        className="rounded-[30px] border border-emerald-200 bg-emerald-50 p-6 shadow-[0_18px_50px_rgba(20,36,43,0.08)] md:p-8"
        data-testid="card-booking-success"
      >
        <h2 className="mb-3 flex items-center gap-2 text-xl font-serif font-bold text-emerald-800">
          <CheckCircle2 className="h-5 w-5" />
          Pagamento completato!
        </h2>
        <p className="text-sm text-emerald-900">
          La tua prenotazione <strong>{booking.bookingCode}</strong> è confermata. Riceverai una
          email di riepilogo con tutti i dettagli.
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
        <p className="mb-5 text-sm leading-relaxed text-muted-foreground">{booking.message}</p>

        <div className="mb-5 space-y-2 rounded-2xl border border-slate-200 bg-[#f7faf9] p-5 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Importo da pagare</span>
            <strong className="text-foreground">{formatEuro(booking.amountDueCents)}</strong>
          </div>
          {booking.paymentType === "deposit" && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Residuo dopo l'acconto</span>
              <span className="text-foreground">{formatEuro(booking.totalCents - booking.amountDueCents)}</span>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Scadenza pagamento</span>
            <strong className="capitalize text-accent">{formatDeadline(booking.paymentDeadline)}</strong>
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
                  <dd className="font-medium text-foreground">{booking.bank.beneficiary}</dd>
                </div>
              )}
              {booking.bank.iban && (
                <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
                  <dt className="text-muted-foreground">IBAN</dt>
                  <dd className="font-mono font-medium text-foreground">{booking.bank.iban}</dd>
                </div>
              )}
              {booking.bank.bank && (
                <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
                  <dt className="text-muted-foreground">Banca</dt>
                  <dd className="font-medium text-foreground">{booking.bank.bank}</dd>
                </div>
              )}
              <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
                <dt className="text-muted-foreground">Causale (obbligatoria)</dt>
                <dd className="font-medium text-foreground">{booking.bank.causale}</dd>
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
              Il posto è riservato temporaneamente fino alla scadenza indicata. Cita il codice
              prenotazione <strong>{booking.bookingCode}</strong> al momento del pagamento.
            </p>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Riceverai una email con il riepilogo e queste istruzioni. Per qualsiasi dubbio
          contattaci citando il codice {booking.bookingCode}.
        </p>
      </>,
    );
  }

  // --- Pagamento carta ---
  if (step === "stripe" && booking?.stripeClientSecret) {
    if (!stripePromise) {
      return cardShell(
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="mb-1 font-semibold">Pagamento non configurato</p>
            <p>
              La chiave Stripe pubblica non è impostata (<code>VITE_STRIPE_PUBLISHABLE_KEY</code>).
              Contattaci per completare il pagamento.
            </p>
          </div>
        </div>,
      );
    }
    return cardShell(
      <>
        <h2 className="mb-1 flex items-center gap-2 text-xl font-serif font-bold text-foreground">
          <CreditCard className="h-5 w-5 text-accent" />
          Pagamento con carta
        </h2>
        <p className="mb-5 text-sm text-muted-foreground">
          Prenotazione <strong>{booking.bookingCode}</strong> — completa il pagamento per
          confermare il posto.
        </p>
        <Elements stripe={stripePromise} options={{ clientSecret: booking.stripeClientSecret }}>
          <StripePaymentStep
            excursionId={excursionId}
            booking={booking}
            onBack={() => setStep("summary")}
            onSuccess={() => {
              void queryClient.invalidateQueries({ queryKey: getGetPublicExcursionQueryKey(excursionId) });
              setStep("done");
            }}
          />
        </Elements>
      </>,
    );
  }

  // --- Riepilogo ---
  if (step === "summary" && quote) {
    const methodLabel =
      paymentMethod === "card" ? "Carta di credito" : paymentMethod === "bank_transfer" ? "Bonifico bancario" : "Pagamento in ufficio";
    return cardShell(
      <>
        <h2 className="mb-1 flex items-center gap-2 text-xl font-serif font-bold text-foreground">
          <Ticket className="h-5 w-5 text-accent" />
          Riepilogo prenotazione
        </h2>
        <p className="mb-5 text-sm text-muted-foreground">
          Controlla i dettagli prima di confermare. Gli importi sono calcolati dal nostro sistema.
        </p>

        <ul className="mb-4 space-y-2">
          {quote.participants.map((p, i) => {
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
                  <span className="font-medium text-foreground">{label.trim()}</span>
                  {p.pickupPointName && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      raccolta {p.pickupPointName}
                      {p.pickupSurchargeCents !== 0
                        ? ` (${p.pickupSurchargeCents > 0 ? "+" : "−"}${formatEuro(Math.abs(p.pickupSurchargeCents))})`
                        : ""}
                    </span>
                  )}
                </div>
                <span className="font-semibold text-foreground">{formatEuro(p.finalPriceCents)}</span>
              </li>
            );
          })}
        </ul>

        <div className="mb-5 space-y-2 rounded-2xl border border-slate-200 p-5 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Totale prenotazione</span>
            <strong className="text-lg text-foreground">{formatEuro(quote.totalCents)}</strong>
          </div>
          {paymentType === "deposit" && (
            <>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Acconto da versare ora</span>
                <strong className="text-accent">{formatEuro(quote.depositCents)}</strong>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Residuo alla conferma</span>
                <span className="text-foreground">{formatEuro(quote.totalCents - quote.depositCents)}</span>
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
        </div>

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
            <><Loader2 className="h-4 w-4 animate-spin" />Conferma in corso…</>
          ) : (
            <><Check className="h-4 w-4" />Conferma prenotazione</>
          )}
        </Button>
        <button
          type="button"
          onClick={() => { setStep("form"); setErrorMsg(null); }}
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

  return cardShell(
    <>
      <h2 className="mb-1 flex items-center gap-2 text-xl font-serif font-bold text-foreground">
        <Ticket className="h-5 w-5 text-accent" />
        Prenota un posto
      </h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Bastano i dati del referente: i dettagli degli altri partecipanti verranno raccolti in un
        secondo momento.
      </p>

      {!thresholdReached && depositAvailable && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
          La gita sarà confermata al raggiungimento del numero minimo di partecipanti. Puoi versare
          un acconto per riservare il posto: il saldo verrà richiesto dopo la conferma.
        </div>
      )}

      <form onSubmit={goToSummary} className="space-y-6">
        {/* --- Referente --- */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="bk-first-name" className="mb-1.5 block text-xs font-semibold text-foreground">
              Nome *
            </label>
            <input id="bk-first-name" type="text" required value={firstName}
              onChange={(e) => setFirstName(e.target.value)} className={inputCls}
              data-testid="input-booking-first-name" />
          </div>
          <div>
            <label htmlFor="bk-last-name" className="mb-1.5 block text-xs font-semibold text-foreground">
              Cognome *
            </label>
            <input id="bk-last-name" type="text" required value={lastName}
              onChange={(e) => setLastName(e.target.value)} className={inputCls}
              data-testid="input-booking-last-name" />
          </div>
          <div>
            <label htmlFor="bk-email" className="mb-1.5 block text-xs font-semibold text-foreground">
              Email *
            </label>
            <input id="bk-email" type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)} className={inputCls}
              data-testid="input-booking-email" />
          </div>
          <div>
            <label htmlFor="bk-phone" className="mb-1.5 block text-xs font-semibold text-foreground">
              Telefono *
            </label>
            <input id="bk-phone" type="tel" required value={phone}
              onChange={(e) => setPhone(e.target.value)} className={inputCls}
              data-testid="input-booking-phone" />
          </div>
        </div>

        {/* --- Partecipanti --- */}
        {isRident ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Pazienti</div>
                  {excursion.patientPrice !== null && excursion.patientPrice !== undefined && (
                    <div className="text-xs text-muted-foreground">
                      {formatEuro(Math.round(excursion.patientPrice * 100))} a persona
                    </div>
                  )}
                </div>
                <Stepper value={patients} min={1}
                  max={maxPeople !== undefined ? maxPeople - companions : undefined}
                  onChange={(v) => setRidentCounts(v, companions)} testId="stepper-patients" />
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Accompagnatori</div>
                  {excursion.companionPrice !== null && excursion.companionPrice !== undefined && (
                    <div className="text-xs text-muted-foreground">
                      {formatEuro(Math.round(excursion.companionPrice * 100))} a persona
                    </div>
                  )}
                </div>
                <Stepper value={companions} min={0}
                  max={maxPeople !== undefined ? maxPeople - patients : undefined}
                  onChange={(v) => setRidentCounts(patients, v)} testId="stepper-companions" />
              </div>
            </div>

            {hasPickupPoints && (
              <div className="space-y-3">
                <div className="text-xs font-semibold text-foreground">
                  Punto di raccolta di ogni partecipante *
                </div>
                {Array.from({ length: patients + companions }, (_, i) => {
                  const isPatient = i < patients;
                  return (
                    <div key={i} className="rounded-2xl border border-slate-200 bg-[#f7faf9] px-4 py-3">
                      <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                        Partecipante {i + 1} — {isPatient ? "Paziente" : "Accompagnatore"}
                      </div>
                      <select
                        value={participantPickups[i] ?? ""}
                        onChange={(e) =>
                          setParticipantPickups((prev) => {
                            const next = [...prev];
                            next[i] = e.target.value;
                            return next;
                          })
                        }
                        className={inputCls}
                        data-testid={`select-participant-pickup-${i}`}
                      >
                        <option value="">— Seleziona punto di raccolta —</option>
                        {points.map((p) => (
                          <option key={p.id} value={p.id}>
                            {pickupOptionLabel(p)}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
                <div className="text-sm font-semibold text-foreground">{adultLabel}</div>
                <Stepper value={adults} min={1}
                  max={maxPeople !== undefined ? maxPeople - children : undefined}
                  onChange={setAdults} testId="stepper-adults" />
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
                <div className="text-sm font-semibold text-foreground">Bambini</div>
                <Stepper value={children} min={0}
                  max={maxPeople !== undefined ? maxPeople - adults : undefined}
                  onChange={setChildrenCount} testId="stepper-children" />
              </div>
            </div>

            {children > 0 && ageRanges.length > 0 && (
              <div className="space-y-3">
                <div className="text-xs font-semibold text-foreground">Fascia età di ogni bambino *</div>
                {childAgeRangeIds.map((value, i) => (
                  <div key={i} className="rounded-2xl border border-slate-200 bg-[#f7faf9] px-4 py-3">
                    <div className="mb-1.5 text-xs font-medium text-muted-foreground">Bambino {i + 1}</div>
                    <select
                      value={value}
                      onChange={(e) =>
                        setChildAgeRangeIds((prev) => {
                          const next = [...prev];
                          next[i] = e.target.value;
                          return next;
                        })
                      }
                      className={inputCls}
                      data-testid={`select-child-age-${i}`}
                    >
                      <option value="">— Seleziona fascia età —</option>
                      {ageRanges.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label} — {r.price > 0 ? formatEuro(Math.round(r.price * 100)) : "gratuito"}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}

            {hasPickupPoints && (
              <div className="space-y-3">
                {/* Tutti allo stesso punto (default) oppure un punto per partecipante */}
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-[#f7faf9] px-4 py-3">
                  <input
                    type="checkbox"
                    checked={!splitPickup}
                    onChange={(e) => {
                      const sameForAll = e.target.checked;
                      setSplitPickup(!sameForAll);
                      if (!sameForAll) {
                        // Passaggio a "punti divisi": precompilo tutti col punto comune scelto.
                        setParticipantPickups(
                          Array.from({ length: totalPeople }, () => pickupPointId || ""),
                        );
                      }
                    }}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
                    data-testid="checkbox-same-pickup"
                  />
                  <div>
                    <span className="text-sm font-semibold text-foreground">Tutti allo stesso punto di raccolta</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Disattiva se i partecipanti partono da punti diversi.
                    </span>
                  </div>
                </label>

                {!splitPickup ? (
                  <div>
                    <label htmlFor="bk-pickup" className="mb-1.5 block text-xs font-semibold text-foreground">
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
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-foreground">Punto di raccolta di ogni partecipante *</span>
                      {totalPeople > 1 && participantPickups[0] && (
                        <button
                          type="button"
                          onClick={() =>
                            setParticipantPickups((prev) => Array.from({ length: totalPeople }, () => prev[0] || ""))
                          }
                          className="shrink-0 text-xs font-semibold text-accent hover:underline"
                          data-testid="button-apply-pickup-all"
                        >
                          Applica il primo a tutti
                        </button>
                      )}
                    </div>
                    {Array.from({ length: totalPeople }, (_, i) => {
                      const label = i < adults ? `Adulto ${i + 1}` : `Bambino ${i - adults + 1}`;
                      return (
                        <div key={i} className="rounded-2xl border border-slate-200 bg-[#f7faf9] px-4 py-3">
                          <div className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</div>
                          <select
                            value={participantPickups[i] ?? ""}
                            onChange={(e) =>
                              setParticipantPickups((prev) => {
                                const next = [...prev];
                                next[i] = e.target.value;
                                return next;
                              })
                            }
                            className={inputCls}
                            data-testid={`select-participant-pickup-std-${i}`}
                          >
                            <option value="">— Seleziona punto di raccolta —</option>
                            {points.map((p) => (
                              <option key={p.id} value={p.id}>
                                {pickupOptionLabel(p)}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {hasPickupPoints && (
              <label className="group flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-[#f7faf9] px-4 py-4">
                <input type="checkbox" checked={servizioCasa}
                  onChange={(e) => setServizioCasa(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
                  data-testid="checkbox-servizio-casa" />
                <div>
                  <span className="text-sm font-semibold text-foreground transition-colors group-hover:text-accent">
                    Richiedo il servizio di trasporto da casa
                  </span>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Disponibile su richiesta: ti contatteremo per organizzare il ritiro.
                  </p>
                </div>
              </label>
            )}
          </div>
        )}

        {/* --- Acconto / importo completo --- */}
        <div>
          <div className="mb-2 block text-xs font-semibold text-foreground">Come vuoi pagare? *</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {depositAvailable && (
              <label
                className={
                  "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors " +
                  (paymentType === "deposit"
                    ? "border-accent bg-accent/5 shadow-[0_8px_24px_rgba(255,122,26,0.10)]"
                    : "border-slate-200 hover:bg-[#f7faf9]")
                }
                data-testid="radio-payment-deposit"
              >
                <input type="radio" name="paymentType" value="deposit"
                  checked={paymentType === "deposit"} onChange={() => setPaymentType("deposit")}
                  className="mt-1 accent-accent" />
                <div>
                  <div className="text-sm font-semibold text-foreground">Acconto</div>
                  <div className="text-xs text-muted-foreground">{depositHint}</div>
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
              <input type="radio" name="paymentType" value="full"
                checked={paymentType === "full"} onChange={() => setPaymentType("full")}
                className="mt-1 accent-accent" />
              <div>
                <div className="text-sm font-semibold text-foreground">Importo completo</div>
                <div className="text-xs text-muted-foreground">Paga subito l'intera quota.</div>
              </div>
            </label>
          </div>
          {!depositAvailable && (
            <p className="mt-2 text-xs text-muted-foreground">
              Per questa gita è richiesto il pagamento completo.
            </p>
          )}
        </div>

        {/* --- Metodo di pagamento --- */}
        <div>
          <div className="mb-2 block text-xs font-semibold text-foreground">Metodo di pagamento *</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {methods.card && (
              <label
                className={
                  "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors " +
                  (paymentMethod === "card"
                    ? "border-accent bg-accent/5"
                    : "border-slate-200 hover:bg-[#f7faf9]")
                }
                data-testid="radio-method-card"
              >
                <input type="radio" name="paymentMethod" value="card"
                  checked={paymentMethod === "card"} onChange={() => setPaymentMethod("card")}
                  className="mt-1 accent-accent" />
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <CreditCard className="h-4 w-4 text-primary" /> Carta
                  </div>
                  <div className="text-xs text-muted-foreground">Pagamento immediato online.</div>
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
                <input type="radio" name="paymentMethod" value="bank_transfer"
                  checked={paymentMethod === "bank_transfer"} onChange={() => setPaymentMethod("bank_transfer")}
                  className="mt-1 accent-accent" />
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Landmark className="h-4 w-4 text-primary" /> Bonifico
                  </div>
                  <div className="text-xs text-muted-foreground">Riceverai IBAN e causale.</div>
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
                <input type="radio" name="paymentMethod" value="office"
                  checked={paymentMethod === "office"} onChange={() => setPaymentMethod("office")}
                  className="mt-1 accent-accent" />
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Building2 className="h-4 w-4 text-primary" /> In ufficio
                  </div>
                  <div className="text-xs text-muted-foreground">Paga in sede entro la scadenza.</div>
                </div>
              </label>
            )}
          </div>
        </div>

        {/* --- Consensi --- */}
        <div className="space-y-3 border-t border-slate-100 pt-4">
          <label className="flex cursor-pointer items-start gap-2">
            <input type="checkbox" checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="mt-1 shrink-0 accent-accent" data-testid="checkbox-consent-terms" />
            <span className="text-xs leading-snug text-muted-foreground">
              Dichiaro di aver letto e accettato i{" "}
              <Link href="/termini-e-condizioni" className="text-primary hover:underline" target="_blank">
                Termini e Condizioni
              </Link>{" "}
              di partecipazione alla gita. *
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2">
            <input type="checkbox" checked={privacyAccepted}
              onChange={(e) => setPrivacyAccepted(e.target.checked)}
              className="mt-1 shrink-0 accent-accent" data-testid="checkbox-consent-privacy" />
            <span className="text-xs leading-snug text-muted-foreground">
              Dichiaro di aver letto l'{" "}
              <Link href="/privacy-policy" className="text-primary hover:underline" target="_blank">
                Informativa Privacy
              </Link>{" "}
              e autorizzo il trattamento dei dati personali necessario alla gestione della
              prenotazione. *
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2">
            <input type="checkbox" checked={mediaAccepted}
              onChange={(e) => setMediaAccepted(e.target.checked)}
              className="mt-1 shrink-0 accent-accent" data-testid="checkbox-consent-media" />
            <span className="text-xs leading-snug text-muted-foreground">
              Autorizzo Elis Travel all'utilizzo di foto e video realizzati durante la gita per
              finalità promozionali e comunicative. <em>(facoltativo)</em>
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
            <><Loader2 className="h-4 w-4 animate-spin" />Calcolo in corso…</>
          ) : (
            <><Ticket className="h-4 w-4" />Vai al riepilogo</>
          )}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Nel prossimo passaggio vedrai il totale calcolato e potrai confermare la prenotazione.
        </p>
      </form>
    </>,
  );
}
