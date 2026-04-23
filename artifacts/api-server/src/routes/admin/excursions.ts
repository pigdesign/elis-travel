import { Router } from "express";
import { db } from "@workspace/db";
import {
  excursionsTable,
  excursionBookingsTable,
  excursionVehiclesTable,
} from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

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
      "switchVehicleAdditionalCost", "operationalNotes",
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
      seats?: number;
      paymentStatus?: string;
    };

    const [excursion] = await db
      .select()
      .from(excursionsTable)
      .where(eq(excursionsTable.id, id))
      .limit(1);

    if (!excursion) {
      res.status(404).json({ error: "Gita non trovata." });
      return;
    }

    const [booking] = await db
      .insert(excursionBookingsTable)
      .values({
        excursionId: id,
        customerName: body.customerName,
        customerId: body.customerId ?? null,
        seats: body.seats ?? 1,
        paymentStatus: body.paymentStatus ?? "pending",
      })
      .returning();

    const seats = body.seats ?? 1;
    const newAdherents = excursion.adherentsCount + seats;
    const newDeposits =
      body.paymentStatus === "deposit"
        ? excursion.depositsCount + seats
        : excursion.depositsCount;
    const newBalances =
      body.paymentStatus === "paid"
        ? excursion.balancesCount + seats
        : excursion.balancesCount;

    await db
      .update(excursionsTable)
      .set({
        adherentsCount: newAdherents,
        depositsCount: newDeposits,
        balancesCount: newBalances,
        updatedAt: new Date(),
      })
      .where(eq(excursionsTable.id, id));

    res.status(201).json(booking);
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
