// ---------------------------------------------------------------------------
// Correzioni manuali dell'amministrazione su una prenotazione gia salvata.
//
// Il modello economico resta a partita doppia: la riga della prenotazione e un
// riepilogo derivato, l'obbligazione vera vive in payment_requests. Queste
// regole non aggirano quel principio, aggiungono le operazioni che mancavano
// per gestirlo davvero da ufficio: cambiare il metodo di una richiesta al posto
// del cliente, correggere un importo sbagliato, registrare un incasso che non
// ha una richiesta corrispondente, stornare un incasso segnato per errore.
//
// Tutto quello che sta qui e una decisione pura: nessuna query, cosi le regole
// si testano senza database e i percorsi HTTP restano sottili.
// ---------------------------------------------------------------------------

/**
 * Metodi che l'amministrazione puo assegnare a una richiesta al posto del
 * cliente. La carta e deliberatamente esclusa: autorizzare un addebito
 * richiede il consenso del titolare sul portale, e nessun operatore puo darlo
 * per lui. Una richiesta gia su carta si sposta invece su un metodo offline
 * senza problemi, ed e il caso reale ("non riesco a pagare online, passo in
 * ufficio").
 */
export const ADMIN_ASSIGNABLE_METHODS = [
  "bank_transfer",
  "office",
  "on_bus",
] as const;
export type AdminAssignableMethod = (typeof ADMIN_ASSIGNABLE_METHODS)[number];

export function isAdminAssignableMethod(
  value: unknown,
): value is AdminAssignableMethod {
  return (
    typeof value === "string" &&
    (ADMIN_ASSIGNABLE_METHODS as readonly string[]).includes(value)
  );
}

/**
 * Stati in cui una richiesta e ancora un'obbligazione aperta e quindi
 * modificabile. `expired` e incluso di proposito: dal portale il cliente non
 * puo resuscitare una richiesta scaduta — un insoluto e una decisione
 * dell'agenzia — ma l'agenzia deve poterlo fare, altrimenti la scadenza
 * diventa un vicolo cieco anche per chi ha il denaro in mano.
 */
export const EDITABLE_REQUEST_STATUSES = [
  "pending",
  "scheduled",
  "action_required",
  "expired",
] as const;

export function isEditableRequestStatus(status: string): boolean {
  return (EDITABLE_REQUEST_STATUSES as readonly string[]).includes(status);
}

export type RequestMethodDecision =
  | "apply"
  | "unchanged"
  | "status_not_editable"
  | "method_not_allowed"
  | "on_bus_requires_balance"
  | "on_bus_not_available";

/**
 * Puo l'amministrazione assegnare `nextMethod` a questa richiesta?
 *
 * Il vincolo del saldo a bordo e lo stesso del portale e non si allenta per
 * l'admin: a bordo si incassa solo la chiusura di una prenotazione gia
 * avviata, e solo dove la gita e l'interruttore globale lo consentono. Un
 * operatore che promettesse il bus su un acconto creerebbe una scadenza
 * spostata alla partenza per denaro che invece serve prima.
 */
export function adminRequestMethodDecision(input: {
  requestStatus: string;
  requestType: string;
  currentMethod: string | null;
  nextMethod: string;
  onBusAvailable: boolean;
}): RequestMethodDecision {
  if (!isEditableRequestStatus(input.requestStatus)) {
    return "status_not_editable";
  }
  if (!isAdminAssignableMethod(input.nextMethod)) return "method_not_allowed";
  if (input.nextMethod === "on_bus") {
    if (input.requestType !== "balance") return "on_bus_requires_balance";
    if (!input.onBusAvailable) return "on_bus_not_available";
  }
  if (input.currentMethod === input.nextMethod) return "unchanged";
  return "apply";
}

export type RequestAmountDecision =
  | "apply"
  | "unchanged"
  | "status_not_editable"
  | "invalid_amount"
  | "exceeds_residual"
  | "deposit_not_partial";

