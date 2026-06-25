import { Router } from "express";
import { db } from "@workspace/db";
import {
  excursionsTable,
  excursionBookingsTable,
  excursionVehiclesTable,
  excursionPickupPointsTable,
  pickupLocationsTable,
} from "@workspace/db/schema";
import { eq, desc, sql, and, inArray, isNull, asc } from "drizzle-orm";
import { stripe } from "../../services/stripe";
import {
  dispatchChargedEmail,
  dispatchChargeFailedEmail,
  dispatchExcursionCancelledEmail,
} from "../../services/excursion-booking-emails";
import { logger } from "../../lib/logger";

const VALID_PAYMENT_STATUSES = [
  "pending",
  "deposit_requested",
  "deposit",
  "full_requested",
  "paid",
  "refunded",
] as const;
type PaymentStatus = (typeof VALID_PAYMENT_STATUSES)[number];
function isValidPaymentStatus(s: unknown): s is PaymentStatus {
  return typeof s === "string" && (VALID_PAYMENT_STATUSES as readonly string[]).includes(s);
}

const ADMIN_CREATABLE_STATUSES = ["pending", "deposit_requested", "full_requested", "deposit", "paid"] as const;
type AdminCreatableStatus = (typeof ADMIN_CREATABLE_STATUSES)[number];
function isAdminCreatableStatus(s: unknown): s is AdminCreatableStatus {
  return typeof s === "string" && (ADMIN_CREATABLE_STATUSES as readonly string[]).includes(s);
}

const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  deposit_requested: ["deposit"],
  full_requested: ["paid"],
  pending: ["deposit", "paid"],
  deposit: ["paid", "refunded"],
  paid: ["refunded"],
  refunded: [],
};

const router = Router();

