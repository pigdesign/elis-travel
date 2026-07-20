import { type Request, type Response } from "express";
import { logger } from "../lib/logger";

// Proxy per /ftp-image/*: recupera i file dall'origine Aruba e li restituisce.
// Serve a far funzionare gli URL assoluti già salvati nel DB
// (https://elis-travel.it/ftp-image/<uuid>.jpg) anche quando il dominio del
// gestionale sarà servito da Railway, SENZA migrare le immagini né toccare il DB.
//
// FTP_IMAGE_ORIGIN deve puntare a un host che raggiunge sempre lo spazio Aruba
// dove risiedono i file, senza redirect (altrimenti si crea un loop). Di default
// usa l'apex, corretto finché l'apex resta su Aruba.
const FTP_IMAGE_ORIGIN = (
  process.env.FTP_IMAGE_ORIGIN || "https://elis-travel.it"
).replace(/\/+$/, "");

const UPSTREAM_TIMEOUT_MS = 15_000;

export async function ftpImageProxy(req: Request, res: Response): Promise<void> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.status(405).end();
    return;
  }

  // req.path è relativo al mount point (/ftp-image), es. "/<uuid>.jpg"
  const rel = req.path.replace(/^\/+/, "");
  if (rel === "" || rel.includes("..")) {
    res.status(400).end();
    return;
  }
  const safePath = rel.split("/").map(encodeURIComponent).join("/");
  const upstreamUrl = `${FTP_IMAGE_ORIGIN}/ftp-image/${safePath}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(upstreamUrl, {
      method: req.method,
      redirect: "follow",
      signal: controller.signal,
    });

    if (!upstream.ok) {
      res.status(upstream.status || 502).end();
      return;
    }

    res.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") || "application/octet-stream",
    );
    // I nomi file sono uuid immutabili: cache lunga lato browser/CDN.
    res.setHeader("Cache-Control", "public, max-age=86400");
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) res.setHeader("Content-Length", contentLength);

    if (req.method === "HEAD") {
      res.status(upstream.status).end();
      return;
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status).send(buffer);
  } catch (err) {
    logger.warn({ err: String(err), upstreamUrl }, "ftp-image proxy fetch failed");
    if (!res.headersSent) res.status(502).end();
  } finally {
    clearTimeout(timeout);
  }
}