/**
 * Correzione dell'importo di una richiesta ancora aperta.
 *
 * Il tetto e il residuo reale (totale meno quanto gia incassato su ALTRE
 * richieste), non il totale: chiedere piu del dovuto e sempre un errore di
 * battitura. Una prenotazione storica senza totale non ha residuo calcolabile
 * e resta libera: li il totale va sistemato prima, dal pannello economico.
 */
export function adminRequestAmountDecision(input: {
  requestStatus: string;
  requestType: string;
  currentAmountCents: number;
  nextAmountCents: number;
  totalAmountCents: number | null;
  paidOnOtherRequestsCents: number;
}): RequestAmountDecision {
  if (!isEditableRequestStatus(input.requestStatus)) {
    return "status_not_editable";
  }
  if (
    !Number.isSafeInteger(input.nextAmountCents) ||
    input.nextAmountCents <= 0
  ) {
    return "invalid_amount";
  }
  if (input.totalAmountCents !== null) {
    const residual = input.totalAmountCents - input.paidOnOtherRequestsCents;
    if (input.nextAmountCents > residual) return "exceeds_residual";
    // Un "acconto" pari a tutto il residuo non e piu un acconto: se l'intento
    // e incassare il totale va cambiato il tipo, non gonfiato l'acconto.
    if (input.requestType === "deposit" && input.nextAmountCents >= residual) {
      return "deposit_not_partial";
    }
  }
  if (input.nextAmountCents === input.currentAmountCents) return "unchanged";
  return "apply";
}

export type ManualPaymentPlan =
  | { kind: "settle"; requestId: string }
  | { kind: "create"; type: "deposit" | "full" | "balance" }
  | {
      kind: "invalid";
      reason: "invalid_amount" | "exceeds_residual" | "total_required";
    };

/**
 * Registrazione di un incasso arrivato in ufficio senza una richiesta che gli
 * corrisponda: le prenotazioni storiche non ne hanno nessuna, e un versamento
 * parziale non coincide mai con quella aperta.
 *
 * Se una richiesta aperta ha esattamente quell'importo si salda quella, senza
 * creare doppioni: e il caso normale, e mantiene il collegamento con la
 * scadenza e le email gia inviate. Negli altri casi nasce una richiesta gia
 * saldata, che e il modo del modello per dire "questo denaro e entrato".
 */
export function adminManualPaymentPlan(input: {
  amountCents: number;
  totalAmountCents: number | null;
  alreadyPaidCents: number;
  openRequests: Array<{ id: string; type: string; amountCents: number }>;
}): ManualPaymentPlan {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    return { kind: "invalid", reason: "invalid_amount" };
  }
  if (input.totalAmountCents === null) {
    return { kind: "invalid", reason: "total_required" };
  }
  const residual = input.totalAmountCents - input.alreadyPaidCents;
  if (input.amountCents > residual) {
    return { kind: "invalid", reason: "exceeds_residual" };
  }
  const exact = input.openRequests.find(
    (request) => request.amountCents === input.amountCents,
  );
  if (exact) return { kind: "settle", requestId: exact.id };
  if (input.alreadyPaidCents > 0) return { kind: "create", type: "balance" };
  return {
    kind: "create",
    type: input.amountCents >= input.totalAmountCents ? "full" : "deposit",
  };
}

/**
 * Stato economico di riepilogo dopo un movimento manuale.
 *
 * Non si puo riusare `paymentStatusAfterPayment` dei pagamenti automatici:
 * quella funzione ragiona sul tipo della richiesta appena incassata e
 * dichiarerebbe "paid" anche un versamento parziale. Qui l'unico dato certo e
 * quanto e stato incassato in tutto, quindi si guarda solo quello: sotto il
 * totale la prenotazione ha un acconto, non un saldo.
 */
export function summaryStatusAfterManualMovement(input: {
  amountPaidCents: number;
  totalAmountCents: number | null;
  fallbackStatus: string;
}): string {
  if (input.amountPaidCents <= 0) return input.fallbackStatus;
  if (
    input.totalAmountCents !== null &&
    input.amountPaidCents >= input.totalAmountCents
  ) {
    return "paid";
  }
  return "deposit";
}

