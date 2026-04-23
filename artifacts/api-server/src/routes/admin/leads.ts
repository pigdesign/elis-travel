import { Router } from "express";
import { db } from "@workspace/db";
import { leadsTable, leadNotesTable, offersTable, excursionsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

const router = Router();

const VALID_STATUSES = ["new", "contacted", "quote_sent", "won", "lost"] as const;

router.get("/leads", async (_req, res) => {
  try {
    const leads = await db
      .select({
        id: leadsTable.id,
        customerName: leadsTable.customerName,
        email: leadsTable.email,
        phone: leadsTable.phone,
        customerId: leadsTable.customerId,
        offerId: leadsTable.offerId,
        excursionId: leadsTable.excursionId,
        type: leadsTable.type,
        status: leadsTable.status,
        channel: leadsTable.channel,
        assignedTo: leadsTable.assignedTo,
        lastContactAt: leadsTable.lastContactAt,
        receivedAt: leadsTable.receivedAt,
        createdAt: leadsTable.createdAt,
        updatedAt: leadsTable.updatedAt,
        offerName: offersTable.name,
        excursionName: excursionsTable.name,
      })
      .from(leadsTable)
      .leftJoin(offersTable, eq(leadsTable.offerId, offersTable.id))
      .leftJoin(excursionsTable, eq(leadsTable.excursionId, excursionsTable.id))
      .orderBy(desc(leadsTable.receivedAt));

    res.json(leads);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.patch("/leads/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body as { status: string };

    if (!VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
      res.status(400).json({ error: `Stato non valido. Valori accettati: ${VALID_STATUSES.join(", ")}` });
      return;
    }

    const now = new Date();
    const [updated] = await db
      .update(leadsTable)
      .set({
        status,
        lastContactAt: status === "contacted" || status === "quote_sent" ? now : undefined,
        updatedAt: now,
      })
      .where(eq(leadsTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Lead non trovato." });
      return;
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.get("/leads/:id/notes", async (req, res) => {
  try {
    const { id } = req.params;
    const notes = await db
      .select()
      .from(leadNotesTable)
      .where(eq(leadNotesTable.leadId, id))
      .orderBy(desc(leadNotesTable.createdAt));

    res.json(notes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.post("/leads/:id/notes", async (req, res) => {
  try {
    const { id } = req.params;
    const { text, authorName } = req.body as { text: string; authorName?: string };

    if (!text?.trim()) {
      res.status(400).json({ error: "Il testo della nota è obbligatorio." });
      return;
    }

    const [lead] = await db
      .select({ id: leadsTable.id })
      .from(leadsTable)
      .where(eq(leadsTable.id, id))
      .limit(1);

    if (!lead) {
      res.status(404).json({ error: "Lead non trovato." });
      return;
    }

    const [note] = await db
      .insert(leadNotesTable)
      .values({
        leadId: id,
        text: text.trim(),
        authorName: authorName?.trim() || "Staff",
      })
      .returning();

    res.status(201).json(note);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

export default router;
