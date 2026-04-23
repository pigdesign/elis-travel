import { Router } from "express";
import { db } from "@workspace/db";
import {
  excursionsTable,
  excursionBookingsTable,
  excursionVehiclesTable,
} from "@workspace/db/schema";
import { eq, desc, sql } from "drizzle-orm";

const VALID_PAYMENT_STATUSES = ["pending", "deposit", "paid"] as const;
type PaymentStatus = (typeof VALID_PAYMENT_STATUSES)[number];
function isValidPaymentStatus(s: unknown): s is PaymentStatus {
  return typeof s === "string" && (VALID_PAYMENT_STATUSES as readonly string[]).includes(s);
}

const router = Router();

function calcFinancials(e: typeof excursionsTable.$inferSelect) {
  const price = parseFloat(e.pricePerPerson ?? "0");
  const meal = parseFloat(e.mealCostPerPerson ?? "0");
  const entrance = parseFloat(e.entranceCostPerPerson ?? "0");
  const extra = parseFloat(e.extraCostPerPerson ?? "0");
  const vehicleCost = parseFloat(e.vehicleFixedCost ?? "0");
  const count = e.adherentsCount;

  const ricaviStimati = price * count;
  const costiVariabili = (meal + entrance + extra) * count;
  const costiTotali = costiVariabili + vehicleCost;
  const margineNetto = ricaviStimati - costiTotali;

  return { ricaviStimati, costiVariabili, costiTotali, margineNetto };
}

