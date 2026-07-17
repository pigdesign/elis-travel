import { Router } from "express";
import { db } from "@workspace/db";
import {
  excursionsTable,
  excursionBookingsTable,
  bookingParticipantsTable,
  bookingConsentsTable,
  paymentRequestsTable,
} from "@workspace/db/schema";
import { eq, and, asc, isNull, inArray, sql } from "drizzle-orm";
import {
  getPaymentSettings,
  computePaymentDeadline,
} from "../../services/excursion-pricing";
import { applyManualPayment } from "../../services/excursion-payments";
import { logger } from "../../lib/logger";

// ---------------------------------------------------------------------------
// Admin Gite v2: conferma gita con richieste saldo (idempotenti), conferma
// manuale dei pagamenti bonifico/ufficio, scadenze e prenotazioni scadute.
// ---------------------------------------------------------------------------

const router = Router();

// Crea la richiesta saldo per una prenotazione se ha un residuo e non ne ha
// già una: è la guardia di idempotenza per "conferma gita" e "richiedi saldo".
async function createBalanceRequestIfNeeded(
  booking: typeof excursionBookingsTable.$inferSelect,
  excursion: typeof excursionsTable.$inferSelect,
  balanceHours: number,
  now: Date,
): Promise<"created" | "exists" | "no_residual"> {
  const total = booking.totalAmountCents ?? 0;
  const residual = total - booking.amountPaidCents;
  if (residual <= 0 || booking.amountPaidCents <= 0) return "no_residual";

  const [existing] = await db
    .select({ id: paymentRequestsTable.id })
    .from(paymentRequestsTable)
    .where(
      and(
        eq(paymentRequestsTable.bookingId, booking.id),
        eq(paymentRequestsTable.type, "balance"),
      ),
    )
    .limit(1);
  if (existing) return "exists";

  const deadline = computePaymentDeadline({
    from: now,
    hours: balanceHours,
    excursion,
    hardLimitDate: excursion.balanceDeadlineDate,
  });

  await db.transaction(async (tx) => {
    await tx.insert(paymentRequestsTable).values({
      bookingId: booking.id,
      type: "balance",
      amountCents: residual,
      status: "pending",
      method: booking.paymentMethod,
      deadline,
    });
    await tx
      .update(excursionBookingsTable)
      .set({
        paymentStatus: "balance_requested",
        amountDueCents: residual,
        paymentDeadline: deadline,
        updatedAt: now,
      })
      .where(eq(excursionBookingsTable.id, booking.id));
  });
  return "created";
}

