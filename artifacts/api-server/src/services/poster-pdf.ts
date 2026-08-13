import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Browser, LaunchOptions } from "puppeteer-core";
import { logger } from "../lib/logger";

/**
 * Generazione PDF delle locandine.
 *
 * Non esiste un secondo impaginatore: il PDF è la stampa della stessa pagina
 * React usata dall'anteprima admin (src/pdf/PosterCover + PosterInnerPages),
 * servita su /locandina/gita/:id. Qui un Chromium headless apre quella pagina
 * e la stampa in A4 con impostazioni fisse, così il risultato non dipende
 * dalle preferenze di stampa di chi scarica.
 */

/** Oltre questa soglia il render viene abbandonato (pagina bloccata). */
const READY_TIMEOUT_MS = 30_000;
const NAVIGATION_TIMEOUT_MS = 30_000;

/**
 * Chromium resta acceso tra un download e l'altro (avviarlo costa ~5s), ma
 * dopo questo tempo di inattività viene chiuso: la sua memoria conta sul
 * limite del container, e per la gran parte della giornata nessuno scarica
 * niente. Meglio pagare l'avvio che tenere occupati centinaia di MB.
 */
const BROWSER_IDLE_MS = 2 * 60 * 1000;

/** Chromium è pesante: un render alla volta per non saturare la memoria. */
let renderQueue: Promise<unknown> = Promise.resolve();

let browserPromise: Promise<Browser> | null = null;
let idleTimer: NodeJS.Timeout | null = null;

function cancelIdleShutdown(): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function scheduleIdleShutdown(): void {
  cancelIdleShutdown();
  idleTimer = setTimeout(() => {
    idleTimer = null;
    const pending = browserPromise;
    browserPromise = null;
    void pending
      ?.then((browser) => browser.close())
      .then(() => logger.info("Chromium chiuso per inattività"))
      .catch(() => {});
  }, BROWSER_IDLE_MS);
  // Un timer in attesa non deve tenere vivo il processo allo spegnimento.
  idleTimer.unref();
}

export class PosterRenderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PosterRenderError";
  }
}

/**
 * Percorso dell'eseguibile Chromium. In produzione arriva da nixpacks
 * (nixpacks.toml → nixPkgs = ["chromium"]), che lo mette nel PATH; in locale
 * si ripiega sui percorsi tipici di macOS/Linux.
 */
function resolveExecutablePath(): string {
  const fromEnv = process.env["PUPPETEER_EXECUTABLE_PATH"];
  if (fromEnv) return fromEnv;

  const commands = [
    "chromium",
    "chromium-browser",
    "google-chrome-stable",
    "google-chrome",
  ];
  for (const command of commands) {
    try {
      const resolved = execFileSync("which", [command], { encoding: "utf8" }).trim();
      if (resolved) return resolved;
    } catch {
      // comando non presente: si prova il successivo
    }
  }

  const macPaths = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];
  for (const macPath of macPaths) {
    try {
      execFileSync("test", ["-x", macPath]);
      return macPath;
    } catch {
      // percorso non valido: si prova il successivo
    }
  }

  throw new PosterRenderError(
    "Chromium non trovato. Imposta PUPPETEER_EXECUTABLE_PATH oppure installa " +
      "chromium (in produzione lo fornisce nixpacks.toml).",
  );
}

async function getBrowser(): Promise<Browser> {
  const existing = browserPromise;
  if (existing) {
    try {
      const browser = await existing;
      if (browser.connected) return browser;
    } catch {
      // il launch precedente è fallito: si riprova sotto
    }
    browserPromise = null;
  }

  const launch = async () => {
    // Import dinamico: puppeteer-core è escluso dal bundle esbuild e serve solo
    // qui, così l'avvio del server non dipende dalla presenza di Chromium.
    const puppeteer = await import("puppeteer-core");
    const options: LaunchOptions = {
      executablePath: resolveExecutablePath(),
      headless: true,
      args: [
        // Il container Railway gira già isolato e senza privilegi.
        "--no-sandbox",
        "--disable-setuid-sandbox",
        // /dev/shm nei container è piccolo: senza questo Chromium crasha.
        "--disable-dev-shm-usage",
        "--disable-gpu",
        // Rende il testo identico tra macchine diverse.
        "--font-render-hinting=none",
      ],
    };
    const browser = await puppeteer.launch(options);
    browser.on("disconnected", () => {
      browserPromise = null;
    });
    logger.info("Chromium avviato per la generazione locandine");
    return browser;
  };

  const next = launch();
  browserPromise = next;
  next.catch(() => {
    browserPromise = null;
  });
  return next;
}

/**
 * Base URL della pagina locandina. In produzione il frontend è servito da
 * questo stesso processo (app.ts), quindi si stampa da localhost. In sviluppo
 * il sito sta sul dev server Vite, su una porta diversa.
 */