/**
 * Lo stesso riferimento non si registra due volte sulla stessa prenotazione:
 * un doppio clic sul pulsante, o un operatore che rifa la stessa operazione
 * dopo un errore di rete, gonfierebbe l'incassato di denaro mai arrivato.
 */
export function isDuplicateManualPayment(input: {
  amountCents: number;
  transactionReference: string;
  existing: Array<{ amountCents: number; transactionReference: string | null }>;
}): boolean {
  const reference = input.transactionReference.trim().toLowerCase();
  if (!reference) return false;
  return input.existing.some(
    (row) =>
      row.amountCents === input.amountCents &&
      (row.transactionReference ?? "").trim().toLowerCase() === reference,
  );
}

export type OpenRequestsRealignment = {
  cancel: string[];
  setAmount: { id: string; amountCents: number } | null;
};

/**
 * Dopo un movimento manuale le richieste ancora aperte devono continuare a
 * descrivere il residuo, altrimenti l'agenzia sollecita denaro gia incassato.
 *
 * Residuo azzerato: non c'e piu niente da chiedere, le aperte si chiudono.
 * Residuo positivo con una sola richiesta aperta: quella richiesta diventa il
 * residuo. Con piu richieste aperte non si indovina come ripartirlo e si
 * lascia tutto com'e: e una situazione anomala che l'operatore deve vedere.
 */
export function openRequestsRealignment(input: {
  residualCents: number;
  openRequests: Array<{ id: string; amountCents: number }>;
}): OpenRequestsRealignment {
  if (input.openRequests.length === 0) return { cancel: [], setAmount: null };
  if (input.residualCents <= 0) {
    return {
      cancel: input.openRequests.map((request) => request.id),
      setAmount: null,
    };
  }
  if (input.openRequests.length > 1) return { cancel: [], setAmount: null };
  const [only] = input.openRequests;
  if (only.amountCents === input.residualCents) {
    return { cancel: [], setAmount: null };
  }
  return {
    cancel: [],
    setAmount: { id: only.id, amountCents: input.residualCents },
  };
}

export type PaymentReversalDecision =
  | "apply"
  | "not_paid"
  | "card_requires_refund";

/**
 * Storno di un incasso registrato a mano per errore.
 *
 * Un incasso su carta non si storna: quel denaro e uscito davvero dal conto
 * del cliente e va restituito dal flusso rimborsi, che parla con Stripe. Qui
 * si annullano soltanto le registrazioni fatte a mano, dove l'errore e nella
 * scrittura e non nel movimento.
 */
export function adminPaymentReversalDecision(input: {
  requestStatus: string;
  method: string | null;
  hasSucceededCardAttempt: boolean;
}): PaymentReversalDecision {
  if (input.requestStatus !== "paid") return "not_paid";
  if (input.method === "card" || input.hasSucceededCardAttempt) {
    return "card_requires_refund";
  }
  return "apply";
}

export type BookingTotalDecision =
  | "apply"
  | "unchanged"
  | "invalid_amount"
  | "below_collected";

/**
 * Il totale si puo correggere (sconto concordato al telefono, prezzo sbagliato
 * in fase di inserimento) ma non puo scendere sotto il denaro gia incassato:
 * quello sarebbe un rimborso, e ha un percorso suo.
 */
export function adminBookingTotalDecision(input: {
  nextTotalCents: number;
  currentTotalCents: number | null;
  amountPaidCents: number;
}): BookingTotalDecision {
  if (!Number.isSafeInteger(input.nextTotalCents) || input.nextTotalCents < 0) {
    return "invalid_amount";
  }
  if (input.nextTotalCents < input.amountPaidCents) return "below_collected";
  if (input.nextTotalCents === input.currentTotalCents) return "unchanged";
  return "apply";
}

