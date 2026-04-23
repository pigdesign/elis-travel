import { Router } from "express";
import { db } from "@workspace/db";
import {
  customersTable,
  customerExternalLinksTable,
  customerSyncEventsTable,
} from "@workspace/db/schema";
import { eq, or, ilike, desc, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { rivieraService } from "../../services/riviera-integration.service";

const router = Router();

router.get("/customers", async (req, res) => {
  try {
    const q = (req.query.q as string | undefined)?.trim();

    const base = db
      .select({
        id: customersTable.id,
        firstName: customersTable.firstName,
        lastName: customersTable.lastName,
        email: customersTable.email,
        phone: customersTable.phone,
        createdAt: customersTable.createdAt,
        updatedAt: customersTable.updatedAt,
      })
      .from(customersTable);

    const customers = q
      ? await base.where(
          or(
            ilike(customersTable.firstName, `%${q}%`),
            ilike(customersTable.lastName, `%${q}%`),
            ilike(customersTable.email, `%${q}%`),
          ),
        ).orderBy(desc(customersTable.createdAt))
      : await base.orderBy(desc(customersTable.createdAt));

    const links = await db
      .select({
        customerId: customerExternalLinksTable.customerId,
        externalId: customerExternalLinksTable.externalId,
        lastSyncAt: customerExternalLinksTable.lastSyncAt,
      })
      .from(customerExternalLinksTable)
      .where(eq(customerExternalLinksTable.externalSystem, "riviera_rms"));

    const linkMap = new Map(links.map((l) => [l.customerId, l]));

    const result = customers.map((c) => {
      const link = linkMap.get(c.id);
      return {
        ...c,
        rmsLinked: Boolean(link),
        rmsExternalId: link?.externalId ?? null,
        rmsLastSyncAt: link?.lastSyncAt ?? null,
      };
    });

    res.json(result);
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
          eq(customerExternalLinksTable.externalSystem, "riviera_rms"),
        ),
      )
      .limit(1);

    const syncEvents = await db
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
      syncEvents: syncEvents.map((e) => ({
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
          eq(customerExternalLinksTable.externalSystem, "riviera_rms"),
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

        await db.insert(customerSyncEventsTable).values({
          eventId: randomUUID(),
          customerId: updated.id,
          sourceSystem: "elis_travel",
          eventType: "push_to_rms",
          status: syncResult.success ? "success" : "failed",
          payload: JSON.stringify({
            firstName: updated.firstName,
            lastName: updated.lastName,
            email: updated.email,
            phone: updated.phone,
            lastUpdatedAt: updated.updatedAt.toISOString(),
            error: syncResult.success ? undefined : syncResult.error,
          }),
          occurredAt: new Date(),
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
          eq(customerExternalLinksTable.externalSystem, "riviera_rms"),
        ),
      )
      .limit(1);

    if (!existingLink) {
      await db.insert(customerExternalLinksTable).values({
        customerId,
        externalSystem: "riviera_rms",
        externalId: rmsExternalId.trim(),
      });

      await db.insert(customerSyncEventsTable).values({
        eventId: randomUUID(),
        customerId,
        sourceSystem: "riviera_rms",
        eventType: "pull_from_rms",
        status: "success",
        payload: JSON.stringify({ rmsExternalId: rmsExternalId.trim(), source: "import" }),
        occurredAt: new Date(),
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
          eq(customerExternalLinksTable.externalSystem, "riviera_rms"),
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
          eq(customerExternalLinksTable.externalSystem, "riviera_rms"),
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
          externalSystem: "riviera_rms",
          externalId: rmsExternalId.trim(),
        })
        .returning();
    }

    await db.insert(customerSyncEventsTable).values({
      eventId: randomUUID(),
      customerId: id,
      sourceSystem: "elis_travel",
      eventType: "pull_from_rms",
      status: "success",
      payload: JSON.stringify({ rmsExternalId: rmsExternalId.trim() }),
      occurredAt: new Date(),
    });

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
          eq(customerExternalLinksTable.externalSystem, "riviera_rms"),
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

      await db.insert(customerSyncEventsTable).values({
        eventId: randomUUID(),
        customerId: id,
        sourceSystem: "elis_travel",
        eventType: "push_to_rms",
        status: syncResult.success ? "success" : "failed",
        payload: JSON.stringify({
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          phone: customer.phone,
          lastUpdatedAt: customer.updatedAt.toISOString(),
          error: syncResult.success ? undefined : syncResult.error,
        }),
        occurredAt: new Date(),
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