function posterBaseUrl(): string {
  const fromEnv = process.env["POSTER_BASE_URL"];
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (process.env["NODE_ENV"] !== "production") {
    return `http://localhost:${process.env["VITE_PORT"] || "5173"}`;
  }
  return `http://127.0.0.1:${process.env["PORT"] || "3000"}`;
}

async function renderPdf(pagePath: string): Promise<Buffer> {
  cancelIdleShutdown();
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // A4 a 96dpi: evita che il layout parta da un viewport troppo stretto.
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
    const url = `${posterBaseUrl()}${pagePath}`;
    // NON aspettare il silenzio della rete (networkidle0): la locandina monta
    // l'applicazione intera, quindi parte anche il controllo account
    // dell'area clienti. Quella fetch riceve la sua risposta subito, ma il
    // corpo del 401 non viene mai letto: per il browser la connessione resta
    // aperta e la rete non torna mai inattiva, così la navigazione scadeva
    // sempre e ogni PDF finiva sul ripiego. Il segnale giusto è quello
    // esplicito atteso qui sotto.
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS,
    });

    // La pagina segnala da sé quando font, immagini e titolo auto-adattivo
    // sono a posto: senza questa attesa il PDF esce con i font di ripiego.
    // Espressioni come stringa e non come funzione: girano nel browser, e il
    // tsconfig del server non include la lib DOM.
    await page.waitForFunction(
      "document.documentElement.dataset.poster === 'ready' || " +
        "document.documentElement.dataset.poster === 'error'",
      { timeout: READY_TIMEOUT_MS },
    );

    const state = (await page.evaluate(
      "document.documentElement.dataset.poster",
    )) as string | undefined;
    if (state === "error") {
      throw new PosterRenderError("La pagina locandina non ha caricato i dati.");
    }

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      // Rispetta la regola @page della locandina (A4 portrait, margini 0).
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
    scheduleIdleShutdown();
  }
}

/** Serializza i render: uno alla volta, in coda. */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = renderQueue.then(task, task);
  // La coda non deve interrompersi se un render fallisce.
  renderQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function cacheDir(): string {
  return path.join(os.tmpdir(), "elis-poster-pdf");
}

/**
 * Cache su disco del container: sopravvive alle richieste ma non ai deploy,
 * che è esattamente quello che serve (nessuna invalidazione da gestire a mano).
 */
async function readFromCache(cacheKey: string): Promise<Buffer | null> {
  try {
    return await readFile(path.join(cacheDir(), `${cacheKey}.pdf`));
  } catch {
    return null;
  }
}

async function writeToCache(cacheKey: string, pdf: Buffer): Promise<void> {
  try {
    const dir = cacheDir();
    await mkdir(dir, { recursive: true });
    // Scrittura atomica: due richieste in parallelo non si leggono a metà.
    const tmp = path.join(dir, `${cacheKey}.${process.pid}.tmp`);
    await writeFile(tmp, pdf);
    await rename(tmp, path.join(dir, `${cacheKey}.pdf`));
  } catch (err) {
    logger.warn({ err, cacheKey }, "Cache locandina non scrivibile");
  }
}

/**
 * Verifica che Chromium ci sia e parta, senza generare nessun PDF.
 * Serve subito dopo un deploy: dice in una risposta sola se il download
 * funzionerà, invece di aspettare che se ne accorga un cliente.
 */
export async function posterEngineDiagnostics(): Promise<{
  ok: boolean;
  executablePath: string | null;
  browserVersion: string | null;
  baseUrl: string;
  error: string | null;
}> {
  const baseUrl = posterBaseUrl();
  let executablePath: string | null = null;
  try {
    executablePath = resolveExecutablePath();
    cancelIdleShutdown();
    const browser = await getBrowser();
    const browserVersion = await browser.version();
    scheduleIdleShutdown();
    return { ok: true, executablePath, browserVersion, baseUrl, error: null };
  } catch (err) {
    return {
      ok: false,
      executablePath,
      browserVersion: null,
      baseUrl,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function posterCacheKey(id: string, revision: string): string {
  const hash = createHash("sha1").update(revision).digest("hex").slice(0, 12);
  return `excursion-${id}-${hash}`;
}

/**
 * PDF della scheda gita, dalla cache se la gita non è cambiata.
 * `revision` deve variare a ogni modifica che si vede in locandina.
 */
export async function getExcursionPosterPdf(
  excursionId: string,
  revision: string,
): Promise<Buffer> {
  const cacheKey = posterCacheKey(excursionId, revision);
  const cached = await readFromCache(cacheKey);
  if (cached) return cached;

  return enqueue(async () => {
    // Un'altra richiesta in coda può aver già generato lo stesso PDF.
    const raced = await readFromCache(cacheKey);
    if (raced) return raced;

    const startedAt = Date.now();
    const pdf = await renderPdf(`/locandina/gita/${excursionId}`);
    logger.info(
      { excursionId, ms: Date.now() - startedAt, bytes: pdf.byteLength },
      "Locandina PDF generata",
    );
    await writeToCache(cacheKey, pdf);
    return pdf;
  });
}