const PROFILE_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type BookingProfileInput = {
  customerName?: unknown;
  email?: unknown;
  phone?: unknown;
  customerNotificationsEnabled?: unknown;
  servizioCasa?: unknown;
  homePickupAddress?: unknown;
};

export type NormalizedBookingProfile = {
  customerName: string;
  email: string | null;
  phone: string | null;
  customerNotificationsEnabled: boolean;
  servizioCasa: boolean;
  homePickupAddress: string | null;
};

export class BookingProfileValidationError extends Error {}

/**
 * Anagrafica del referente. Non ha effetti economici: si aggiorna anche a
 * prenotazione pagata, perche un numero di telefono sbagliato va corretto
 * proprio quando la gita e ormai vicina.
 */
export function normalizeBookingProfile(
  raw: BookingProfileInput,
  current: NormalizedBookingProfile,
): NormalizedBookingProfile {
  const customerName =
    raw.customerName === undefined
      ? current.customerName
      : String(raw.customerName ?? "").trim();
  if (!customerName) {
    throw new BookingProfileValidationError("Nome del referente obbligatorio.");
  }
  if (customerName.length > 200) {
    throw new BookingProfileValidationError(
      "Nome del referente troppo lungo (massimo 200 caratteri).",
    );
  }

  const email =
    raw.email === undefined
      ? current.email
      : String(raw.email ?? "").trim() || null;
  if (email && (email.length > 200 || !PROFILE_EMAIL_REGEX.test(email))) {
    throw new BookingProfileValidationError("Indirizzo email non valido.");
  }

  const phone =
    raw.phone === undefined
      ? current.phone
      : String(raw.phone ?? "").trim() || null;
  if (phone && phone.length > 40) {
    throw new BookingProfileValidationError(
      "Numero di telefono troppo lungo (massimo 40 caratteri).",
    );
  }

  const customerNotificationsEnabled =
    raw.customerNotificationsEnabled === undefined
      ? current.customerNotificationsEnabled
      : Boolean(raw.customerNotificationsEnabled);
  // Senza indirizzo non c'e nulla da notificare: lasciare il flag acceso
  // significherebbe promettere email che nessun percorso puo spedire.
  if (customerNotificationsEnabled && !email) {
    throw new BookingProfileValidationError(
      "Per attivare le comunicazioni al cliente serve un indirizzo email.",
    );
  }

  const servizioCasa =
    raw.servizioCasa === undefined
      ? current.servizioCasa
      : Boolean(raw.servizioCasa);
  const homePickupAddress =
    raw.homePickupAddress === undefined
      ? current.homePickupAddress
      : String(raw.homePickupAddress ?? "").trim() || null;
  if (homePickupAddress && homePickupAddress.length > 500) {
    throw new BookingProfileValidationError(
      "Indirizzo di ritiro troppo lungo (massimo 500 caratteri).",
    );
  }
  if (servizioCasa && !homePickupAddress) {
    throw new BookingProfileValidationError(
      "Il ritiro a domicilio richiede l'indirizzo di ritiro.",
    );
  }

  return {
    customerName,
    email,
    phone,
    customerNotificationsEnabled,
    servizioCasa,
    // Spegnere il servizio casa cancella l'indirizzo: tenerlo darebbe agli
    // elenchi operativi un dato che non deve piu essere letto.
    homePickupAddress: servizioCasa ? homePickupAddress : null,
  };
}

/**
 * Motivo dell'intervento. Obbligatorio dove il movimento cambia il denaro
 * registrato (correzione di importo, storno): tra sei mesi nessuno ricorda
 * perche un incasso e sparito, e il riferimento dell'operazione da solo non lo
 * spiega.
 */
export function normalizeAdminActionReason(
  value: unknown,
  opts: { required: boolean },
): string | null {
  const reason = typeof value === "string" ? value.trim().slice(0, 500) : "";
  if (!reason) {
    if (opts.required) {
      throw new BookingProfileValidationError(
        "Indica il motivo della correzione.",
      );
    }
    return null;
  }
  return reason;
}
