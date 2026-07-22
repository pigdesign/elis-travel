import { Router, type Response } from "express";
import {
  BookingCancellationError,
  completeCancellationRefundManually,
  openAdminBookingCancellation,
  resolveBookingCancellation,
} from "../../services/booking-cancellations";

const router = Router();

function handleCancellationError(error: unknown, res: Response) {
  if (error instanceof BookingCancellationError) {
    res
      .status(error.statusCode)
      .json({ error: error.message, code: error.code });
    return true;
  }
  return false;
}

router.post("/bookings/:bookingId/cancellation", async (req, res) => {
  try {
    const adminUser = req.session.adminUser;
    if (!adminUser) {
      res.status(401).json({ error: "Autenticazione richiesta." });
      return;
    }
    const clientCommandId =
      typeof req.body?.clientCommandId === "string"
        ? req.body.clientCommandId.trim()
        : "";
    const result = await openAdminBookingCancellation({
      bookingId: req.params.bookingId,
      clientCommandId,
      reason: typeof req.body?.reason === "string" ? req.body.reason : null,
      actor: {
        id: adminUser.id,
        name: adminUser.name,
      },
    });
    res.status(result.alreadyOpen ? 200 : 201).json({ ok: true, ...result });
  } catch (error) {
    if (handleCancellationError(error, res)) return;
    console.error("Admin cancellation case creation failed:", error);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.post("/bookings/:bookingId/cancellation/resolve", async (req, res) => {
  try {
    const adminUser = req.session.adminUser;
    if (!adminUser) {
      res.status(401).json({ error: "Autenticazione richiesta." });
      return;
    }
    const cancellationCaseId =
      typeof req.body?.cancellationCaseId === "string"
        ? req.body.cancellationCaseId.trim()
        : "";
    if (!cancellationCaseId) {
      res.status(400).json({
        error: "Identificativo del caso di annullamento obbligatorio.",
        code: "invalid_case_id",
      });
      return;
    }
    const decision = req.body?.decision as unknown;
    if (decision !== "approve" && decision !== "reject") {
      res.status(400).json({
        error: "Decisione non valida: usa approve oppure reject.",
        code: "invalid_decision",
      });
      return;
    }
    const rawRefund = req.body?.refundAmountCents as unknown;
    const refundAmountCents =
      rawRefund === undefined ? undefined : Number(rawRefund);
    if (
      refundAmountCents !== undefined &&
      (!Number.isSafeInteger(refundAmountCents) || refundAmountCents < 0)
    ) {
      res.status(400).json({
        error: "Importo rimborso non valido.",
        code: "invalid_refund_amount",
      });
      return;
    }
    const result = await resolveBookingCancellation({
      bookingId: req.params.bookingId,
      cancellationCaseId,
      decision,
      refundAmountCents,
      note: typeof req.body?.note === "string" ? req.body.note : null,
      actor: {
        id: adminUser.id,
        name: adminUser.name,
      },
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    if (handleCancellationError(error, res)) return;
    console.error("Cancellation resolution failed:", error);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.post("/refunds/:refundId/complete-manually", async (req, res) => {
  try {
    const reference =
      typeof req.body?.reference === "string" ? req.body.reference : "";
    const result = await completeCancellationRefundManually({
      refundId: req.params.refundId,
      reference,
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    if (handleCancellationError(error, res)) return;
    console.error("Manual refund completion failed:", error);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

export default router;
