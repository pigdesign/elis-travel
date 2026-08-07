import { db } from "@workspace/db";
import {
  customerAccountBookingsTable,
  excursionBookingsTable,
  excursionsTable,
  paymentRequestsTable,
} from "@workspace/db/schema";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Elenco dei viaggi di un account.
//
// Le prenotazioni arrivano SEMPRE da customer_account_bookings, mai da una
// ricerca per email: la proprieta e dichiarata, non dedotta.
// ---------------------------------------------------------------------------

export const BOOKING_SCOPES = ["upcoming", "past", "cancelled"] as const;
export type BookingScope = (typeof BOOKING_SCOPES)[number];

export function isBookingScope(value: unknown): value is BookingScope {
  return (
    typeof value === "string" &&
    (BOOKING_SCOPES as readonly string[]).includes(value)
  );
}

export type PendingAction =
  | { kind: "payment_due"; amountCents: number; deadline: Date | null }
  | { kind: "cancellation_pending" };

export type AccountBooking = {
  bookingId: string;
  bookingCode: string | null;
  excursionName: string;
  location: string;
  departureAt: Date | null;
  date: string;
  seats: number;
  totalAmountCents: number;
  amountPaidCents: number;
  residualCents: number;
  paymentStatus: string;
  seatStatus: string;
  cancelledAt: Date | null;
  cancellationRequestStatus: string | null;
  pendingAction: PendingAction | null;
};

/**
 * Momento a cui confrontare la partenza. `departureAt` e timezone-aware ed e
 * la fonte giusta quando c'e; `date` resta il ripiego per le gite storiche.
 */
function departureMoment(row: {
  departureAt: Date | null;
  date: string;
}): Date {
  if (row.departureAt) return row.departureAt;
  // Senza orario, una gita conta come passata dalla fine del suo giorno: alle
  // 9 del mattino la gita di oggi e ancora "in arrivo", non "passata".
  return new Date(`${row.date}T23:59:59`);
}

export function classifyBooking(
  row: {
    departureAt: Date | null;
    date: string;
    cancelledAt: Date | null;
    seatStatus: string;
  },
  now: Date,
): BookingScope {
  if (row.cancelledAt || row.seatStatus === "released") return "cancelled";
  return departureMoment(row) >= now ? "upcoming" : "past";
}

export async function listAccountBookings(input: {
  accountId: string;
  scope?: BookingScope;
  now?: Date;
}): Promise<AccountBooking[]> {
  const now = input.now ?? new Date();

  const rows = await db
    .select({
      booking: excursionBookingsTable,
      excursion: excursionsTable,
    })
    .from(customerAccountBookingsTable)
    .innerJoin(
      excursionBookingsTable,
      eq(excursionBookingsTable.id, customerAccountBookingsTable.bookingId),
    )
    .innerJoin(
      excursionsTable,
      eq(excursionsTable.id, excursionBookingsTable.excursionId),
    )
    .where(
      and(
        eq(customerAccountBookingsTable.accountId, input.accountId),
        isNull(customerAccountBookingsTable.revokedAt),
      ),
    )
    .orderBy(desc(excursionsTable.date));

  if (rows.length === 0) return [];

  // Le richieste di pagamento aperte in un solo giro: una query per
  // prenotazione esaurirebbe il pool (max: 3) su un elenco di pochi elementi.
  const bookingIds = rows.map((r) => r.booking.id);
  const openRequests = await db
    .select()
    .from(paymentRequestsTable)
    .where(
      and(
        inArray(paymentRequestsTable.bookingId, bookingIds),
        inArray(paymentRequestsTable.status, ["pending", "action_required"]),
      ),
    )
    .orderBy(asc(paymentRequestsTable.deadline));

  const requestByBooking = new Map<
    string,
    typeof paymentRequestsTable.$inferSelect
  >();
  for (const request of openRequests) {
    // La prima incontrata e la piu urgente: l'ordinamento e per scadenza.
    if (!requestByBooking.has(request.bookingId)) {
      requestByBooking.set(request.bookingId, request);
    }
  }

  const mapped = rows.map(({ booking, excursion }) => {
    const total = booking.totalAmountCents ?? 0;
    const residual = Math.max(total - booking.amountPaidCents, 0);
    const open = requestByBooking.get(booking.id);

    let pendingAction: PendingAction | null = null;
    if (booking.cancellationRequestStatus === "pending") {
      pendingAction = { kind: "cancellation_pending" };
    } else if (open && !booking.cancelledAt) {
      pendingAction = {
        kind: "payment_due",
        amountCents: open.amountCents,
        deadline: open.graceUntil ?? open.deadline,
      };
    }

    return {
      bookingId: booking.id,
      bookingCode: booking.bookingCode,
      excursionName: excursion.name,
      location: excursion.location,
      departureAt: excursion.departureAt,
      date: excursion.date,
      seats: booking.seats,
      totalAmountCents: total,
      amountPaidCents: booking.amountPaidCents,
      residualCents: residual,
      paymentStatus: booking.paymentStatus,
      seatStatus: booking.seatStatus,
      cancelledAt: booking.cancelledAt,
      cancellationRequestStatus: booking.cancellationRequestStatus,
      pendingAction,
      _scope: classifyBooking(
        {
          departureAt: excursion.departureAt,
          date: excursion.date,
          cancelledAt: booking.cancelledAt,
          seatStatus: booking.seatStatus,
        },
        now,
      ),
    };
  });

  const filtered = input.scope
    ? mapped.filter((b) => b._scope === input.scope)
    : mapped;

  // I viaggi in arrivo si leggono dal piu vicino; gli altri dal piu recente.
  const sorted = filtered.sort((a, b) => {
    const da = departureMoment(a).getTime();
    const dbb = departureMoment(b).getTime();
    return input.scope === "upcoming" ? da - dbb : dbb - da;
  });

  return sorted.map(({ _scope, ...rest }) => rest);
}
