import { Router } from "express";
import { db } from "@workspace/db";
import { emailOutboxTable } from "@workspace/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { processEmailOutboxBatch } from "../../services/email-outbox";
import { logger } from "../../lib/logger";

const router = Router();

router.get("/email-outbox", async (_req, res) => {
  try {
    const [counts, recent] = await Promise.all([
      db
        .select({
          status: emailOutboxTable.status,
          count: sql<number>`count(*)::int`,
        })
        .from(emailOutboxTable)
        .groupBy(emailOutboxTable.status),
      db
        .select({
          id: emailOutboxTable.id,
          bookingId: emailOutboxTable.bookingId,
          eventType: emailOutboxTable.eventType,
          status: emailOutboxTable.status,
          attemptCount: emailOutboxTable.attemptCount,
          maxAttempts: emailOutboxTable.maxAttempts,
          nextAttemptAt: emailOutboxTable.nextAttemptAt,
          sentAt: emailOutboxTable.sentAt,
          lastError: emailOutboxTable.lastError,
          payload: emailOutboxTable.payload,
          createdAt: emailOutboxTable.createdAt,
        })
        .from(emailOutboxTable)
        .orderBy(desc(emailOutboxTable.createdAt))
        .limit(100),
    ]);

    res.json({
      counts: Object.fromEntries(counts.map((row) => [row.status, row.count])),
      entries: recent.map(({ payload, ...row }) => ({
        ...row,
        recipients: payload.to,
        subject: payload.subject,
      })),
    });
  } catch (error) {
    logger.error({ err: error }, "Lettura outbox email fallita");
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.post("/email-outbox/:id/retry", async (req, res) => {
  try {
    const [entry] = await db
      .update(emailOutboxTable)
      .set({
        status: "pending",
        attemptCount: 0,
        nextAttemptAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(emailOutboxTable.id, req.params.id))
      .returning({ id: emailOutboxTable.id });
    if (!entry) {
      res.status(404).json({ error: "Email non trovata." });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    logger.error({ err: error }, "Retry outbox email fallito");
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.post("/email-outbox/process", async (_req, res) => {
  try {
    const result = await processEmailOutboxBatch({ batchSize: 50 });
    res.json({ ok: true, ...result });
  } catch (error) {
    logger.error({ err: error }, "Elaborazione manuale outbox fallita");
    res.status(500).json({ error: "Invio email non riuscito." });
  }
});

export default router;
