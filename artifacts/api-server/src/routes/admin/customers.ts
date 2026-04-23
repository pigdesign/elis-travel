import { Router } from "express";
import { db } from "@workspace/db";
import {
  customersTable,
  customerExternalLinksTable,
  customerSyncEventsTable,
  EXTERNAL_SYSTEMS,
  type SyncEventType,
  type SyncEventStatus,
} from "@workspace/db/schema";
import { eq, or, ilike, desc, and, count } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { rivieraService } from "../../services/riviera-integration.service";

const RMS_SYSTEM = EXTERNAL_SYSTEMS[0];
const PAGE_SIZE = 20;

function syncEvent(
  customerId: string,
  sourceSystem: string,
  eventType: SyncEventType,
  status: SyncEventStatus,
  payload: object,
) {
  return db.insert(customerSyncEventsTable).values({
    eventId: randomUUID(),
    customerId,
    sourceSystem,
    eventType,
    status,
    payload: JSON.stringify(payload),
    occurredAt: new Date(),
  });
}

const router = Router();

router.get("/customers", async (req, res) => {
  try {
    const q = (req.query.q as string | undefined)?.trim();
    const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10) || 1);
    const offset = (page - 1) * PAGE_SIZE;

    const whereClause = q
      ? or(
          ilike(customersTable.firstName, `%${q}%`),
          ilike(customersTable.lastName, `%${q}%`),
          ilike(customersTable.email, `%${q}%`),
        )
      : undefined;

    const [{ total }] = await db
      .select({ total: count() })
      .from(customersTable)
      .where(whereClause);

    const customers = whereClause
      ? await db
          .select({
            id: customersTable.id,
            firstName: customersTable.firstName,
            lastName: customersTable.lastName,
            email: customersTable.email,
            phone: customersTable.phone,
            createdAt: customersTable.createdAt,
            updatedAt: customersTable.updatedAt,
          })
          .from(customersTable)
          .where(whereClause)
          .orderBy(desc(customersTable.createdAt))
          .limit(PAGE_SIZE)
          .offset(offset)
      : await db
          .select({
            id: customersTable.id,
            firstName: customersTable.firstName,
            lastName: customersTable.lastName,
            email: customersTable.email,
            phone: customersTable.phone,
            createdAt: customersTable.createdAt,
            updatedAt: customersTable.updatedAt,
          })
          .from(customersTable)
          .orderBy(desc(customersTable.createdAt))
          .limit(PAGE_SIZE)
          .offset(offset);

    const links = await db
      .select({
        customerId: customerExternalLinksTable.customerId,
        externalId: customerExternalLinksTable.externalId,
        lastSyncAt: customerExternalLinksTable.lastSyncAt,
      })
      .from(customerExternalLinksTable)
      .where(eq(customerExternalLinksTable.externalSystem, RMS_SYSTEM));

    const linkMap = new Map(links.map((l) => [l.customerId, l]));

    const items = customers.map((c) => {
      const link = linkMap.get(c.id);
      return {
        ...c,
        rmsLinked: Boolean(link),
        rmsExternalId: link?.externalId ?? null,
        rmsLastSyncAt: link?.lastSyncAt ?? null,
      };
    });

    res.json({
      items,
      total: Number(total),
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.ceil(Number(total) / PAGE_SIZE),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.post("/customers", async (req, res) => {
  try {
    const { firstName, lastName, email, phone } = req.body as {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
    };

    if (!firstName?.trim() || !lastName?.trim() || !email?.trim()) {
      res.status(400).json({ error: "Nome, cognome e email sono obbligatori." });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      res.status(400).json({ error: "Email non valida." });
      return;
    }

    const [customer] = await db
      .insert(customersTable)
      .values({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
      })
      .returning();

    res.status(201).json({ ...customer, rmsLinked: false, rmsExternalId: null, rmsLastSyncAt: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.get("/customers/rms/search", async (req, res) => {
  try {
    const q = (req.query.q as string | undefined)?.trim();
    if (!q || q.length < 2) {
      res.status(400).json({ error: "Inserisci almeno 2 caratteri per la ricerca." });
      return;
    }

    const result = await rivieraService.searchCustomers(q);
    if (!result.success) {
      res.status(502).json({ error: result.error });
      return;
    }

    res.json(result.data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.post("/customers/rms/import", async (req, res) => {
  try {
    const { rmsExternalId, firstName, lastName, email, phone } = req.body as {
      rmsExternalId?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string | null;
    };

    if (!rmsExternalId?.trim() || !firstName?.trim() || !lastName?.trim() || !email?.trim()) {
      res.status(400).json({ error: "rmsExternalId, firstName, lastName ed email sono obbligatori." });
      return;
    }

    const existingByEmail = await db
      .select({ id: customersTable.id })
      .from(customersTable)
      .where(ilike(customersTable.email, email.trim()))
      .limit(1);

    let customerId: string;
    if (existingByEmail.length > 0) {
      customerId = existingByEmail[0].id;
    } else {
      const [newCustomer] = await db
        .insert(customersTable)
        .values({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone?.trim() || null,
        })
        .returning({ id: customersTable.id });
      customerId = newCustomer.id;
    }

    const [existingLink] = await db
      .select()
      .from(customerExternalLinksTable)
      .where(
        and(
          eq(customerExternalLinksTable.customerId, customerId),
          eq(customerExternalLinksTable.externalSystem, RMS_SYSTEM),
        ),
      )
      .limit(1);

    if (!existingLink) {
      await db.insert(customerExternalLinksTable).values({
        customerId,
        externalSystem: RMS_SYSTEM,
        externalId: rmsExternalId.trim(),
      });

      await syncEvent(customerId, "riviera_rms", "pull_from_rms", "success", {
        rmsExternalId: rmsExternalId.trim(),
        source: "import",
      });
    }

    const [finalCustomer] = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.id, customerId))
      .limit(1);

    const [finalLink] = await db
      .select()
      .from(customerExternalLinksTable)
      .where(
        and(
          eq(customerExternalLinksTable.customerId, customerId),
          eq(customerExternalLinksTable.externalSystem, RMS_SYSTEM),
        ),
      )
      .limit(1);

    res.status(201).json({
      ...finalCustomer,
      rmsLinked: true,
      rmsExternalId: finalLink?.externalId ?? null,
      rmsLastSyncAt: finalLink?.lastSyncAt ?? null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.get("/customers/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [customer] = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.id, id))
      .limit(1);

    if (!customer) {
      res.status(404).json({ error: "Cliente non trovato." });
      return;
    }

    const [link] = await db
      .select()
      .from(customerExternalLinksTable)
      .where(
        and(
          eq(customerExternalLinksTable.customerId, id),
          eq(customerExternalLinksTable.externalSystem, RMS_SYSTEM),
        ),
      )
      .limit(1);

    const events = await db
      .select()
      .from(customerSyncEventsTable)
      .where(eq(customerSyncEventsTable.customerId, id))
      .orderBy(desc(customerSyncEventsTable.occurredAt))
      .limit(20);

    res.json({
      ...customer,
      rmsLinked: Boolean(link),
      rmsExternalId: link?.externalId ?? null,
      rmsLastSyncAt: link?.lastSyncAt ?? null,
      syncEvents: events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        status: e.status,
        occurredAt: e.occurredAt,
        createdAt: e.createdAt,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.patch("/customers/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, email, phone } = req.body as {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string | null;
    };

    const allowed: Record<string, unknown> = {};
    if (firstName !== undefined) allowed.firstName = firstName.trim();
    if (lastName !== undefined) allowed.lastName = lastName.trim();
    if (email !== undefined) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        res.status(400).json({ error: "Email non valida." });
        return;
      }
      allowed.email = email.trim().toLowerCase();
    }
    if (phone !== undefined) allowed.phone = phone?.trim() || null;

    if (Object.keys(allowed).length === 0) {
      res.status(400).json({ error: "Nessun campo valido da aggiornare." });
      return;
    }

    const now = new Date();
    const [updated] = await db
      .update(customersTable)
      .set({ ...allowed, updatedAt: now })
      .where(eq(customersTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Cliente non trovato." });
      return;
    }

    const [link] = await db
      .select()
      .from(customerExternalLinksTable)
      .where(
        and(
          eq(customerExternalLinksTable.customerId, id),
          eq(customerExternalLinksTable.externalSystem, RMS_SYSTEM),
        ),
      )
      .limit(1);

    if (link) {
      void (async () => {
        const syncResult = await rivieraService.syncCustomerToRms(
          {
            id: updated.id,
            firstName: updated.firstName,
            lastName: updated.lastName,
            email: updated.email,
            phone: updated.phone,
            externalRef: link.externalId,
          },
          updated.updatedAt,
        );

        await syncEvent(updated.id, "elis_travel", "push_to_rms", syncResult.success ? "success" : "failed", {
          firstName: updated.firstName,
          lastName: updated.lastName,
          email: updated.email,
          phone: updated.phone,
          lastUpdatedAt: updated.updatedAt.toISOString(),
          error: syncResult.success ? undefined : syncResult.error,
        });

        if (syncResult.success) {
          await db
            .update(customerExternalLinksTable)
            .set({ lastSyncAt: new Date(), updatedAt: new Date() })
            .where(eq(customerExternalLinksTable.id, link.id));
        }
      })();
    }

    res.json({
      ...updated,
      rmsLinked: Boolean(link),
      rmsExternalId: link?.externalId ?? null,
      rmsLastSyncAt: link?.lastSyncAt ?? null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.post("/customers/:id/link", async (req, res) => {
  try {
    const { id } = req.params;
    const { rmsExternalId } = req.body as { rmsExternalId?: string };

    if (!rmsExternalId?.trim()) {
      res.status(400).json({ error: "rmsExternalId è obbligatorio." });
      return;
    }

    const [customer] = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.id, id))
      .limit(1);

    if (!customer) {
      res.status(404).json({ error: "Cliente non trovato." });
      return;
    }

    const [existing] = await db
      .select()
      .from(customerExternalLinksTable)
      .where(
        and(
          eq(customerExternalLinksTable.customerId, id),
          eq(customerExternalLinksTable.externalSystem, RMS_SYSTEM),
        ),
      )
      .limit(1);

    let link;
    if (existing) {
      [link] = await db
        .update(customerExternalLinksTable)
        .set({ externalId: rmsExternalId.trim(), updatedAt: new Date() })
        .where(eq(customerExternalLinksTable.id, existing.id))
        .returning();
    } else {
      [link] = await db
        .insert(customerExternalLinksTable)
        .values({
          customerId: id,
          externalSystem: RMS_SYSTEM,
          externalId: rmsExternalId.trim(),
        })
        .returning();
    }

    await syncEvent(id, "elis_travel", "pull_from_rms", "success", { rmsExternalId: rmsExternalId.trim() });

    res.json({ ...customer, rmsLinked: true, rmsExternalId: link.externalId, rmsLastSyncAt: link.lastSyncAt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.post("/customers/:id/sync", async (req, res) => {
  try {
    const { id } = req.params;

    const [customer] = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.id, id))
      .limit(1);

    if (!customer) {
      res.status(404).json({ error: "Cliente non trovato." });
      return;
    }

    const [link] = await db
      .select()
      .from(customerExternalLinksTable)
      .where(
        and(
          eq(customerExternalLinksTable.customerId, id),
          eq(customerExternalLinksTable.externalSystem, RMS_SYSTEM),
        ),
      )
      .limit(1);

    if (!link) {
      res.status(400).json({ error: "Il cliente non è ancora collegato a RMS. Usa prima 'Collega a RMS'." });
      return;
    }

    res.status(202).json({ ok: true, message: "Sincronizzazione avviata in background." });

    void (async () => {
      const syncResult = await rivieraService.syncCustomerToRms(
        {
          id: customer.id,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          phone: customer.phone,
          externalRef: link.externalId,
        },
        customer.updatedAt,
      );

      await syncEvent(id, "elis_travel", "push_to_rms", syncResult.success ? "success" : "failed", {
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
        lastUpdatedAt: customer.updatedAt.toISOString(),
        error: syncResult.success ? undefined : syncResult.error,
      });

      if (syncResult.success) {
        await db
          .update(customerExternalLinksTable)
          .set({ lastSyncAt: new Date(), updatedAt: new Date() })
          .where(eq(customerExternalLinksTable.id, link.id));
      }
    })();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

export default router;