// Conferma manuale della gita (soglia raggiunta): stato → confirmed e
// richieste saldo per chi ha l'acconto pagato. Rieseguibile senza doppioni.
router.post("/excursions/:id/confirm-trip", async (req, res) => {
  try {
    const { id } = req.params;
    const [excursion] = await db
      .select()
      .from(excursionsTable)
      .where(eq(excursionsTable.id, id))
      .limit(1);
    if (!excursion) {
      res.status(404).json({ error: "Gita non trovata." });
      return;
    }
    if (["completed", "cancelled", "archived"].includes(excursion.status)) {
      res.status(400).json({ error: "La gita non è confermabile in questo stato." });
      return;
    }

    const now = new Date();
    if (excursion.status !== "confirmed") {
      await db
        .update(excursionsTable)
        .set({ status: "confirmed", confirmedAt: excursion.confirmedAt ?? now, updatedAt: now })
        .where(eq(excursionsTable.id, id));
    }

    const settings = await getPaymentSettings();
    const balanceHours = excursion.balanceHoursOverride ?? settings.balanceHours;

    // Prenotazioni attive con qualcosa di pagato ma non saldate
    const bookings = await db
      .select()
      .from(excursionBookingsTable)
      .where(
        and(
          eq(excursionBookingsTable.excursionId, id),
          isNull(excursionBookingsTable.cancelledAt),
        ),
      );

    let created = 0;
    let skipped = 0;
    for (const booking of bookings) {
      if (booking.paymentStatus === "paid" || booking.paymentStatus === "refunded") continue;
      const outcome = await createBalanceRequestIfNeeded(booking, excursion, balanceHours, now);
      if (outcome === "created") created += 1;
      else if (outcome === "exists") skipped += 1;
    }

    logger.info({ excursionId: id, created, skipped }, "Gita confermata, richieste saldo generate");
    res.json({ ok: true, status: "confirmed", balanceRequestsCreated: created, alreadyRequested: skipped });
  } catch (err) {
    console.error("Confirm trip failed:", err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

// Richiesta saldo manuale per singola prenotazione (idempotente).
router.post("/bookings/:bookingId/request-balance", async (req, res) => {
  try {
    const { bookingId } = req.params;
    const [booking] = await db
      .select()
      .from(excursionBookingsTable)
      .where(eq(excursionBookingsTable.id, bookingId))
      .limit(1);
    if (!booking || booking.cancelledAt) {
      res.status(404).json({ error: "Prenotazione non trovata o annullata." });
      return;
    }
    const [excursion] = await db
      .select()
      .from(excursionsTable)
      .where(eq(excursionsTable.id, booking.excursionId))
      .limit(1);
    if (!excursion) {
      res.status(404).json({ error: "Gita non trovata." });
      return;
    }
    const settings = await getPaymentSettings();
    const outcome = await createBalanceRequestIfNeeded(
      booking,
      excursion,
      excursion.balanceHoursOverride ?? settings.balanceHours,
      new Date(),
    );
    if (outcome === "no_residual") {
      res.status(400).json({ error: "Nessun residuo da richiedere (acconto non pagato o già saldato)." });
      return;
    }
    res.json({ ok: true, outcome });
  } catch (err) {
    console.error("Request balance failed:", err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

// Conferma manuale di una richiesta di pagamento (bonifico/ufficio ricevuto).
router.post("/payment-requests/:requestId/mark-paid", async (req, res) => {
  try {
    const { requestId } = req.params;
    const { transactionReference } = req.body as { transactionReference?: string };
    const applied = await applyManualPayment({
      paymentRequestId: requestId,
      transactionReference: transactionReference?.trim() || null,
    });
    if (!applied) {
      res.status(404).json({ error: "Richiesta di pagamento non trovata." });
      return;
    }
    res.json({ ok: true, alreadyApplied: applied.alreadyApplied });
  } catch (err) {
    console.error("Mark paid failed:", err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

// Estende/modifica la scadenza della prenotazione e delle richieste pendenti.
router.patch("/bookings/:bookingId/deadline", async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { deadline } = req.body as { deadline?: string };
    const parsed = deadline ? new Date(deadline) : null;
    if (!parsed || !Number.isFinite(parsed.getTime())) {
      res.status(400).json({ error: "Scadenza non valida." });
      return;
    }
    const now = new Date();
    const [booking] = await db
      .update(excursionBookingsTable)
      .set({ paymentDeadline: parsed, updatedAt: now })
      .where(eq(excursionBookingsTable.id, bookingId))
      .returning();
    if (!booking) {
      res.status(404).json({ error: "Prenotazione non trovata." });
      return;
    }
    // Se era scaduta, torna allo stato di attesa coerente col tipo richiesta
    if (booking.paymentStatus === "expired") {
      const revived =
        booking.paymentType === "balance" || (booking.amountPaidCents > 0 && (booking.totalAmountCents ?? 0) > booking.amountPaidCents)
          ? "balance_requested"
          : booking.paymentType === "full"
            ? "full_requested"
            : "deposit_requested";
      await db
        .update(excursionBookingsTable)
        .set({ paymentStatus: revived, updatedAt: now })
        .where(eq(excursionBookingsTable.id, bookingId));
    }
    await db
      .update(paymentRequestsTable)
      .set({ deadline: parsed, status: "pending", updatedAt: now })
      .where(
        and(
          eq(paymentRequestsTable.bookingId, bookingId),
          inArray(paymentRequestsTable.status, ["pending", "expired"]),
        ),
      );
    res.json({ ok: true });
  } catch (err) {
    console.error("Deadline update failed:", err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

// Marca come scadute le prenotazioni oltre scadenza di una gita; libera i
// posti solo se richiesto (impostazione o parametro esplicito).
router.post("/excursions/:id/expire-overdue", async (req, res) => {
  try {
    const { id } = req.params;
    const { releaseSeats } = req.body as { releaseSeats?: boolean };
    const settings = await getPaymentSettings();
    const shouldRelease = releaseSeats === true || (releaseSeats === undefined && settings.autoReleaseSeats);
    const now = new Date();

    const overdue = await db
      .select()
      .from(excursionBookingsTable)
      .where(
        and(
          eq(excursionBookingsTable.excursionId, id),
          isNull(excursionBookingsTable.cancelledAt),
          inArray(excursionBookingsTable.paymentStatus, [
            "deposit_requested",
            "full_requested",
            "balance_requested",
            "pending_card",
          ]),
          sql`${excursionBookingsTable.paymentDeadline} IS NOT NULL AND ${excursionBookingsTable.paymentDeadline} < ${now}`,
        ),
      );

    let expired = 0;
    let releasedSeats = 0;
    for (const booking of overdue) {
      await db.transaction(async (tx) => {
        await tx
          .update(excursionBookingsTable)
          .set({ paymentStatus: "expired", updatedAt: now })
          .where(eq(excursionBookingsTable.id, booking.id));
        await tx
          .update(paymentRequestsTable)
          .set({ status: "expired", updatedAt: now })
          .where(
            and(
              eq(paymentRequestsTable.bookingId, booking.id),
              eq(paymentRequestsTable.status, "pending"),
            ),
          );
        if (shouldRelease) {
          await tx
            .update(excursionsTable)
            .set({
              adherentsCount: sql`GREATEST(${excursionsTable.adherentsCount} - ${booking.seats}, 0)`,
              updatedAt: now,
            })
            .where(eq(excursionsTable.id, id));
          releasedSeats += booking.seats;
        }
      });
      expired += 1;
    }
    res.json({ ok: true, expired, releasedSeats });
  } catch (err) {
    console.error("Expire overdue failed:", err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

// Dettaglio completo prenotazione per l'admin: partecipanti, consensi,
// richieste di pagamento. Prenotazioni pre-v2 → participantsDetailed false.
router.get("/bookings/:bookingId/details", async (req, res) => {
  try {
    const { bookingId } = req.params;
    const [booking] = await db
      .select()
      .from(excursionBookingsTable)
      .where(eq(excursionBookingsTable.id, bookingId))
      .limit(1);
    if (!booking) {
      res.status(404).json({ error: "Prenotazione non trovata." });
      return;
    }
    const participants = await db
      .select()
      .from(bookingParticipantsTable)
      .where(eq(bookingParticipantsTable.bookingId, bookingId))
      .orderBy(asc(bookingParticipantsTable.sortOrder));
    const consents = await db
      .select()
      .from(bookingConsentsTable)
      .where(eq(bookingConsentsTable.bookingId, bookingId))
      .orderBy(asc(bookingConsentsTable.consentType));
    const paymentRequests = await db
      .select()
      .from(paymentRequestsTable)
      .where(eq(paymentRequestsTable.bookingId, bookingId))
      .orderBy(asc(paymentRequestsTable.createdAt));

    res.json({
      booking,
      participants,
      consents,
      paymentRequests,
      participantsDetailed: participants.length > 0,
    });
  } catch (err) {
    console.error("Booking details fetch failed:", err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

export default router;
