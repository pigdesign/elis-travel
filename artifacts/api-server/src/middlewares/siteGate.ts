import { type Request, type Response, type NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";

// Gate Basic Auth per l'intero sito durante il pre-lancio.
// Attivo SOLO se sono impostate entrambe SITE_BASIC_AUTH_USER e SITE_BASIC_AUTH_PASS:
// così si disattiva semplicemente rimuovendo le variabili, senza modifiche al codice.
// Esenti: healthcheck Railway e webhook Stripe (endpoint macchina, non possono autenticarsi).
const GATE_USER = process.env.SITE_BASIC_AUTH_USER || "";
const GATE_PASS = process.env.SITE_BASIC_AUTH_PASS || "";
const GATE_ENABLED = GATE_USER !== "" && GATE_PASS !== "";

const EXEMPT_PREFIXES = ["/api/healthz", "/api/webhooks/stripe"];

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function siteGate(req: Request, res: Response, next: NextFunction): void {
  if (!GATE_ENABLED) {
    next();
    return;
  }

  if (EXEMPT_PREFIXES.some((p) => req.path === p || req.path.startsWith(`${p}/`))) {
    next();
    return;
  }

  const header = req.headers.authorization || "";
  if (header.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    const user = idx >= 0 ? decoded.slice(0, idx) : decoded;
    const pass = idx >= 0 ? decoded.slice(idx + 1) : "";
    // Valuta sempre entrambi (niente short-circuit) per non esporre timing.
    const okUser = safeEqual(user, GATE_USER);
    const okPass = safeEqual(pass, GATE_PASS);
    if (okUser && okPass) {
      next();
      return;
    }
  }

  res.setHeader(
    "WWW-Authenticate",
    'Basic realm="ElisTravel - accesso riservato", charset="UTF-8"',
  );
  res.status(401).send("Accesso riservato: autenticazione richiesta.");
}