router.get("/excursions", async (_req, res) => {
  try {
    const excursions = await db
      .select()
      .from(excursionsTable)
      .orderBy(desc(excursionsTable.date));

    const result = excursions.map((e) => ({
      ...e,
      ...calcFinancials(e),
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.post("/excursions", async (req, res) => {
  try {
    const body = req.body as Partial<typeof excursionsTable.$inferInsert>;

    const [created] = await db
      .insert(excursionsTable)
      .values({
        name: body.name ?? "Nuova gita",
        location: body.location ?? "",
        date: body.date ?? new Date().toISOString().split("T")[0],
        status: body.status ?? "draft",
        vehicleId: body.vehicleId ?? null,
        currentCapacity: body.currentCapacity ?? 0,
        minThreshold: body.minThreshold ?? 1,
        adherentsCount: body.adherentsCount ?? 0,
        depositsCount: body.depositsCount ?? 0,
        balancesCount: body.balancesCount ?? 0,
        vehicleFixedCost: body.vehicleFixedCost ?? "0",
        mealCostPerPerson: body.mealCostPerPerson ?? "0",
        entranceCostPerPerson: body.entranceCostPerPerson ?? "0",
        extraCostPerPerson: body.extraCostPerPerson ?? "0",
        pricePerPerson: body.pricePerPerson ?? "0",
        switchThreshold: body.switchThreshold ?? null,
        switchVehicleId: body.switchVehicleId ?? null,
        switchVehicleAdditionalCost: body.switchVehicleAdditionalCost ?? null,
        operationalNotes: body.operationalNotes ?? null,
        coverImageUrl: body.coverImageUrl ?? null,
      })
      .returning();

    res.status(201).json({ ...created, ...calcFinancials(created) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.get("/excursions/:id", async (req, res) => {
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

    const bookings = await db
      .select()
      .from(excursionBookingsTable)
      .where(eq(excursionBookingsTable.excursionId, id))
      .orderBy(desc(excursionBookingsTable.bookedAt));

    res.json({
      ...excursion,
      ...calcFinancials(excursion),
      bookings,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.patch("/excursions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body as Partial<typeof excursionsTable.$inferInsert>;

    const allowed: Partial<typeof excursionsTable.$inferInsert> = {};
    const mutableFields = [
      "name", "location", "date", "status", "vehicleId",
      "currentCapacity", "minThreshold", "adherentsCount",
      "depositsCount", "balancesCount", "vehicleFixedCost",
      "mealCostPerPerson", "entranceCostPerPerson", "extraCostPerPerson",
      "pricePerPerson", "switchThreshold", "switchVehicleId",
      "switchVehicleAdditionalCost", "operationalNotes", "coverImageUrl",
    ] as const;
    for (const field of mutableFields) {
      if (field in body) {
        (allowed as Record<string, unknown>)[field] = body[field as keyof typeof body];
      }
    }

    const [updated] = await db
      .update(excursionsTable)
      .set({ ...allowed, updatedAt: new Date() })
      .where(eq(excursionsTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Gita non trovata." });
      return;
    }

    res.json({ ...updated, ...calcFinancials(updated) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.post("/excursions/:id/bookings", async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body as {
      customerName: string;
      customerId?: string;
      email?: string | null;
      phone?: string | null;
      seats?: number;
      paymentStatus?: string;
    };

    if (!body.customerName?.trim()) {
      res.status(400).json({ error: "Nome obbligatorio." });
      return;
    }

    const seats = Math.max(1, Math.min(50, body.seats ?? 1));
    const paymentStatusRaw = body.paymentStatus ?? "pending";
    if (!isValidPaymentStatus(paymentStatusRaw)) {
      res.status(400).json({ error: "Stato pagamento non valido." });
      return;
    }
    const paymentStatus = paymentStatusRaw;

    const booking = await db.transaction(async (tx) => {
      const [excursion] = await tx
        .select()
        .from(excursionsTable)
        .where(eq(excursionsTable.id, id))
        .for("update")
        .limit(1);

      if (!excursion) return null;

      const [created] = await tx
        .insert(excursionBookingsTable)
        .values({
          excursionId: id,
          customerName: body.customerName.trim(),
          customerId: body.customerId ?? null,
          email: body.email?.trim() || null,
          phone: body.phone?.trim() || null,
          seats,
          paymentStatus,
        })
        .returning();

      await tx
        .update(excursionsTable)
        .set({
          adherentsCount: sql`${excursionsTable.adherentsCount} + ${seats}`,
          depositsCount:
            paymentStatus === "deposit"
              ? sql`${excursionsTable.depositsCount} + ${seats}`
              : excursionsTable.depositsCount,
          balancesCount:
            paymentStatus === "paid"
              ? sql`${excursionsTable.balancesCount} + ${seats}`
              : excursionsTable.balancesCount,
          updatedAt: new Date(),
        })
        .where(eq(excursionsTable.id, id));

      return created;
    });

    if (!booking) {
      res.status(404).json({ error: "Gita non trovata." });
      return;
    }

    res.status(201).json(booking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.patch("/excursions/:id/bookings/:bookingId", async (req, res) => {
  try {
    const { id, bookingId } = req.params;
    const { paymentStatus } = req.body as { paymentStatus?: string };

    if (!isValidPaymentStatus(paymentStatus)) {
      res.status(400).json({ error: "Stato pagamento non valido." });
      return;
    }

    const updated = await db.transaction(async (tx) => {
      const [booking] = await tx
        .select()
        .from(excursionBookingsTable)
        .where(eq(excursionBookingsTable.id, bookingId))
        .for("update")
        .limit(1);

      if (!booking || booking.excursionId !== id) return null;

      const oldStatus = booking.paymentStatus;
      const seats = booking.seats;

      let depositsDelta = 0;
      let balancesDelta = 0;
      if (oldStatus === "deposit") depositsDelta -= seats;
      if (oldStatus === "paid") balancesDelta -= seats;
      if (paymentStatus === "deposit") depositsDelta += seats;
      if (paymentStatus === "paid") balancesDelta += seats;

      const [u] = await tx
        .update(excursionBookingsTable)
        .set({ paymentStatus, updatedAt: new Date() })
        .where(eq(excursionBookingsTable.id, bookingId))
        .returning();

      if (depositsDelta !== 0 || balancesDelta !== 0) {
        await tx
          .update(excursionsTable)
          .set({
            depositsCount: sql`GREATEST(0, ${excursionsTable.depositsCount} + ${depositsDelta})`,
            balancesCount: sql`GREATEST(0, ${excursionsTable.balancesCount} + ${balancesDelta})`,
            updatedAt: new Date(),
          })
          .where(eq(excursionsTable.id, id));
      }

      return u;
    });

    if (!updated) {
      res.status(404).json({ error: "Prenotazione non trovata." });
      return;
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.delete("/excursions/:id/bookings/:bookingId", async (req, res) => {
  try {
    const { id, bookingId } = req.params;

    const removed = await db.transaction(async (tx) => {
      const [booking] = await tx
        .select()
        .from(excursionBookingsTable)
        .where(eq(excursionBookingsTable.id, bookingId))
        .for("update")
        .limit(1);

      if (!booking || booking.excursionId !== id) return false;

      await tx
        .delete(excursionBookingsTable)
        .where(eq(excursionBookingsTable.id, bookingId));

      const seats = booking.seats;
      const depositsDelta = booking.paymentStatus === "deposit" ? -seats : 0;
      const balancesDelta = booking.paymentStatus === "paid" ? -seats : 0;

      await tx
        .update(excursionsTable)
        .set({
          adherentsCount: sql`GREATEST(0, ${excursionsTable.adherentsCount} - ${seats})`,
          depositsCount: sql`GREATEST(0, ${excursionsTable.depositsCount} + ${depositsDelta})`,
          balancesCount: sql`GREATEST(0, ${excursionsTable.balancesCount} + ${balancesDelta})`,
          updatedAt: new Date(),
        })
        .where(eq(excursionsTable.id, id));

      return true;
    });

    if (!removed) {
      res.status(404).json({ error: "Prenotazione non trovata." });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.patch("/excursions/:id/vehicle", async (req, res) => {
  try {
    const { id } = req.params;
    const { vehicleId, vehicleFixedCost } = req.body as {
      vehicleId: string;
      vehicleFixedCost: string;
    };

    const [vehicle] = await db
      .select()
      .from(excursionVehiclesTable)
      .where(eq(excursionVehiclesTable.id, vehicleId))
      .limit(1);

    if (!vehicle) {
      res.status(404).json({ error: "Veicolo non trovato." });
      return;
    }

    const [updated] = await db
      .update(excursionsTable)
      .set({
        vehicleId,
        currentCapacity: vehicle.capacity,
        vehicleFixedCost: vehicleFixedCost ?? vehicle.fixedCost,
        updatedAt: new Date(),
      })
      .where(eq(excursionsTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Gita non trovata." });
      return;
    }

    res.json({ ...updated, ...calcFinancials(updated) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.get("/vehicles", async (_req, res) => {
  try {
    const vehicles = await db
      .select()
      .from(excursionVehiclesTable)
      .orderBy(excursionVehiclesTable.name);
    res.json(vehicles);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

export default router;