async function getPendingRequestsCount(excursionId: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(excursionBookingsTable)
    .where(
      and(
        eq(excursionBookingsTable.excursionId, excursionId),
        inArray(excursionBookingsTable.paymentStatus, ["deposit_requested", "full_requested"]),
        isNull(excursionBookingsTable.cancelledAt),
      ),
    );
  return count ?? 0;
}

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
    const [excursions, pendingCounts] = await Promise.all([
      db.select().from(excursionsTable).orderBy(desc(excursionsTable.date)),
      db
        .select({
          excursionId: excursionBookingsTable.excursionId,
          count: sql<number>`count(*)::int`,
        })
        .from(excursionBookingsTable)
        .where(
          and(
            inArray(excursionBookingsTable.paymentStatus, ["deposit_requested", "full_requested"]),
            isNull(excursionBookingsTable.cancelledAt),
          ),
        )
        .groupBy(excursionBookingsTable.excursionId),
    ]);

    const pendingMap = new Map(pendingCounts.map((r) => [r.excursionId, r.count]));

    const result = excursions.map((e) => ({
      ...e,
      ...calcFinancials(e),
      pendingRequestsCount: pendingMap.get(e.id) ?? 0,
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
        category: body.category ?? "standard",
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

    res.status(201).json({ ...created, ...calcFinancials(created), pendingRequestsCount: 0 });
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

    const [bookings, pickupPoints] = await Promise.all([
      db
        .select()
        .from(excursionBookingsTable)
        .where(eq(excursionBookingsTable.excursionId, id))
        .orderBy(desc(excursionBookingsTable.bookedAt)),
      db
        .select({
          id: excursionPickupPointsTable.id,
          excursionId: excursionPickupPointsTable.excursionId,
          pickupLocationId: excursionPickupPointsTable.pickupLocationId,
          pickupTime: excursionPickupPointsTable.pickupTime,
          sortOrder: excursionPickupPointsTable.sortOrder,
          createdAt: excursionPickupPointsTable.createdAt,
          location: {
            id: pickupLocationsTable.id,
            name: pickupLocationsTable.name,
            city: pickupLocationsTable.city,
            address: pickupLocationsTable.address,
            sortOrder: pickupLocationsTable.sortOrder,
          },
        })
        .from(excursionPickupPointsTable)
        .innerJoin(pickupLocationsTable, eq(excursionPickupPointsTable.pickupLocationId, pickupLocationsTable.id))
        .where(eq(excursionPickupPointsTable.excursionId, id))
        .orderBy(asc(excursionPickupPointsTable.sortOrder)),
    ]);

    const pendingRequestsCount = bookings.filter(
      (b) =>
        (b.paymentStatus === "deposit_requested" || b.paymentStatus === "full_requested") &&
        !b.cancelledAt,
    ).length;

    res.json({
      ...excursion,
      ...calcFinancials(excursion),
      pendingRequestsCount,
      bookings,
      pickupPoints,
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
      "name", "location", "date", "status", "category", "vehicleId",
      "currentCapacity", "minThreshold", "adherentsCount",
      "depositsCount", "balancesCount", "vehicleFixedCost",
      "mealCostPerPerson", "entranceCostPerPerson", "extraCostPerPerson",
      "pricePerPerson", "switchThreshold", "switchVehicleId",
      "switchVehicleAdditionalCost", "operationalNotes", "coverImageUrl",
      "schedule", "included", "excluded", "generalInfo",
    ] as const;
    for (const field of mutableFields) {
      if (field in body) {
        (allowed as Record<string, unknown>)[field] = body[field as keyof typeof body];
      }
    }

    const [previous] = await db
      .select({ status: excursionsTable.status })
      .from(excursionsTable)
      .where(eq(excursionsTable.id, id))
      .limit(1);

    const [updated] = await db
      .update(excursionsTable)
      .set({ ...allowed, updatedAt: new Date() })
      .where(eq(excursionsTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Gita non trovata." });
      return;
    }

    const newStatus = allowed.status;
    const prevStatus = previous?.status;

    if (newStatus && newStatus !== prevStatus) {
      if (newStatus === "confirmed") {
        void processConfirmedExcursion(updated);
      } else if (newStatus === "cancelled") {
        void processCancelledExcursion(updated);
      }
    }

    const pendingRequestsCount = await getPendingRequestsCount(id);
    res.json({ ...updated, ...calcFinancials(updated), pendingRequestsCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

async function processConfirmedExcursion(excursion: typeof excursionsTable.$inferSelect) {
  const bookings = await db
    .select({
      id: excursionBookingsTable.id,
      customerName: excursionBookingsTable.customerName,
      email: excursionBookingsTable.email,
      phone: excursionBookingsTable.phone,
      seats: excursionBookingsTable.seats,
      adults: excursionBookingsTable.adults,
      children: excursionBookingsTable.children,
      servizioCasa: excursionBookingsTable.servizioCasa,
      stripeCustomerId: excursionBookingsTable.stripeCustomerId,
      stripePaymentMethodId: excursionBookingsTable.stripePaymentMethodId,
      amountDueCents: excursionBookingsTable.amountDueCents,
    })
    .from(excursionBookingsTable)
    .where(
      and(
        eq(excursionBookingsTable.excursionId, excursion.id),
        eq(excursionBookingsTable.paymentStatus, "card_saved"),
        isNull(excursionBookingsTable.cancelledAt),
      ),
    );

  if (!stripe) {
    console.warn("[stripe] Addebiti saltati — STRIPE_SECRET_KEY non configurata.");
    return;
  }

  for (const booking of bookings) {
    if (!booking.stripeCustomerId || !booking.stripePaymentMethodId || !booking.amountDueCents) {
      continue;
    }
    try {
      const paymentIntent = await stripe.paymentIntents.create(
        {
          amount: booking.amountDueCents,
          currency: "eur",
          customer: booking.stripeCustomerId,
          payment_method: booking.stripePaymentMethodId,
          confirm: true,
          off_session: true,
          description: `Gita: ${excursion.name} — ${booking.customerName}`,
          metadata: { bookingId: booking.id, excursionId: excursion.id },
        },
        { idempotencyKey: `confirm-${booking.id}` },
      );

      await db
        .update(excursionBookingsTable)
        .set({
          paymentStatus: "paid",
          stripePaymentIntentId: paymentIntent.id,
          updatedAt: new Date(),
        })
        .where(eq(excursionBookingsTable.id, booking.id));

      // Update excursion counters
      await db
        .update(excursionsTable)
        .set({
          depositsCount: sql`${excursionsTable.depositsCount} + ${booking.seats}`,
          updatedAt: new Date(),
        })
        .where(eq(excursionsTable.id, excursion.id));

      if (booking.email) {
        dispatchChargedEmail({
          bookingId: booking.id,
          customerName: booking.customerName,
          customerEmail: booking.email,
          customerPhone: booking.phone ?? null,
          seats: booking.seats,
          adults: booking.adults,
          children: booking.children,
          servizioCasa: booking.servizioCasa,
          amountDueCents: booking.amountDueCents,
          excursion: {
            id: excursion.id,
            name: excursion.name,
            location: excursion.location,
            date: excursion.date,
            pricePerPerson: excursion.pricePerPerson,
          },
        });
      }
    } catch (err) {
      logger.error({ err, bookingId: booking.id }, "Stripe off-session charge failed");

      await db
        .update(excursionBookingsTable)
        .set({ paymentStatus: "charge_failed", updatedAt: new Date() })
        .where(eq(excursionBookingsTable.id, booking.id));

      if (booking.email) {
        dispatchChargeFailedEmail({
          bookingId: booking.id,
          customerName: booking.customerName,
          customerEmail: booking.email,
          seats: booking.seats,
          excursion: {
            id: excursion.id,
            name: excursion.name,
            location: excursion.location,
            date: excursion.date,
          },
        });
      }
    }
  }
}

async function processCancelledExcursion(excursion: typeof excursionsTable.$inferSelect) {
  const bookings = await db
    .select({
      id: excursionBookingsTable.id,
      customerName: excursionBookingsTable.customerName,
      email: excursionBookingsTable.email,
      seats: excursionBookingsTable.seats,
      stripePaymentMethodId: excursionBookingsTable.stripePaymentMethodId,
    })
    .from(excursionBookingsTable)
    .where(
      and(
        eq(excursionBookingsTable.excursionId, excursion.id),
        eq(excursionBookingsTable.paymentStatus, "card_saved"),
        isNull(excursionBookingsTable.cancelledAt),
      ),
    );

  for (const booking of bookings) {
    if (booking.stripePaymentMethodId && stripe) {
      stripe.paymentMethods.detach(booking.stripePaymentMethodId).catch((err) => {
        logger.warn({ err, bookingId: booking.id }, "Failed to detach PaymentMethod on excursion cancellation");
      });
    }

    await db
      .update(excursionBookingsTable)
      .set({ paymentStatus: "charge_skipped", updatedAt: new Date() })
      .where(eq(excursionBookingsTable.id, booking.id));

    if (booking.email) {
      dispatchExcursionCancelledEmail({
        bookingId: booking.id,
        customerName: booking.customerName,
        customerEmail: booking.email,
        seats: booking.seats,
        excursion: {
          id: excursion.id,
          name: excursion.name,
          location: excursion.location,
          date: excursion.date,
        },
      });
    }
  }
}

router.delete("/excursions/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.transaction(async (tx) => {
      const [excursion] = await tx
        .select({ id: excursionsTable.id })
        .from(excursionsTable)
        .where(eq(excursionsTable.id, id))
        .limit(1);

      if (!excursion) return { status: 404 as const };

      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(excursionBookingsTable)
        .where(eq(excursionBookingsTable.excursionId, id));

      if (count > 0) {
        return { status: 409 as const, count };
      }

      await tx.delete(excursionsTable).where(eq(excursionsTable.id, id));
      return { status: 200 as const };
    });

    if (result.status === 404) {
      res.status(404).json({ error: "Gita non trovata." });
      return;
    }
    if (result.status === 409) {
      res.status(409).json({
        error:
          "Impossibile eliminare: la gita ha prenotazioni. Elimina prima tutte le prenotazioni oppure annulla la gita.",
      });
      return;
    }

    res.json({ ok: true });
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
      adults?: number;
      children?: number;
      seats?: number;
      paymentStatus?: string;
      servizioCasa?: boolean;
    };

    if (!body.customerName?.trim()) {
      res.status(400).json({ error: "Nome obbligatorio." });
      return;
    }

    const adults = Math.max(1, Math.min(50, body.adults ?? 1));
    const children = Math.max(0, Math.min(50, body.children ?? 0));
    const seats = adults + children;
    const paymentStatusRaw = body.paymentStatus ?? "pending";
    if (!isAdminCreatableStatus(paymentStatusRaw)) {
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
          adults,
          children,
          paymentStatus,
          servizioCasa: body.servizioCasa === true,
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
      if (booking.cancelledAt) return { cancelled: true as const };

      const oldStatus = booking.paymentStatus;
      const allowed = ALLOWED_TRANSITIONS[oldStatus] ?? [];
      if (!allowed.includes(paymentStatus)) {
        return { invalidTransition: true as const, from: oldStatus, to: paymentStatus };
      }

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
    if ("cancelled" in updated) {
      res.status(400).json({ error: "Prenotazione annullata: impossibile aggiornare lo stato di pagamento." });
      return;
    }
    if ("invalidTransition" in updated) {
      res.status(400).json({
        error: `Transizione non consentita da "${updated.from}" a "${updated.to}".`,
      });
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

      // If the booking was already cancelled, counters were already
      // decremented at cancellation time — do not decrement again.
      if (booking.cancelledAt) return true;

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

    const pendingRequestsCount = await getPendingRequestsCount(id);
    res.json({ ...updated, ...calcFinancials(updated), pendingRequestsCount });
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

function parseVehicleBody(body: Partial<typeof excursionVehiclesTable.$inferInsert>) {
  const errors: string[] = [];

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) errors.push("Il nome è obbligatorio.");

  const capacityRaw = body.capacity;
  const capacity =
    typeof capacityRaw === "number"
      ? capacityRaw
      : typeof capacityRaw === "string"
      ? parseInt(capacityRaw, 10)
      : NaN;
  if (!Number.isFinite(capacity) || capacity <= 0 || capacity > 1000) {
    errors.push("La capienza deve essere un numero positivo (max 1000).");
  }

  const fixedCostRaw = body.fixedCost;
  const fixedCostStr =
    typeof fixedCostRaw === "string"
      ? fixedCostRaw.trim().replace(",", ".")
      : typeof fixedCostRaw === "number"
      ? String(fixedCostRaw)
      : "";
  const fixedCostNum = parseFloat(fixedCostStr);
  if (!Number.isFinite(fixedCostNum) || fixedCostNum < 0) {
    errors.push("Il costo fisso deve essere un numero maggiore o uguale a 0.");
  }

  const notes =
    typeof body.notes === "string" && body.notes.trim() !== ""
      ? body.notes.trim()
      : null;

  return {
    errors,
    values: {
      name,
      capacity: Math.trunc(capacity),
      fixedCost: fixedCostNum.toFixed(2),
      notes,
    },
  };
}

router.post("/vehicles", async (req, res) => {
  try {
    const body = req.body as Partial<typeof excursionVehiclesTable.$inferInsert>;
    const { errors, values } = parseVehicleBody(body);

    if (errors.length > 0) {
      res.status(400).json({ error: errors.join(" ") });
      return;
    }

    const [created] = await db
      .insert(excursionVehiclesTable)
      .values(values)
      .returning();

    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.patch("/vehicles/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body as Partial<typeof excursionVehiclesTable.$inferInsert>;

    const [existing] = await db
      .select()
      .from(excursionVehiclesTable)
      .where(eq(excursionVehiclesTable.id, id))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Mezzo non trovato." });
      return;
    }

    const merged: Partial<typeof excursionVehiclesTable.$inferInsert> = {
      name: body.name ?? existing.name,
      capacity: body.capacity ?? existing.capacity,
      fixedCost: body.fixedCost ?? existing.fixedCost,
      notes: "notes" in body ? body.notes ?? null : existing.notes,
    };

    const { errors, values } = parseVehicleBody(merged);
    if (errors.length > 0) {
      res.status(400).json({ error: errors.join(" ") });
      return;
    }

    const [updated] = await db
      .update(excursionVehiclesTable)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(excursionVehiclesTable.id, id))
      .returning();

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.delete("/vehicles/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.transaction(async (tx) => {
      const [vehicle] = await tx
        .select({ id: excursionVehiclesTable.id })
        .from(excursionVehiclesTable)
        .where(eq(excursionVehiclesTable.id, id))
        .limit(1);

      if (!vehicle) return { status: 404 as const };

      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(excursionsTable)
        .where(
          sql`${excursionsTable.vehicleId} = ${id} OR ${excursionsTable.switchVehicleId} = ${id}`,
        );

      if (count > 0) {
        return { status: 409 as const, count };
      }

      await tx
        .delete(excursionVehiclesTable)
        .where(eq(excursionVehiclesTable.id, id));
      return { status: 200 as const };
    });

    if (result.status === 404) {
      res.status(404).json({ error: "Mezzo non trovato." });
      return;
    }
    if (result.status === 409) {
      res.status(409).json({
        error:
          "Impossibile eliminare: il mezzo è collegato ad almeno una gita. Modifica prima le gite che lo utilizzano.",
      });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

// --- Pickup points per gita ---

router.get("/excursions/:id/pickup-points", async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await db
      .select({
        id: excursionPickupPointsTable.id,
        excursionId: excursionPickupPointsTable.excursionId,
        pickupLocationId: excursionPickupPointsTable.pickupLocationId,
        pickupTime: excursionPickupPointsTable.pickupTime,
        sortOrder: excursionPickupPointsTable.sortOrder,
        createdAt: excursionPickupPointsTable.createdAt,
        location: {
          id: pickupLocationsTable.id,
          name: pickupLocationsTable.name,
          city: pickupLocationsTable.city,
          address: pickupLocationsTable.address,
          sortOrder: pickupLocationsTable.sortOrder,
        },
      })
      .from(excursionPickupPointsTable)
      .innerJoin(pickupLocationsTable, eq(excursionPickupPointsTable.pickupLocationId, pickupLocationsTable.id))
      .where(eq(excursionPickupPointsTable.excursionId, id))
      .orderBy(asc(excursionPickupPointsTable.sortOrder));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.post("/excursions/:id/pickup-points", async (req, res) => {
  try {
    const { id } = req.params;
    const { pickupLocationId, pickupTime, sortOrder } = req.body as {
      pickupLocationId?: string;
      pickupTime?: string;
      sortOrder?: number;
    };
    if (!pickupLocationId) {
      res.status(400).json({ error: "pickupLocationId è obbligatorio." });
      return;
    }
    const [loc] = await db
      .select({ id: pickupLocationsTable.id })
      .from(pickupLocationsTable)
      .where(eq(pickupLocationsTable.id, pickupLocationId))
      .limit(1);
    if (!loc) {
      res.status(404).json({ error: "Punto di raccolta non trovato." });
      return;
    }
    const [row] = await db
      .insert(excursionPickupPointsTable)
      .values({
        excursionId: id,
        pickupLocationId,
        pickupTime: pickupTime?.trim() || null,
        sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.patch("/excursions/:id/pickup-points/:ppId", async (req, res) => {
  try {
    const { id, ppId } = req.params;
    const { pickupTime, sortOrder } = req.body as {
      pickupTime?: string | null;
      sortOrder?: number;
    };
    const updates: Partial<typeof excursionPickupPointsTable.$inferInsert> = {};
    if (pickupTime !== undefined) updates.pickupTime = pickupTime?.trim() || null;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;

    const [row] = await db
      .update(excursionPickupPointsTable)
      .set(updates)
      .where(and(eq(excursionPickupPointsTable.id, ppId), eq(excursionPickupPointsTable.excursionId, id)))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Punto di raccolta non trovato." });
      return;
    }
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.delete("/excursions/:id/pickup-points/:ppId", async (req, res) => {
  try {
    const { id, ppId } = req.params;
    const [deleted] = await db
      .delete(excursionPickupPointsTable)
      .where(and(eq(excursionPickupPointsTable.id, ppId), eq(excursionPickupPointsTable.excursionId, id)))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Punto di raccolta non trovato." });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

export default router;
