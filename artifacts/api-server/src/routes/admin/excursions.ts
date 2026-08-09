import { Router } from "express";
import { db } from "@workspace/db";
import {
  excursionsTable,
  excursionBookingsTable,
  bookingParticipantsTable,
  excursionVehiclesTable,
  excursionPickupPointsTable,
  pickupLocationsTable,
  paymentAttemptsTable,
  paymentRefundsTable,
  paymentRequestsTable,
  stripeCleanupJobsTable,
  bookingCancellationCasesTable,
  ageRangesTable,
} from "@workspace/db/schema";
import {
  eq,
  desc,
  sql,
  and,
  inArray,
  isNotNull,
  isNull,
  asc,
  ne,
  or,
} from "drizzle-orm";
import {
  calendarDateInRome,
  departureUpdateRequiresReschedule,
  endOfDayInRome,
  hasExcursionDeparted,
  parseDepartureAt,
} from "../../services/excursion-time";
import {
  dispatchBookingInstructionsCustomerEmailV2,
  dispatchNewBookingAdminEmailV2,
  dispatchPaymentReceivedEmailV2,
} from "../../services/excursion-booking-emails-v2";
import { releaseBookingSeatsInTransaction } from "../../services/seat-reservations";
import { getExcursionCompletionBlockersInTransaction } from "../../services/excursion-completion";
import {
  BookingCancellationError,
  cancelExcursionWorkflow,
} from "../../services/booking-cancellations";
import {
  authoritativeOccupiedSeats,
  decideExcursionCapacity,
} from "../../services/excursion-capacity";
import {
  ManualBookingValidationError,
  isManuallyBookableExcursionStatus,
  manualParticipantDetailsAreUnchanged,
  manualBookingCommandFingerprint,
  manualBookingCommandNote,
  normalizeManualBookingClientCommandId,
  normalizeManualCustomerNotifications,
  normalizeManualBookingFinancials,
  normalizeManualBookingParticipants,
  type ManualParticipantInput,
} from "../../services/manual-excursion-booking";
import {
  HomePickupValidationError,
  normalizeHomePickupRequest,
} from "../../services/excursion-home-pickup";
import {
  ParticipantDetailsError,
  normalizeRetainedParticipantIds,
} from "../../services/participant-details";
import {
  generateBookingCode,
  getPaymentSettings,
} from "../../services/excursion-pricing";
import { validateExcursionAdminInput } from "../../services/excursion-admin-validation";
import {
  calcFinancials,
  type ExcursionRevenue,
} from "../../services/excursion-financials";

const VALID_PAYMENT_STATUSES = [
  "pending",
  "deposit_requested",
  "deposit",
  "full_requested",
  "paid",
] as const;
type PaymentStatus = (typeof VALID_PAYMENT_STATUSES)[number];
function isValidPaymentStatus(s: unknown): s is PaymentStatus {
  return (
    typeof s === "string" &&
    (VALID_PAYMENT_STATUSES as readonly string[]).includes(s)
  );
}

const ADMIN_CREATABLE_STATUSES = [
  "deposit_requested",
  "full_requested",
  "deposit",
  "paid",
] as const;

const EXCURSION_STATUSES = [
  "draft",
  "open",
  "confirmed",
  "completed",
  "cancelled",
  "archived",
] as const;
const GENERIC_CREATE_STATUSES = new Set<string>(["draft", "open"]);
const EXCURSION_CATEGORIES = new Set<string>(["standard", "rident"]);
const EXCURSION_DEPOSIT_TYPES = new Set<string>(["percent", "fixed"]);

function isExcursionStatus(
  value: unknown,
): value is (typeof EXCURSION_STATUSES)[number] {
  return (
    typeof value === "string" &&
    (EXCURSION_STATUSES as readonly string[]).includes(value)
  );
}
type AdminCreatableStatus = (typeof ADMIN_CREATABLE_STATUSES)[number];
function isAdminCreatableStatus(s: unknown): s is AdminCreatableStatus {
  return (
    typeof s === "string" &&
    (ADMIN_CREATABLE_STATUSES as readonly string[]).includes(s)
  );
}

const router = Router();
const ADMIN_BOOKING_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

class BookingCodeAllocationError extends Error {}

async function getOccupiedSeatsInTransaction(
  tx: DbTransaction,
  excursionId: string,
  adherentsCounter: number,
): Promise<number> {
  const [row] = await tx
    .select({
      seats: sql<number>`coalesce(sum(${excursionBookingsTable.seats}), 0)::int`,
    })
    .from(excursionBookingsTable)
    .where(
      and(
        eq(excursionBookingsTable.excursionId, excursionId),
        isNull(excursionBookingsTable.cancelledAt),
        inArray(excursionBookingsTable.seatStatus, ["held", "confirmed"]),
      ),
    );

  return authoritativeOccupiedSeats(row?.seats ?? 0, adherentsCounter);
}

