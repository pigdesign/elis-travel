import { Router } from "express";
import { posterEngineDiagnostics } from "../../services/poster-pdf";

const router = Router();

/**
 * Stato del motore PDF delle locandine. Da aprire (loggati in admin) subito
 * dopo un deploy: se `ok` è false, il download PDF dal sito pubblico non
 * funzionerà, e `error` dice perché — tipicamente Chromium assente perché
 * nixpacks.toml non è stato applicato.
 */
router.get("/poster-diagnostics", async (_req, res) => {
  const diagnostics = await posterEngineDiagnostics();
  res.status(diagnostics.ok ? 200 : 503).json(diagnostics);
});

export default router;
