// Segnale globale di "sessione admin scaduta".
//
// Il controllo della sessione avviene solo all'avvio dell'app: se il cookie
// muore mentre si lavora, l'interfaccia continua a sembrare a posto e ogni
// scrittura fallisce con 401 — che e' il modo peggiore di scoprirlo, perche'
// succede proprio quando si preme Salva.
//
// Qui i 401 delle chiamate admin accendono un flag globale, mostrato come
// fascia in cima al backoffice. Di proposito NON si fa il redirect al login:
// portare via l'utente dalla pagina distruggerebbe il form che ha aperto, cioe'
// esattamente il danno che si vuole evitare.

type Listener = () => void;

let expired = false;
const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function markSessionExpired(): void {
  if (expired) return;
  expired = true;
  emit();
}

export function clearSessionExpired(): void {
  if (!expired) return;
  expired = false;
  emit();
}

export function getSessionExpired(): boolean {
  return expired;
}

export function subscribeSessionExpiry(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Vero se l'errore e' un 401 su una chiamata del backoffice.
 *
 * Sono esclusi i path dell'area clienti, che hanno una sessione separata, e
 * `/api/auth/me`, che risponde 401 anche solo visitando il sito pubblico da
 * sloggati: non e' una sessione scaduta, e' l'assenza di sessione.
 */
export function isAdminAuthError(error: unknown): boolean {
  const err = error as { status?: number; url?: string } | null;
  if (!err || err.status !== 401) return false;

  const url = typeof err.url === "string" ? err.url : "";
  if (!url.includes("/api/")) return false;

  const path = url.slice(url.indexOf("/api/"));
  if (path.startsWith("/api/account")) return false;
  if (path.startsWith("/api/booking-portal")) return false;
  if (path.startsWith("/api/auth/me")) return false;
  if (path.startsWith("/api/catalog")) return false;

  return true;
}