async function allocateUniqueBookingCodeInTransaction(
  tx: DbTransaction,
): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = generateBookingCode();
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`booking-code:${candidate}`}, 0))`,
    );
    const [collision] = await tx
      .select({ id: excursionBookingsTable.id })
      .from(excursionBookingsTable)
      .where(eq(excursionBookingsTable.bookingCode, candidate))
      .limit(1);
    if (!collision) return candidate;
  }
  throw new BookingCodeAllocationError(
    "Impossibile generare un codice prenotazione univoco.",
  );
}

async function getPendingRequestsCount(excursionId: string): Promise<number> {
  const counts = await getPendingRequestsCounts(excursionId);
  return counts.get(excursionId) ?? 0;
}

async function getPendingRequestsCounts(
  excursionId?: string,
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      excursionId: excursionBookingsTable.excursionId,
      count: sql<number>`count(distinct ${paymentRequestsTable.bookingId})::int`,
    })
    .from(paymentRequestsTable)
    .innerJoin(
      excursionBookingsTable,
      eq(paymentRequestsTable.bookingId, excursionBookingsTable.id),
    )
    .where(
      and(
        inArray(paymentRequestsTable.status, ["pending", "action_required"]),
        isNull(excursionBookingsTable.cancelledAt),
        ne(excursionBookingsTable.seatStatus, "released"),
        excursionId
          ? eq(excursionBookingsTable.excursionId, excursionId)
          : undefined,
      ),
    )
    .groupBy(excursionBookingsTable.excursionId);

  return new Map(rows.map((row) => [row.excursionId, row.count ?? 0]));
}

/**
 * Ricavi di una gita presi dalle prenotazioni che occupano un posto: stesso
 * filtro dei posti occupati (`getOccupiedSeatsInTransaction`), quindi niente
 * annullate né posti rilasciati. Il calcolo sta in `calcFinancials`.
 */
async function getExcursionRevenues(
  excursionId?: string,
): Promise<Map<string, ExcursionRevenue>> {
  const rows = await db
    .select({
      excursionId: excursionBookingsTable.excursionId,
      totalCents: sql<number>`coalesce(sum(${excursionBookingsTable.totalAmountCents}), 0)::int`,
      legacySeats: sql<number>`coalesce(sum(case when ${excursionBookingsTable.totalAmountCents} is null then ${excursionBookingsTable.seats} else 0 end), 0)::int`,
    })
    .from(excursionBookingsTable)
    .where(
      and(
        isNull(excursionBookingsTable.cancelledAt),
        inArray(excursionBookingsTable.seatStatus, ["held", "confirmed"]),
        excursionId
          ? eq(excursionBookingsTable.excursionId, excursionId)
          : undefined,
      ),
    )
    .groupBy(excursionBookingsTable.excursionId);

  return new Map(
    rows.map((row) => [
      row.excursionId,
      {
        totalCents: row.totalCents ?? 0,
        legacySeats: row.legacySeats ?? 0,
      },
    ]),
  );
}

async function getExcursionRevenue(
  excursionId: string,
): Promise<ExcursionRevenue> {
  const revenues = await getExcursionRevenues(excursionId);
  return revenues.get(excursionId) ?? { totalCents: 0, legacySeats: 0 };
}

// Sanitizza le voci "extra": scarta righe non valide/vuote, forza price >= 0.
type ExcursionExtra = { name: string; price: number };
function normalizeExtras(input: unknown): ExcursionExtra[] {
  if (!Array.isArray(input)) return [];
  const out: ExcursionExtra[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    const price = Number(rec.price);
    if (!Number.isFinite(price) || price < 0) continue;
    // Salta righe completamente vuote (nessun nome e prezzo nullo).
    if (name === "" && price === 0) continue;
    out.push({ name, price });
  }
  return out;
}

// Totale delle voci extra, come stringa numerica (fonte di extraCostPerPerson).
function sumExtras(extras: ExcursionExtra[]): string {
  return extras.reduce((s, e) => s + e.price, 0).toFixed(2);
}

// "Altri costi": stesse regole e stessa forma degli extra ({ name, price }).
// La loro somma (otherCostsTotal) è un costo fisso, non moltiplicato per gli aderenti.
const normalizeOtherCosts = normalizeExtras;
const sumOtherCosts = sumExtras;

// Valori per provincia: chiavi = sigle valide (2 lettere), valori = euro ≠ 0
// (positivo = supplemento, negativo = sconto). Le voci a 0 o non valide vengono
// scartate: assenza dalla mappa = nessuna differenza di prezzo.
function normalizeProvinceSurcharges(input: unknown): Record<string, number> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const code = key.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) continue;
    const n = Number(value);
    if (!Number.isFinite(n) || n === 0) continue;
    out[code] = n;
  }
  return out;
}

// Normalizza i tag: trim, rimuove vuoti e duplicati (case-insensitive), mantiene l'ordine.
function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

router.get("/excursions", async (_req, res) => {
  try {
    const [excursions, pendingCounts, revenues] = await Promise.all([
      db.select().from(excursionsTable).orderBy(desc(excursionsTable.date)),
      getPendingRequestsCounts(),
      getExcursionRevenues(),
    ]);

    const result = excursions.map((e) => ({
      ...e,
      ...calcFinancials(
        e,
        revenues.get(e.id) ?? { totalCents: 0, legacySeats: 0 },
      ),
      pendingRequestsCount: pendingCounts.get(e.id) ?? 0,
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

    const requestedStatus = body.status ?? "draft";
    if (
      !isExcursionStatus(requestedStatus) ||
      !GENERIC_CREATE_STATUSES.has(requestedStatus)
    ) {
      res.status(400).json({
        error:
          "Una nuova gita può essere creata soltanto come bozza o aperta. Conferma e stati terminali richiedono i comandi dedicati.",
        code: "EXCURSION_STATUS_INVALID_FOR_CREATE",
      });
      return;
    }
    const requestedCategory = body.category ?? "standard";
    if (!EXCURSION_CATEGORIES.has(requestedCategory)) {
      res.status(400).json({ error: "Categoria gita non valida." });
      return;
    }
    const requestedDepositType = body.depositType ?? "percent";
    if (!EXCURSION_DEPOSIT_TYPES.has(requestedDepositType)) {
      res.status(400).json({ error: "Tipo acconto non valido." });
      return;
    }
    const inputError = validateExcursionAdminInput(
      body as Record<string, unknown>,
      requestedDepositType as "percent" | "fixed",
    );
    if (inputError) {
      res.status(400).json({
        error: inputError.message,
        code: "EXCURSION_NUMERIC_INPUT_INVALID",
        field: inputError.field,
      });
      return;
    }

    const departureAt = parseDepartureAt(body.departureAt);
    if (!departureAt) {
      res.status(400).json({
        error:
          "Data e ora di partenza obbligatorie. Il timestamp deve includere il fuso orario.",
      });
      return;
    }
    const departureDate = calendarDateInRome(departureAt);
    if (body.date && body.date !== departureDate) {
      res.status(400).json({
        error:
          "La data della gita non coincide con la partenza nel fuso Europe/Rome.",
      });
      return;
    }

    // Le voci extra sono la fonte: extraCostPerPerson è la loro somma.
    const extras = normalizeExtras(body.extras);
    // Le voci "Altri costi" sono la fonte: otherCostsTotal è la loro somma.
    const otherCosts = normalizeOtherCosts(body.otherCosts);

    const [created] = await db
      .insert(excursionsTable)
      .values({
        name: body.name ?? "Nuova gita",
        location: body.location ?? "",
        // `date` resta per compatibilita catalogo, ma deriva sempre dall'istante
        // autorevole di partenza osservato nel fuso Europe/Rome.
        date: departureDate,
        departureAt,
        status: requestedStatus,
        category: requestedCategory,
        // I tag si applicano solo alle gite standard.
        tags: requestedCategory === "rident" ? [] : normalizeTags(body.tags),
        vehicleId: body.vehicleId ?? null,
        currentCapacity: body.currentCapacity ?? 0,
        minThreshold: body.minThreshold ?? 1,
        // Contatori derivati esclusivamente dal lifecycle delle prenotazioni.
        adherentsCount: 0,
        depositsCount: 0,
        balancesCount: 0,
        vehicleFixedCost: body.vehicleFixedCost ?? "0",
        mealCostPerPerson: body.mealCostPerPerson ?? "0",
        entranceCostPerPerson: body.entranceCostPerPerson ?? "0",
        extras,
        extraCostPerPerson:
          extras.length > 0
            ? sumExtras(extras)
            : (body.extraCostPerPerson ?? "0"),
        otherCosts,
        otherCostsTotal: sumOtherCosts(otherCosts),
        pricePerPerson: body.pricePerPerson ?? "0",
        provinceSurcharges: normalizeProvinceSurcharges(
          body.provinceSurcharges,
        ),
        switchThreshold: body.switchThreshold ?? null,
        switchVehicleId: body.switchVehicleId ?? null,
        switchVehicleAdditionalCost: body.switchVehicleAdditionalCost ?? null,
        operationalNotes: body.operationalNotes ?? null,
        coverImageUrl: body.coverImageUrl ?? null,
        // ---- Gite v2 ----
        patientPrice: body.patientPrice ?? null,
        companionPrice: body.companionPrice ?? null,
        returnDate: body.returnDate ?? null,
        bookingCloseDate: body.bookingCloseDate ?? null,
        depositEnabled: body.depositEnabled ?? true,
        depositType: requestedDepositType,
        depositValue: body.depositValue ?? null,
        depositAvailableAfterConfirm:
          body.depositAvailableAfterConfirm ?? false,
        depositDeadlineDate: body.depositDeadlineDate ?? null,
        balanceDeadlineDate: body.balanceDeadlineDate ?? null,
        balanceHoursOverride: body.balanceHoursOverride ?? null,
        payCardEnabled: body.payCardEnabled ?? true,
        payBankTransferEnabled: body.payBankTransferEnabled ?? true,
        payOfficeEnabled: body.payOfficeEnabled ?? true,
        bankTransferHoursOverride: body.bankTransferHoursOverride ?? null,
        officeHoursOverride: body.officeHoursOverride ?? null,
        fullPaymentOnlyDaysBefore: body.fullPaymentOnlyDaysBefore ?? null,
        waitlistEnabled: body.waitlistEnabled ?? false,
      })
      .returning();

    res.status(201).json({
      ...created,
      // Gita appena creata: non può avere prenotazioni, inutile interrogarle.
      ...calcFinancials(created, { totalCents: 0, legacySeats: 0 }),
      pendingRequestsCount: 0,
    });
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

    const [bookings, pickupPoints, pendingRequestsCount, revenue] =
      await Promise.all([
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
              province: pickupLocationsTable.province,
              sortOrder: pickupLocationsTable.sortOrder,
            },
          })
          .from(excursionPickupPointsTable)
          .innerJoin(
            pickupLocationsTable,
            eq(
              excursionPickupPointsTable.pickupLocationId,
              pickupLocationsTable.id,
            ),
          )
          .where(eq(excursionPickupPointsTable.excursionId, id))
          .orderBy(asc(excursionPickupPointsTable.sortOrder)),
        getPendingRequestsCount(id),
        getExcursionRevenue(id),
      ]);

    res.json({
      ...excursion,
      ...calcFinancials(excursion, revenue),
      pendingRequestsCount,
      bookings,
      pickupPoints,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.post("/excursions/:id/cancel-trip", async (req, res) => {
  try {
    const { id } = req.params;
    const cancellation = await cancelExcursionWorkflow(id);
    const [cancelled] = await db
      .select()
      .from(excursionsTable)
      .where(eq(excursionsTable.id, id))
      .limit(1);
    if (!cancelled) {
      res.status(404).json({ error: "Gita non trovata." });
      return;
    }
    const [pendingRequestsCount, revenue] = await Promise.all([
      getPendingRequestsCount(id),
      getExcursionRevenue(id),
    ]);
    res.json({
      ...cancelled,
      ...calcFinancials(cancelled, revenue),
      pendingRequestsCount,
      cancellation,
    });
  } catch (error) {
    if (error instanceof BookingCancellationError) {
      res
        .status(error.statusCode)
        .json({ error: error.message, code: error.code });
      return;
    }
    console.error("Excursion cancellation failed:", error);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.post("/excursions/:id/complete-trip", async (req, res) => {
  try {
    const { id } = req.params;
    const completion = await db.transaction(async (tx) => {
      // Pagamenti e rimborsi acquisiscono prima la booking e poi la gita.
      // Conserviamo lo stesso ordine e blocchiamo tutte le righe operative
      // prima della verifica finale.
      await tx
        .select({ id: excursionBookingsTable.id })
        .from(excursionBookingsTable)
        .where(eq(excursionBookingsTable.excursionId, id))
        .orderBy(asc(excursionBookingsTable.id))
        .for("update");

      const [current] = await tx
        .select()
        .from(excursionsTable)
        .where(eq(excursionsTable.id, id))
        .for("update")
        .limit(1);
      if (!current) return { kind: "not_found" as const };
      if (current.status === "completed") {
        return { kind: "updated" as const, row: current, alreadyApplied: true };
      }
      if (current.status !== "confirmed") {
        return {
          kind: "invalid_status" as const,
          currentStatus: current.status,
        };
      }
      if (!hasExcursionDeparted(current.departureAt)) {
        return { kind: "not_departed" as const };
      }

      const blockers = await getExcursionCompletionBlockersInTransaction(
        tx,
        id,
      );
      if (blockers.length > 0) {
        return { kind: "blocked" as const, blockers };
      }

      const [row] = await tx
        .update(excursionsTable)
        .set({ status: "completed", updatedAt: new Date() })
        .where(
          and(
            eq(excursionsTable.id, id),
            eq(excursionsTable.status, "confirmed"),
          ),
        )
        .returning();
      if (!row) {
        throw new Error("Excursion status changed while locked.");
      }
      return { kind: "updated" as const, row, alreadyApplied: false };
    });

    if (completion.kind === "not_found") {
      res.status(404).json({ error: "Gita non trovata." });
      return;
    }
    if (completion.kind === "invalid_status") {
      res.status(409).json({
        error: `La gita è in stato ${completion.currentStatus}: deve essere confermata prima della chiusura amministrativa.`,
        code: "EXCURSION_COMPLETION_INVALID_STATUS",
      });
      return;
    }
    if (completion.kind === "not_departed") {
      res.status(409).json({
        error:
          "La gita non può essere completata prima dell'orario di partenza.",
        code: "EXCURSION_NOT_DEPARTED",
      });
      return;
    }
    if (completion.kind === "blocked") {
      const issueCounts = completion.blockers
        .flatMap((blocker) => blocker.issues)
        .reduce<Record<string, number>>((counts, issue) => {
          counts[issue.code] = (counts[issue.code] ?? 0) + 1;
          return counts;
        }, {});
      res.status(409).json({
        error:
          "Impossibile completare la gita: ci sono prenotazioni con attività amministrative ancora aperte.",
        code: "EXCURSION_COMPLETION_BLOCKED",
        blockingBookingsCount: completion.blockers.length,
        issueCounts,
        blockers: completion.blockers,
      });
      return;
    }

    const [pendingRequestsCount, revenue] = await Promise.all([
      getPendingRequestsCount(id),
      getExcursionRevenue(id),
    ]);
    res.json({
      ...completion.row,
      ...calcFinancials(completion.row, revenue),
      pendingRequestsCount,
      alreadyApplied: completion.alreadyApplied,
    });
  } catch (error) {
    console.error("Excursion completion failed:", error);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.patch("/excursions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body as Partial<typeof excursionsTable.$inferInsert>;

    if (
      Object.prototype.hasOwnProperty.call(body, "status") &&
      !isExcursionStatus(body.status)
    ) {
      res.status(400).json({ error: "Stato gita non valido." });
      return;
    }
    const statusWasSupplied = Object.prototype.hasOwnProperty.call(
      body,
      "status",
    );
    if (
      statusWasSupplied &&
      !GENERIC_CREATE_STATUSES.has(String(body.status))
    ) {
      res.status(409).json({
        error:
          "Il form generico può cambiare lo stato soltanto tra bozza e aperta. Conferma, completamento, annullamento e archiviazione usano comandi dedicati.",
        code: "EXCURSION_STATUS_WORKFLOW_REQUIRED",
      });
      return;
    }
    if (
      Object.prototype.hasOwnProperty.call(body, "category") &&
      !EXCURSION_CATEGORIES.has(String(body.category))
    ) {
      res.status(400).json({ error: "Categoria gita non valida." });
      return;
    }
    if (
      Object.prototype.hasOwnProperty.call(body, "depositType") &&
      !EXCURSION_DEPOSIT_TYPES.has(String(body.depositType))
    ) {
      res.status(400).json({ error: "Tipo acconto non valido." });
      return;
    }

    const allowed: Partial<typeof excursionsTable.$inferInsert> = {};
    const mutableFields = [
      "name",
      "location",
      "status",
      "category",
      "vehicleId",
      "currentCapacity",
      "minThreshold",
      "vehicleFixedCost",
      "mealCostPerPerson",
      "entranceCostPerPerson",
      "extraCostPerPerson",
      "extras",
      "otherCosts",
      "pricePerPerson",
      "provinceSurcharges",
      "switchThreshold",
      "switchVehicleId",
      "switchVehicleAdditionalCost",
      "operationalNotes",
      "coverImageUrl",
      "schedule",
      "included",
      "excluded",
      "generalInfo",
      // ---- Gite v2 ----
      "patientPrice",
      "companionPrice",
      "returnDate",
      "bookingCloseDate",
      "depositEnabled",
      "depositType",
      "depositValue",
      "depositAvailableAfterConfirm",
      "depositDeadlineDate",
      "balanceDeadlineDate",
      "balanceHoursOverride",
      "payCardEnabled",
      "payBankTransferEnabled",
      "payOfficeEnabled",
      "bankTransferHoursOverride",
      "officeHoursOverride",
      "fullPaymentOnlyDaysBefore",
      "waitlistEnabled",
    ] as const;
    for (const field of mutableFields) {
      if (field in body) {
        (allowed as Record<string, unknown>)[field] =
          body[field as keyof typeof body];
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, "currentCapacity")) {
      const requestedCapacity = Number(body.currentCapacity);
      if (
        !Number.isInteger(requestedCapacity) ||
        requestedCapacity < 0 ||
        requestedCapacity > 1000
      ) {
        res
          .status(400)
          .json({ error: "Capienza non valida (da 0 a 1000 posti)." });
        return;
      }
      allowed.currentCapacity = requestedCapacity;
    }

    const [previous] = await db
      .select({
        status: excursionsTable.status,
        category: excursionsTable.category,
        date: excursionsTable.date,
        departureAt: excursionsTable.departureAt,
        vehicleId: excursionsTable.vehicleId,
        currentCapacity: excursionsTable.currentCapacity,
        depositType: excursionsTable.depositType,
      })
      .from(excursionsTable)
      .where(eq(excursionsTable.id, id))
      .limit(1);

    if (!previous) {
      res.status(404).json({ error: "Gita non trovata." });
      return;
    }

    const inputError = validateExcursionAdminInput(
      body as Record<string, unknown>,
      (body.depositType ?? previous.depositType) as "percent" | "fixed",
    );
    if (inputError) {
      res.status(400).json({
        error: inputError.message,
        code: "EXCURSION_NUMERIC_INPUT_INVALID",
        field: inputError.field,
      });
      return;
    }

    const vehicleWasSupplied = Object.prototype.hasOwnProperty.call(
      body,
      "vehicleId",
    );
    if (vehicleWasSupplied && typeof body.vehicleId === "string") {
      const [vehicle] = await db
        .select({
          capacity: excursionVehiclesTable.capacity,
          fixedCost: excursionVehiclesTable.fixedCost,
        })
        .from(excursionVehiclesTable)
        .where(eq(excursionVehiclesTable.id, body.vehicleId))
        .limit(1);
      if (!vehicle) {
        res.status(404).json({ error: "Veicolo non trovato." });
        return;
      }
      // Il mezzo impone il tetto fisico. Una capienza esplicita più bassa è
      // ammessa (posti non vendibili), mentre 0 o un valore superiore vengono
      // ricondotti alla capienza reale del veicolo.
      const requestedCapacity =
        typeof allowed.currentCapacity === "number"
          ? allowed.currentCapacity
          : undefined;
      if (
        requestedCapacity === undefined ||
        requestedCapacity === 0 ||
        requestedCapacity > vehicle.capacity
      ) {
        allowed.currentCapacity = vehicle.capacity;
      }
      if (!Object.prototype.hasOwnProperty.call(body, "vehicleFixedCost")) {
        allowed.vehicleFixedCost = vehicle.fixedCost;
      }
    }

    const hasDepartureAt = Object.prototype.hasOwnProperty.call(
      body,
      "departureAt",
    );
    let departureRequiresReschedule = false;
    if (hasDepartureAt) {
      const departureAt = parseDepartureAt(body.departureAt);
      if (!departureAt) {
        res.status(400).json({
          error:
            "Data e ora di partenza non valide. Il timestamp deve includere il fuso orario.",
        });
        return;
      }
      const departureDate = calendarDateInRome(departureAt);
      if (body.date && body.date !== departureDate) {
        res.status(400).json({
          error:
            "La data della gita non coincide con la partenza nel fuso Europe/Rome.",
        });
        return;
      }
      departureRequiresReschedule = departureUpdateRequiresReschedule(
        previous.departureAt,
        departureAt,
      );
      if (!previous.departureAt && departureAt.getTime() <= Date.now()) {
        res.status(400).json({
          error: "L'orario inserito per una gita legacy deve essere futuro.",
          code: "EXCURSION_DEPARTURE_UNAVAILABLE",
        });
        return;
      }
      allowed.departureAt = departureAt;
      allowed.date = departureDate;
    } else if (body.date !== undefined && body.date !== previous.date) {
      res.status(400).json({
        error:
          "Per cambiare la data devi indicare anche l'ora di partenza (Europe/Rome).",
      });
      return;
    }

    const categoryChanged =
      Object.prototype.hasOwnProperty.call(body, "category") &&
      body.category !== previous.category;
    if (departureRequiresReschedule || categoryChanged) {
      const [{ count: bookingCount }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(excursionBookingsTable)
        .where(eq(excursionBookingsTable.excursionId, id));
      if (bookingCount > 0) {
        res.status(409).json({
          error: departureRequiresReschedule
            ? "La gita ha già prenotazioni: per cambiare la partenza serve un workflow dedicato di riprogrammazione con ricalcolo scadenze e comunicazioni ai clienti."
            : "La gita ha già prenotazioni: non è possibile cambiare categoria tra standard e RIDENT perché partecipanti, prezzi e raccolta storici diventerebbero incoerenti.",
          code: departureRequiresReschedule
            ? "EXCURSION_RESCHEDULE_WORKFLOW_REQUIRED"
            : "EXCURSION_CATEGORY_CHANGE_BLOCKED",
        });
        return;
      }
    }

    const requestedStatus = statusWasSupplied
      ? String(body.status)
      : previous.status;
    if (
      statusWasSupplied &&
      requestedStatus === "open" &&
      !allowed.departureAt &&
      !previous.departureAt
    ) {
      res.status(400).json({
        error: "Imposta data e ora di partenza prima di aprire la gita.",
      });
      return;
    }

    // Tag: normalizzati; azzerati se la gita (nuova o esistente) è rident.
    if ("tags" in body) {
      allowed.tags = normalizeTags(body.tags);
    }

    // Extra: la lista è la fonte; extraCostPerPerson viene ricalcolato come somma.
    if ("extras" in body) {
      const extras = normalizeExtras(body.extras);
      allowed.extras = extras;
      allowed.extraCostPerPerson = sumExtras(extras);
    }

    // Altri costi: la lista è la fonte; otherCostsTotal viene ricalcolato come somma.
    if ("otherCosts" in body) {
      const otherCosts = normalizeOtherCosts(body.otherCosts);
      allowed.otherCosts = otherCosts;
      allowed.otherCostsTotal = sumOtherCosts(otherCosts);
    }

    if ("provinceSurcharges" in body) {
      allowed.provinceSurcharges = normalizeProvinceSurcharges(
        body.provinceSurcharges,
      );
    }
    const effectiveCategory =
      (allowed.category as string | undefined) ?? previous?.category;
    if (effectiveCategory === "rident") {
      allowed.tags = [];
    }

    const updateResult = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          id: excursionsTable.id,
          status: excursionsTable.status,
          category: excursionsTable.category,
          departureAt: excursionsTable.departureAt,
          currentCapacity: excursionsTable.currentCapacity,
          adherentsCount: excursionsTable.adherentsCount,
        })
        .from(excursionsTable)
        .where(eq(excursionsTable.id, id))
        .for("update")
        .limit(1);
      if (!current) return { kind: "not_found" as const };

      if (statusWasSupplied && !GENERIC_CREATE_STATUSES.has(current.status)) {
        return {
          kind: "status_conflict" as const,
          currentStatus: current.status,
        };
      }
      const effectiveDepartureAt =
        allowed.departureAt instanceof Date
          ? allowed.departureAt
          : current.departureAt;
      if (
        statusWasSupplied &&
        requestedStatus === "open" &&
        !effectiveDepartureAt
      ) {
        return { kind: "missing_departure" as const };
      }

      const departureWouldChange =
        hasDepartureAt &&
        allowed.departureAt instanceof Date &&
        (!current.departureAt ||
          current.departureAt.getTime() !== allowed.departureAt.getTime());
      const departureWouldRequireReschedule =
        hasDepartureAt &&
        allowed.departureAt instanceof Date &&
        departureUpdateRequiresReschedule(
          current.departureAt,
          allowed.departureAt,
        );
      if (
        departureWouldChange &&
        !current.departureAt &&
        allowed.departureAt instanceof Date &&
        allowed.departureAt.getTime() <= Date.now()
      ) {
        return { kind: "past_departure" as const };
      }
      const categoryWouldChange =
        Object.prototype.hasOwnProperty.call(body, "category") &&
        allowed.category !== current.category;
      if (departureWouldRequireReschedule || categoryWouldChange) {
        const [{ count: bookingCount }] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(excursionBookingsTable)
          .where(eq(excursionBookingsTable.excursionId, id));
        if (bookingCount > 0) {
          return {
            kind: "booking_conflict" as const,
            field: departureWouldRequireReschedule
              ? ("departure" as const)
              : ("category" as const),
          };
        }
      }

      if (
        typeof allowed.currentCapacity === "number" &&
        allowed.currentCapacity !== current.currentCapacity
      ) {
        const occupiedSeats = await getOccupiedSeatsInTransaction(
          tx,
          id,
          current.adherentsCount,
        );
        const capacity = decideExcursionCapacity({
          capacity: allowed.currentCapacity,
          occupiedSeats,
        });
        if (!capacity.allowed) {
          return { kind: "capacity_conflict" as const, capacity };
        }
      }

      const [row] = await tx
        .update(excursionsTable)
        .set({ ...allowed, updatedAt: new Date() })
        .where(eq(excursionsTable.id, id))
        .returning();
      return row
        ? { kind: "updated" as const, row }
        : { kind: "not_found" as const };
    });

    if (updateResult.kind === "not_found") {
      res.status(404).json({ error: "Gita non trovata." });
      return;
    }
    if (updateResult.kind === "status_conflict") {
      res.status(409).json({
        error: `La gita è ora in stato ${updateResult.currentStatus}: non può essere riaperta dal form generico. Usa il comando operativo dedicato.`,
        code: "EXCURSION_STATUS_CONCURRENT_CONFLICT",
      });
      return;
    }
    if (updateResult.kind === "missing_departure") {
      res.status(400).json({
        error: "Imposta data e ora di partenza prima di aprire la gita.",
      });
      return;
    }
    if (updateResult.kind === "past_departure") {
      res.status(400).json({
        error: "L'orario inserito per una gita legacy deve essere futuro.",
        code: "EXCURSION_DEPARTURE_UNAVAILABLE",
      });
      return;
    }
    if (updateResult.kind === "booking_conflict") {
      res.status(409).json({
        error:
          updateResult.field === "departure"
            ? "La gita ha già prenotazioni: per cambiare la partenza serve un workflow dedicato di riprogrammazione con ricalcolo scadenze e comunicazioni ai clienti."
            : "La gita ha già prenotazioni: non è possibile cambiare categoria tra standard e RIDENT perché partecipanti, prezzi e raccolta storici diventerebbero incoerenti.",
        code:
          updateResult.field === "departure"
            ? "EXCURSION_RESCHEDULE_WORKFLOW_REQUIRED"
            : "EXCURSION_CATEGORY_CHANGE_BLOCKED",
      });
      return;
    }
    if (updateResult.kind === "capacity_conflict") {
      res.status(409).json({
        error: `Capienza non modificata: ci sono ${updateResult.capacity.occupiedSeats} posti già occupati o riservati, ma la nuova capienza è ${updateResult.capacity.capacity}.`,
        code: "EXCURSION_CAPACITY_BELOW_OCCUPIED",
        ...updateResult.capacity,
      });
      return;
    }
    const updated = updateResult.row;

    const [pendingRequestsCount, revenue] = await Promise.all([
      getPendingRequestsCount(id),
      getExcursionRevenue(id),
    ]);
    res.json({
      ...updated,
      ...calcFinancials(updated, revenue),
      pendingRequestsCount,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "EXCURSION_DEPARTED") {
      res.status(409).json({
        error: "La gita non può essere confermata dopo la partenza.",
        code: "EXCURSION_ALREADY_DEPARTED",
      });
      return;
    }
    if (err instanceof BookingCancellationError) {
      res.status(err.statusCode).json({ error: err.message, code: err.code });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

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
      clientCommandId?: string;
      customerName: string;
      customerId?: string;
      email?: string | null;
      phone?: string | null;
      sendCustomerEmail?: boolean;
      participants?: ManualParticipantInput[];
      paymentStatus?: string;
      totalAmountCents?: number;
      paymentAmountCents?: number;
      paymentMethod?: string | null;
      paymentDeadline?: string | null;
      transactionReference?: string | null;
      pickupPointId?: string | null;
      servizioCasa?: boolean;
      homePickupAddress?: string | null;
    };

    let bookingAttemptId: string;
    try {
      bookingAttemptId = normalizeManualBookingClientCommandId(
        body.clientCommandId,
      );
    } catch (error) {
      res.status(400).json({
        error:
          error instanceof ManualBookingValidationError
            ? error.message
            : "Identificativo del comando non valido.",
      });
      return;
    }

    const customerName = body.customerName?.trim() ?? "";
    const email = body.email?.trim() || null;
    const phone = body.phone?.trim() || null;
    let customerNotificationsEnabled: boolean;
    if (!customerName) {
      res.status(400).json({ error: "Nome del referente obbligatorio." });
      return;
    }
    if (
      customerName.length > 200 ||
      (email?.length ?? 0) > 200 ||
      (phone?.length ?? 0) > 40
    ) {
      res.status(400).json({ error: "Dati del referente troppo lunghi." });
      return;
    }
    if (email && !ADMIN_BOOKING_EMAIL_REGEX.test(email)) {
      res.status(400).json({ error: "Indirizzo email non valido." });
      return;
    }
    try {
      customerNotificationsEnabled = normalizeManualCustomerNotifications(
        body.sendCustomerEmail,
        email,
      );
    } catch (error) {
      res.status(400).json({
        error:
          error instanceof ManualBookingValidationError
            ? error.message
            : "Preferenza email cliente non valida.",
      });
      return;
    }

    const paymentStatusRaw = body.paymentStatus;
    if (!isAdminCreatableStatus(paymentStatusRaw)) {
      res.status(400).json({ error: "Stato pagamento non valido." });
      return;
    }
    const paymentStatus = paymentStatusRaw;
    const paymentSettings = await getPaymentSettings();

    const result = await db.transaction(async (tx) => {
      const [excursion] = await tx
        .select()
        .from(excursionsTable)
        .where(eq(excursionsTable.id, id))
        .for("update")
        .limit(1);

      if (!excursion) return { kind: "not_found" as const };
      if (!isManuallyBookableExcursionStatus(excursion.status)) {
        return { kind: "closed_status" as const, status: excursion.status };
      }
      if (!excursion.departureAt) {
        return { kind: "missing_departure" as const };
      }

      const now = new Date();
      const bookingCloseAt = excursion.bookingCloseDate
        ? endOfDayInRome(excursion.bookingCloseDate)
        : null;
      if (bookingCloseAt && now > bookingCloseAt) {
        return { kind: "booking_closed" as const };
      }
      if (excursion.departureAt && now >= excursion.departureAt) {
        return { kind: "departed" as const };
      }

      const activePickupRows = await tx
        .select({
          id: excursionPickupPointsTable.id,
          name: pickupLocationsTable.name,
        })
        .from(excursionPickupPointsTable)
        .innerJoin(
          pickupLocationsTable,
          eq(
            excursionPickupPointsTable.pickupLocationId,
            pickupLocationsTable.id,
          ),
        )
        .where(
          and(
            eq(excursionPickupPointsTable.excursionId, id),
            eq(pickupLocationsTable.active, true),
          ),
        );
      const activeAgeRows =
        excursion.category === "rident"
          ? []
          : await tx
              .select({ id: ageRangesTable.id, label: ageRangesTable.label })
              .from(ageRangesTable)
              .where(eq(ageRangesTable.active, true));
      const activePickupPoints = new Map(
        activePickupRows.map((pickupPoint) => [
          pickupPoint.id,
          pickupPoint.name,
        ]),
      );
      const activeAgeRanges = new Map(
        activeAgeRows.map((ageRange) => [ageRange.id, ageRange.label]),
      );

      let normalized: ReturnType<typeof normalizeManualBookingParticipants>;
      let financial: ReturnType<typeof normalizeManualBookingFinancials>;
      let homePickup: ReturnType<typeof normalizeHomePickupRequest>;
      try {
        normalized = normalizeManualBookingParticipants(
          body.participants,
          excursion.category === "rident",
          {
            activePickupPoints,
            activeAgeRanges,
            standardPickupPointId:
              excursion.category === "rident" ? null : body.pickupPointId,
          },
        );
        financial = normalizeManualBookingFinancials(
          {
            paymentStatus,
            totalAmountCents: body.totalAmountCents,
            paymentAmountCents: body.paymentAmountCents,
            paymentMethod: body.paymentMethod,
            paymentDeadline: body.paymentDeadline,
            transactionReference: body.transactionReference,
          },
          {
            excursionStatus: excursion.status,
            departureAt: excursion.departureAt,
            graceMinutes: paymentSettings.paymentGraceMinutes,
            now,
            seats: normalized.seats,
          },
        );
        homePickup = normalizeHomePickupRequest(
          {
            servizioCasa: body.servizioCasa,
            homePickupAddress: body.homePickupAddress,
          },
          { available: activePickupPoints.size > 0 },
        );
      } catch (error) {
        if (
          error instanceof ManualBookingValidationError ||
          error instanceof ParticipantDetailsError ||
          error instanceof HomePickupValidationError
        ) {
          return { kind: "invalid" as const, error: error.message };
        }
        throw error;
      }

      const commandFingerprint = manualBookingCommandFingerprint({
        excursionId: id,
        customerName,
        customerId: body.customerId?.trim() || null,
        email,
        phone,
        customerNotificationsEnabled,
        participants: normalized.participants,
        financial,
        servizioCasa: homePickup.servizioCasa,
        homePickupAddress: homePickup.homePickupAddress,
      });
      const commandNote = manualBookingCommandNote(commandFingerprint);

      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${bookingAttemptId}, 0))`,
      );
      const [existingBooking] = await tx
        .select()
        .from(excursionBookingsTable)
        .where(eq(excursionBookingsTable.bookingAttemptId, bookingAttemptId))
        .limit(1);
      if (existingBooking) {
        const [existingRequest] = await tx
          .select({
            id: paymentRequestsTable.id,
            notes: paymentRequestsTable.notes,
          })
          .from(paymentRequestsTable)
          .where(eq(paymentRequestsTable.bookingId, existingBooking.id))
          .orderBy(asc(paymentRequestsTable.createdAt))
          .limit(1);
        if (existingRequest?.notes !== commandNote) {
          return { kind: "attempt_conflict" as const };
        }
        return {
          kind: "created" as const,
          booking: existingBooking,
          paymentRequestId: existingRequest.id,
          reused: true,
        };
      }

      const occupiedSeats = await getOccupiedSeatsInTransaction(
        tx,
        id,
        excursion.adherentsCount,
      );
      const capacity = decideExcursionCapacity({
        capacity: excursion.currentCapacity,
        occupiedSeats,
        additionalSeats: normalized.seats,
      });
      if (!capacity.allowed) {
        return { kind: "capacity_conflict" as const, capacity };
      }
      const bookingCode = await allocateUniqueBookingCodeInTransaction(tx);
      const [created] = await tx
        .insert(excursionBookingsTable)
        .values({
          excursionId: id,
          customerName,
          customerId: body.customerId?.trim() || null,
          email,
          phone,
          seats: normalized.seats,
          adults: normalized.adults,
          children: normalized.children,
          paymentStatus: financial.paymentStatus,
          bookingCode,
          paymentType: financial.paymentType,
          paymentMethod: financial.paymentMethod,
          totalAmountCents: financial.totalAmountCents,
          amountDueCents: financial.amountDueCents,
          amountPaidCents: financial.amountPaidCents,
          paymentDeadline: financial.paymentDeadline,
          servizioCasa: homePickup.servizioCasa,
          homePickupAddress: homePickup.homePickupAddress,
          pickupPointId:
            excursion.category === "rident"
              ? null
              : (normalized.participants[0]?.pickupPointId ?? null),
          workflowVersion: 3,
          bookingAttemptId,
          customerNotificationsEnabled,
          seatStatus: financial.seatStatus,
          seatHoldExpiresAt: financial.seatHoldExpiresAt,
        })
        .returning();

      await tx.insert(bookingParticipantsTable).values(
        normalized.participants.map((participant) => ({
          bookingId: created.id,
          participantType: participant.type,
          ageRangeId: participant.ageRangeId,
          ageRangeLabel: participant.ageRangeLabel,
          pickupPointId: participant.pickupPointId,
          pickupPointName: participant.pickupPointName,
          firstName: participant.firstName,
          lastName: participant.lastName,
          dataCompleted: true,
          sortOrder: participant.sortOrder,
        })),
      );

      const [createdRequest] = await tx
        .insert(paymentRequestsTable)
        .values({
          bookingId: created.id,
          type: financial.paymentType,
          amountCents: financial.requestAmountCents,
          status: financial.requestStatus,
          method: financial.paymentMethod,
          deadline: financial.paymentDeadline,
          graceUntil: financial.graceUntil,
          paidAt: financial.paidAt,
          transactionReference: financial.transactionReference,
          notes: commandNote,
        })
        .returning({ id: paymentRequestsTable.id });

      await tx
        .update(excursionsTable)
        .set({
          adherentsCount: sql`${excursionsTable.adherentsCount} + ${normalized.seats}`,
          depositsCount:
            financial.depositsDelta > 0
              ? sql`${excursionsTable.depositsCount} + ${financial.depositsDelta}`
              : excursionsTable.depositsCount,
          balancesCount:
            financial.balancesDelta > 0
              ? sql`${excursionsTable.balancesCount} + ${financial.balancesDelta}`
              : excursionsTable.balancesCount,
          updatedAt: new Date(),
        })
        .where(eq(excursionsTable.id, id));

      return {
        kind: "created" as const,
        booking: created,
        paymentRequestId: createdRequest.id,
        reused: false,
      };
    });

    if (result.kind === "not_found") {
      res.status(404).json({ error: "Gita non trovata." });
      return;
    }
    if (result.kind === "closed_status") {
      res.status(409).json({
        error:
          "La gita non accetta prenotazioni manuali: deve essere aperta o confermata.",
        code: "EXCURSION_NOT_BOOKABLE",
        status: result.status,
      });
      return;
    }
    if (result.kind === "missing_departure") {
      res.status(409).json({
        error:
          "Imposta data e ora di partenza prima di aggiungere una prenotazione manuale.",
        code: "EXCURSION_DEPARTURE_MISSING",
      });
      return;
    }
    if (result.kind === "booking_closed") {
      res.status(409).json({
        error:
          "Le prenotazioni sono chiuse per la data configurata. Modifica prima la chiusura della gita.",
        code: "EXCURSION_BOOKING_CLOSED",
      });
      return;
    }
    if (result.kind === "departed") {
      res.status(409).json({
        error:
          "La gita è già partita: non è possibile aggiungere partecipanti.",
        code: "EXCURSION_ALREADY_DEPARTED",
      });
      return;
    }
    if (result.kind === "invalid") {
      res.status(400).json({ error: result.error });
      return;
    }
    if (result.kind === "capacity_conflict") {
      res.status(409).json({
        error: `Posti insufficienti: ${result.capacity.occupiedSeats} già occupati, ${result.capacity.additionalSeats} richiesti, capienza ${result.capacity.capacity}.`,
        code: "EXCURSION_CAPACITY_EXCEEDED",
        ...result.capacity,
      });
      return;
    }

    if (result.kind === "attempt_conflict") {
      res.status(409).json({
        error:
          "Questo comando di prenotazione è già stato usato con dati diversi. Chiudi e riapri il modulo prima di riprovare.",
        code: "MANUAL_BOOKING_COMMAND_CONFLICT",
      });
      return;
    }

    const postCommitNotifications: Promise<void>[] = [
      dispatchNewBookingAdminEmailV2(result.booking.id),
    ];
    if (result.booking.customerNotificationsEnabled && result.booking.email) {
      postCommitNotifications.push(
        result.booking.paymentStatus === "deposit" ||
          result.booking.paymentStatus === "paid"
          ? dispatchPaymentReceivedEmailV2(
              result.booking.id,
              result.booking.paymentType ?? "full",
              result.paymentRequestId,
            )
          : dispatchBookingInstructionsCustomerEmailV2(result.booking.id),
      );
    }
    await Promise.all(postCommitNotifications);

    res.status(result.reused ? 200 : 201).json(result.booking);
  } catch (err) {
    if (err instanceof BookingCodeAllocationError) {
      res.status(503).json({
        error:
          "Codice prenotazione temporaneamente non disponibile. Riprova usando lo stesso comando.",
        code: "BOOKING_CODE_ALLOCATION_FAILED",
      });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.put("/bookings/:bookingId/participants", async (req, res) => {
  try {
    const { bookingId } = req.params;
    const body = req.body as {
      participants?: Array<ManualParticipantInput & { id?: string | null }>;
      pickupPointId?: string | null;
    };
    const result = await db.transaction(async (tx) => {
      const [booking] = await tx
        .select()
        .from(excursionBookingsTable)
        .where(eq(excursionBookingsTable.id, bookingId))
        .for("update")
        .limit(1);
      if (!booking) return { kind: "not_found" as const };
      if (booking.cancelledAt) return { kind: "cancelled" as const };

      const [excursion] = await tx
        .select({
          id: excursionsTable.id,
          category: excursionsTable.category,
          status: excursionsTable.status,
        })
        .from(excursionsTable)
        .where(eq(excursionsTable.id, booking.excursionId))
        .for("update")
        .limit(1);
      if (!excursion) return { kind: "not_found" as const };
      if (["completed", "cancelled", "archived"].includes(excursion.status)) {
        return { kind: "closed" as const };
      }

      const activePickupRows = await tx
        .select({
          id: excursionPickupPointsTable.id,
          name: pickupLocationsTable.name,
        })
        .from(excursionPickupPointsTable)
        .innerJoin(
          pickupLocationsTable,
          eq(
            excursionPickupPointsTable.pickupLocationId,
            pickupLocationsTable.id,
          ),
        )
        .where(
          and(
            eq(excursionPickupPointsTable.excursionId, excursion.id),
            eq(pickupLocationsTable.active, true),
          ),
        );
      const activeAgeRows =
        excursion.category === "rident"
          ? []
          : await tx
              .select({ id: ageRangesTable.id, label: ageRangesTable.label })
              .from(ageRangesTable)
              .where(eq(ageRangesTable.active, true));
      const activePickupPoints = new Map(
        activePickupRows.map((pickupPoint) => [
          pickupPoint.id,
          pickupPoint.name,
        ]),
      );
      const activeAgeRanges = new Map(
        activeAgeRows.map((ageRange) => [ageRange.id, ageRange.label]),
      );

      let normalized: ReturnType<typeof normalizeManualBookingParticipants>;
      try {
        normalized = normalizeManualBookingParticipants(
          body.participants,
          excursion.category === "rident",
          {
            activePickupPoints,
            activeAgeRanges,
            standardPickupPointId:
              excursion.category === "rident" ? null : body.pickupPointId,
          },
        );
      } catch (error) {
        if (
          error instanceof ManualBookingValidationError ||
          error instanceof ParticipantDetailsError
        ) {
          return { kind: "invalid" as const, error: error.message };
        }
        throw error;
      }
      if (normalized.seats !== booking.seats) {
        return {
          kind: "seat_mismatch" as const,
          expectedSeats: booking.seats,
          receivedParticipants: normalized.seats,
        };
      }

      const existingParticipants = await tx
        .select()
        .from(bookingParticipantsTable)
        .where(eq(bookingParticipantsTable.bookingId, booking.id))
        .orderBy(asc(bookingParticipantsTable.sortOrder))
        .for("update");
      let submittedParticipantIds: Array<string | null>;
      try {
        submittedParticipantIds = normalizeRetainedParticipantIds(
          body.participants ?? [],
          existingParticipants.map((participant) => participant.id),
        );
      } catch (error) {
        if (error instanceof ParticipantDetailsError) {
          return { kind: "invalid" as const, error: error.message };
        }
        throw error;
      }
      const standardPickupPointId =
        excursion.category === "rident"
          ? null
          : (normalized.participants[0]?.pickupPointId ?? null);
      const alreadyApplied =
        existingParticipants.every(
          (participant, index) =>
            submittedParticipantIds[index] === participant.id,
        ) &&
        manualParticipantDetailsAreUnchanged(
          existingParticipants,
          normalized.participants,
        ) &&
        booking.adults === normalized.adults &&
        booking.children === normalized.children &&
        (booking.pickupPointId ?? null) === standardPickupPointId;
      if (alreadyApplied) {
        return {
          kind: "updated" as const,
          alreadyApplied: true,
          participants: existingParticipants,
          updatedAt: booking.updatedAt,
        };
      }

      const now = new Date();
      const persistedParticipants = [];
      for (const [index, participant] of normalized.participants.entries()) {
        const participantId = submittedParticipantIds[index];
        if (participantId) {
          const [updatedParticipant] = await tx
            .update(bookingParticipantsTable)
            .set({
              participantType: participant.type,
              ageRangeId: participant.ageRangeId,
              ageRangeLabel: participant.ageRangeLabel,
              pickupPointId: participant.pickupPointId,
              pickupPointName: participant.pickupPointName,
              firstName: participant.firstName,
              lastName: participant.lastName,
              dataCompleted: true,
              sortOrder: participant.sortOrder,
              updatedAt: now,
            })
            .where(
              and(
                eq(bookingParticipantsTable.id, participantId),
                eq(bookingParticipantsTable.bookingId, booking.id),
              ),
            )
            .returning();
          if (!updatedParticipant) {
            throw new Error(
              `Participant ${participantId} disappeared while locked.`,
            );
          }
          persistedParticipants.push(updatedParticipant);
          continue;
        }
        const [insertedParticipant] = await tx
          .insert(bookingParticipantsTable)
          .values({
            bookingId: booking.id,
            participantType: participant.type,
            ageRangeId: participant.ageRangeId,
            ageRangeLabel: participant.ageRangeLabel,
            pickupPointId: participant.pickupPointId,
            pickupPointName: participant.pickupPointName,
            basePriceCents: 0,
            pickupSurchargeCents: 0,
            finalPriceCents: 0,
            firstName: participant.firstName,
            lastName: participant.lastName,
            dataCompleted: true,
            sortOrder: participant.sortOrder,
            updatedAt: now,
          })
          .returning();
        if (!insertedParticipant) {
          throw new Error("Participant insertion returned no row.");
        }
        persistedParticipants.push(insertedParticipant);
      }
      const [updatedBooking] = await tx
        .update(excursionBookingsTable)
        .set({
          adults: normalized.adults,
          children: normalized.children,
          pickupPointId: standardPickupPointId,
          updatedAt: now,
        })
        .where(eq(excursionBookingsTable.id, booking.id))
        .returning({ updatedAt: excursionBookingsTable.updatedAt });
      return {
        kind: "updated" as const,
        alreadyApplied: false,
        participants: persistedParticipants,
        updatedAt: updatedBooking?.updatedAt ?? now,
      };
    });

    if (result.kind === "not_found") {
      res.status(404).json({ error: "Prenotazione non trovata." });
      return;
    }
    if (result.kind === "cancelled" || result.kind === "closed") {
      res.status(409).json({
        error:
          result.kind === "cancelled"
            ? "La prenotazione è annullata: i partecipanti non sono modificabili."
            : "La gita è conclusa o chiusa: i partecipanti non sono modificabili.",
        code: "PARTICIPANT_DETAILS_NOT_EDITABLE",
      });
      return;
    }
    if (result.kind === "invalid") {
      res.status(400).json({ error: result.error });
      return;
    }
    if (result.kind === "seat_mismatch") {
      res.status(400).json({
        error: `La prenotazione occupa ${result.expectedSeats} posti: inserisci esattamente ${result.expectedSeats} partecipanti.`,
        code: "PARTICIPANT_COUNT_MISMATCH",
        expectedSeats: result.expectedSeats,
        receivedParticipants: result.receivedParticipants,
      });
      return;
    }
    res.json({
      ok: true,
      alreadyApplied: result.alreadyApplied,
      participantsDetailed: true,
      participants: result.participants,
      updatedAt: result.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("Participant replacement failed:", error);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.patch("/excursions/:id/bookings/:bookingId", async (req, res) => {
  const { paymentStatus } = req.body as { paymentStatus?: string };
  if (!isValidPaymentStatus(paymentStatus)) {
    res.status(400).json({ error: "Stato pagamento non valido." });
    return;
  }
  res.status(409).json({
    error:
      "Lo stato economico non può essere modificato direttamente. Registra il pagamento sulla relativa richiesta indicando il riferimento dell'operazione.",
    code: "PAYMENT_REQUIRES_FINANCIAL_OPERATION",
  });
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

      if (!booking || booking.excursionId !== id) {
        return { kind: "not_found" as const };
      }

      const [requestWithIntent] = await tx
        .select({ id: paymentRequestsTable.id })
        .from(paymentRequestsTable)
        .where(
          and(
            eq(paymentRequestsTable.bookingId, bookingId),
            isNotNull(paymentRequestsTable.stripePaymentIntentId),
          ),
        )
        .limit(1);
      const [attemptWithIntent] = await tx
        .select({ id: paymentAttemptsTable.id })
        .from(paymentAttemptsTable)
        .innerJoin(
          paymentRequestsTable,
          eq(paymentAttemptsTable.paymentRequestId, paymentRequestsTable.id),
        )
        .where(
          and(
            eq(paymentRequestsTable.bookingId, bookingId),
            isNotNull(paymentAttemptsTable.stripePaymentIntentId),
          ),
        )
        .limit(1);
      const [refund] = await tx
        .select({ id: paymentRefundsTable.id })
        .from(paymentRefundsTable)
        .where(eq(paymentRefundsTable.bookingId, bookingId))
        .limit(1);
      const [paidRequest] = await tx
        .select({ id: paymentRequestsTable.id })
        .from(paymentRequestsTable)
        .where(
          and(
            eq(paymentRequestsTable.bookingId, bookingId),
            or(
              eq(paymentRequestsTable.status, "paid"),
              isNotNull(paymentRequestsTable.transactionReference),
            ),
          ),
        )
        .limit(1);
      const [cancellationCase] = await tx
        .select({ id: bookingCancellationCasesTable.id })
        .from(bookingCancellationCasesTable)
        .where(eq(bookingCancellationCasesTable.bookingId, bookingId))
        .limit(1);
      const [activeCleanup] = await tx
        .select({ id: stripeCleanupJobsTable.id })
        .from(stripeCleanupJobsTable)
        .where(
          and(
            eq(stripeCleanupJobsTable.bookingId, bookingId),
            inArray(stripeCleanupJobsTable.status, [
              "pending",
              "processing",
              "failed",
              "manual_required",
            ]),
          ),
        )
        .limit(1);
      if (
        booking.amountPaidCents > 0 ||
        booking.stripePaymentIntentId ||
        booking.stripeSetupIntentId ||
        requestWithIntent ||
        attemptWithIntent ||
        paidRequest ||
        cancellationCase ||
        refund ||
        activeCleanup
      ) {
        return { kind: "financial_history" as const };
      }

      // Le cancellazioni hanno gia aggiornato i contatori. Per tutte le altre
      // prenotazioni la guardia su seatStatus evita doppi decrementi, inclusi
      // i record gia rilasciati per scadenza.
      if (!booking.cancelledAt) {
        await releaseBookingSeatsInTransaction(
          tx,
          bookingId,
          "booking_deleted",
        );
      }

      await tx
        .delete(excursionBookingsTable)
        .where(eq(excursionBookingsTable.id, bookingId));

      // If the booking was already cancelled, counters were already
      // decremented at cancellation time — do not decrement again.
      if (booking.cancelledAt) return { kind: "deleted" as const };

      const seats = booking.seats;
      const depositsDelta = booking.paymentStatus === "deposit" ? -seats : 0;
      const balancesDelta = booking.paymentStatus === "paid" ? -seats : 0;

      await tx
        .update(excursionsTable)
        .set({
          depositsCount: sql`GREATEST(0, ${excursionsTable.depositsCount} + ${depositsDelta})`,
          balancesCount: sql`GREATEST(0, ${excursionsTable.balancesCount} + ${balancesDelta})`,
          updatedAt: new Date(),
        })
        .where(eq(excursionsTable.id, id));

      return { kind: "deleted" as const };
    });

    if (removed.kind === "not_found") {
      res.status(404).json({ error: "Prenotazione non trovata." });
      return;
    }
    if (removed.kind === "financial_history") {
      res.status(409).json({
        error:
          "La prenotazione ha movimenti, annullamenti o riferimenti tecnici e non può essere eliminata. Usa il flusso di annullamento per preservare lo storico finanziario.",
        code: "financial_history",
      });
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

    if (!vehicleId) {
      res.status(400).json({ error: "Seleziona un veicolo." });
      return;
    }

    const result = await db.transaction(async (tx) => {
      const [excursion] = await tx
        .select({
          id: excursionsTable.id,
          adherentsCount: excursionsTable.adherentsCount,
        })
        .from(excursionsTable)
        .where(eq(excursionsTable.id, id))
        .for("update")
        .limit(1);
      if (!excursion) return { kind: "excursion_not_found" as const };

      const [vehicle] = await tx
        .select()
        .from(excursionVehiclesTable)
        .where(eq(excursionVehiclesTable.id, vehicleId))
        .limit(1);
      if (!vehicle) return { kind: "vehicle_not_found" as const };

      const occupiedSeats = await getOccupiedSeatsInTransaction(
        tx,
        id,
        excursion.adherentsCount,
      );
      const capacity = decideExcursionCapacity({
        capacity: vehicle.capacity,
        occupiedSeats,
      });
      if (!capacity.allowed) {
        return { kind: "capacity_conflict" as const, capacity, vehicle };
      }

      const [updated] = await tx
        .update(excursionsTable)
        .set({
          vehicleId,
          currentCapacity: vehicle.capacity,
          vehicleFixedCost: vehicleFixedCost ?? vehicle.fixedCost,
          updatedAt: new Date(),
        })
        .where(eq(excursionsTable.id, id))
        .returning();
      if (!updated) return { kind: "excursion_not_found" as const };
      return { kind: "updated" as const, updated };
    });

    if (result.kind === "excursion_not_found") {
      res.status(404).json({ error: "Gita non trovata." });
      return;
    }
    if (result.kind === "vehicle_not_found") {
      res.status(404).json({ error: "Veicolo non trovato." });
      return;
    }
    if (result.kind === "capacity_conflict") {
      res.status(409).json({
        error: `Impossibile assegnare ${result.vehicle.name}: ha ${result.capacity.capacity} posti, ma ${result.capacity.occupiedSeats} sono già occupati o riservati.`,
        code: "VEHICLE_CAPACITY_BELOW_OCCUPIED",
        vehicleId: result.vehicle.id,
        vehicleName: result.vehicle.name,
        ...result.capacity,
      });
      return;
    }

    const [pendingRequestsCount, revenue] = await Promise.all([
      getPendingRequestsCount(id),
      getExcursionRevenue(id),
    ]);
    res.json({
      ...result.updated,
      ...calcFinancials(result.updated, revenue),
      pendingRequestsCount,
    });
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

function parseVehicleBody(
  body: Partial<typeof excursionVehiclesTable.$inferInsert>,
) {
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
    const body = req.body as Partial<
      typeof excursionVehiclesTable.$inferInsert
    >;
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
    const body = req.body as Partial<
      typeof excursionVehiclesTable.$inferInsert
    >;

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
      notes: "notes" in body ? (body.notes ?? null) : existing.notes,
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
          province: pickupLocationsTable.province,
          sortOrder: pickupLocationsTable.sortOrder,
          active: pickupLocationsTable.active,
        },
      })
      .from(excursionPickupPointsTable)
      .innerJoin(
        pickupLocationsTable,
        eq(
          excursionPickupPointsTable.pickupLocationId,
          pickupLocationsTable.id,
        ),
      )
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
    const row = await db.transaction(async (tx) => {
      const changedAt = new Date();
      const [inserted] = await tx
        .insert(excursionPickupPointsTable)
        .values({
          excursionId: id,
          pickupLocationId,
          pickupTime: pickupTime?.trim() || null,
          sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
        })
        .returning();
      await tx
        .update(excursionsTable)
        .set({ updatedAt: changedAt })
        .where(eq(excursionsTable.id, id));
      return inserted;
    });
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
    if (pickupTime !== undefined)
      updates.pickupTime = pickupTime?.trim() || null;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    const row = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(excursionPickupPointsTable)
        .set(updates)
        .where(
          and(
            eq(excursionPickupPointsTable.id, ppId),
            eq(excursionPickupPointsTable.excursionId, id),
          ),
        )
        .returning();
      if (!updated) return null;
      await tx
        .update(excursionsTable)
        .set({ updatedAt: new Date() })
        .where(eq(excursionsTable.id, id));
      return updated;
    });
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
    const deleted = await db.transaction(async (tx) => {
      const [removed] = await tx
        .delete(excursionPickupPointsTable)
        .where(
          and(
            eq(excursionPickupPointsTable.id, ppId),
            eq(excursionPickupPointsTable.excursionId, id),
          ),
        )
        .returning();
      if (!removed) return null;
      await tx
        .update(excursionsTable)
        .set({ updatedAt: new Date() })
        .where(eq(excursionsTable.id, id));
      return removed;
    });
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
