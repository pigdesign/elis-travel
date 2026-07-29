import rateLimit from "express-rate-limit";

// Rate limit globale opzionale (es. 1000 richieste ogni 15 minuti)
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  message: { error: "Troppe richieste, riprova più tardi." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit stretto per il login (es. 5 tentativi ogni 15 minuti)
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: "Troppi tentativi di login. Riprova tra 15 minuti." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit per la generazione PDF delle locandine: il primo download di una
// gita avvia un Chromium headless, quindi va tenuto fuori portata di chi
// volesse usarlo per esaurire la memoria del container. Le richieste servite
// dalla cache passano comunque da qui, perciò il limite è generoso.
export const posterPdfLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  message: { error: "Troppi download. Riprova tra qualche minuto." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit per lead e prenotazioni (es. 10 richieste ogni ora)
export const publicFormsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  message: { error: "Hai inviato troppe richieste. Riprova più tardi." },
  standardHeaders: true,
  legacyHeaders: false,
});
