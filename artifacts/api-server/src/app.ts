import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sessionPool } from "@workspace/db";
import router from "./routes";
import { stripeWebhookHandler } from "./routes/stripe-webhook";
import { ftpImageProxy } from "./routes/ftp-image-proxy";
import { logger } from "./lib/logger";
import { globalLimiter } from "./middlewares/rateLimiter";
import { siteGate } from "./middlewares/siteGate";

if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set in production");
}

const PgSession = connectPgSimple(session);

const app: Express = express();

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://js.stripe.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "https://elis-travel.it", "http://elis-travel.it", "https://*.elis-travel.it", "http://*.elis-travel.it", "blob:", "https://storage.googleapis.com"],
        connectSrc: ["'self'", "https://storage.googleapis.com", "https://api.stripe.com"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'", "https://js.stripe.com", "https://hooks.stripe.com"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

// Gate Basic Auth pre-lancio: chiude l'intero sito al pubblico se le variabili
// SITE_BASIC_AUTH_USER/PASS sono impostate. Esenti healthcheck e webhook Stripe.
app.use(siteGate);

// Stripe webhook needs raw body — must be registered before express.json()
app.post(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  stripeWebhookHandler,
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required.");
}

app.use(
  session({
    store: new PgSession({
      pool: sessionPool,
      tableName: "admin_sessions",
    }),
    name: "elis.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: "lax",
    },
  }),
);

// Proxy immagini: inoltra /ftp-image/* all'origine Aruba così gli URL già in DB
// continuano a funzionare quando il dominio passa a Railway. Reversibile:
// basta rimuovere questa riga per tornare al comportamento precedente.
app.use("/ftp-image", ftpImageProxy);

app.use("/api", globalLimiter, router);

if (process.env.NODE_ENV === "production") {
  const frontendDist = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "elis-travel",
    "dist",
    "public",
  );
  app.use(express.static(frontendDist));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

export default app;
