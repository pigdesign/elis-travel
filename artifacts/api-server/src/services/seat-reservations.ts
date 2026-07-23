import { db } from "@workspace/db";
import { excursionBookingsTable, excursionsTable } from "@workspace/db/schema";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import {
  authoritativeOccupiedSeats,
  decideExcursionCapacity,
} from "./excursion-capacity";

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type SeatReleaseReason =
  | "card_checkout_expired"
  | "payment_expired"
  | "customer_cancelled"
  | "admin_cancelled"
  | "booking_deleted"
  | "excursion_cancelled"
  | "stripe_initialization_failed";

/**
 * Libera i posti una sola volta. La UPDATE condizionale sulla prenotazione e
 * il decremento del contatore vivono nella stessa transazione.
 */
export async function releaseBookingSeatsInTransaction(
  tx: DbTransaction,
  bookingId: string,
  reason: SeatReleaseReason,
  now: Date = new Date(),
): Promise<{ released: boolean; excursionId?: string; seats?: number }> {
  const [released] = await tx
    .update(excursionBookingsTable)
    .set({
      seatStatus: "released",
      seatReleasedAt: now,
      seatReleaseReason: reason,
      seatHoldExpiresAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(excursionBookingsTable.id, bookingId),
        ne(excursionBookingsTable.seatStatus, "released"),
      ),
    )
    .returning({
      excursionId: excursionBookingsTable.excursionId,
      seats: excursionBookingsTable.seats,
    });

  if (!released) return { released: false };

  await tx
    .update(excursionsTable)
    .set({
      adherentsCount: sql`GREATEST(${excursionsTable.adherentsCount} - ${released.seats}, 0)`,
      updatedAt: now,
    })
    .where(eq(excursionsTable.id, released.excursionId));

  return {
    released: true,
    excursionId: released.excursionId,
    seats: released.seats,
  };
}

export async function releaseBookingSeats(
  bookingId: string,
  reason: SeatReleaseReason,
  now: Date = new Date(),
): Promise<{ released: boolean; excursionId?: string; seats?: number }> {
  return db.transaction((tx) =>
    releaseBookingSeatsInTransaction(tx, bookingId, reason, now),
  );
}

/** Conferma la riserva quando arriva almeno un pagamento. */
export async function confirmBookingSeatsInTransaction(
  tx: DbTransaction,
  bookingId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const updated = await tx
    .update(excursionBookingsTable)
    .set({
      seatStatus: "confirmed",
      seatHoldExpiresAt: null,
      seatReleasedAt: null,
      seatReleaseReason: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(excursionBookingsTable.id, bookingId),
        ne(excursionBookingsTable.seatStatus, "released"),
      ),
    )
    .returning({ id: excursionBookingsTable.id });
  return updated.length > 0;
}

export type ReacquireSeatsResult = "reserved" | "already_reserved" | "not_found" | "full" | "closed";

/**
 * Riattiva una prenotazione rilasciata soltanto se la capacita e ancora
 * disponibile. Evita che una proroga amministrativa crei overbooking.
 */
export async function reacquireBookingSeatsInTransaction(
  tx: DbTransaction,
  bookingId: string,
  holdUntil: Date | null,
  now: Date = new Date(),
): Promise<ReacquireSeatsResult> {
  const [booking] = await tx
    .select({
      id: excursionBookingsTable.id,
      excursionId: excursionBookingsTable.excursionId,
      seats: excursionBookingsTable.seats,
      seatStatus: excursionBookingsTable.seatStatus,
      cancelledAt: excursionBookingsTable.cancelledAt,
    })
    .from(excursionBookingsTable)
    .where(eq(excursionBookingsTable.id, bookingId))
    .for("update")
    .limit(1);

  if (!booking || booking.cancelledAt) return "not_found";
  if (booking.seatStatus !== "released") return "already_reserved";

  const [excursion] = await tx
    .select({
      id: excursionsTable.id,
      status: excursionsTable.status,
      currentCapacity: excursionsTable.currentCapacity,
      adherentsCount: excursionsTable.adherentsCount,
    })
    .from(excursionsTable)
    .where(eq(excursionsTable.id, booking.excursionId))
    .for("update")
    .limit(1);
  if (
    !excursion ||
    ["completed", "cancelled", "archived"].includes(excursion.status)
  ) {
    return "closed";
  }

  const [activeSeatRow] = await tx
    .select({
      seats: sql<number>`coalesce(sum(${excursionBookingsTable.seats}), 0)::int`,
    })
    .from(excursionBookingsTable)
    .where(
      and(
        eq(excursionBookingsTable.excursionId, excursion.id),
        isNull(excursionBookingsTable.cancelledAt),
        inArray(excursionBookingsTable.seatStatus, ["held", "confirmed"]),
      ),
    );
  const occupiedSeats = authoritativeOccupiedSeats(
    activeSeatRow?.seats ?? 0,
    excursion.adherentsCount,
  );
  const capacity = decideExcursionCapacity({
    capacity: excursion.currentCapacity,
    occupiedSeats,
    additionalSeats: booking.seats,
  });
  if (!capacity.allowed) return "full";

  await tx
    .update(excursionsTable)
    .set({
      adherentsCount: capacity.requiredSeats,
      updatedAt: now,
    })
    .where(eq(excursionsTable.id, excursion.id));

  await tx
    .update(excursionBookingsTable)
    .set({
      seatStatus: "held",
      seatHoldExpiresAt: holdUntil,
      seatReleasedAt: null,
      seatReleaseReason: null,
      updatedAt: now,
    })
    .where(eq(excursionBookingsTable.id, booking.id));

  return "reserved";
}
