import { db } from "@workspace/db";
import {
  excursionBookingsTable,
  excursionsTable,
  paymentRefundsTable,
  paymentRequestsTable,
} from "@workspace/db/schema";
import { and, desc, eq, ne } from "drizzle-orm";
import {
  computeBalanceDueAt,
  computeGraceUntil,
  isDepartureOpenForBooking,
} from "./excursion-time";
import { getPaymentSettings } from "./excursion-pricing";
import { dispatchBalanceRequestEmailV2 } from "./excursion-booking-emails-v2";
import { isPaymentBlockedByCancellation } from "./booking-cancellation-guard";

export type EnsureBalanceOutcome =
  | { kind: "created"; requestId: string; deadline: Date; graceUntil: Date }
  | { kind: "exists"; requestId: string; status: string }
  | { kind: "no_residual" }
  | { kind: "deposit_not_paid" }
  | { kind: "trip_not_confirmed" }
  | { kind: "missing_departure" }
  | { kind: "trip_departed" }
  | { kind: "cancellation_in_progress" }
  | { kind: "booking_not_found" };

export type BalanceRequestDepartureState =
  | "open"
  | "missing_departure"
  | "trip_departed";

export function balanceRequestDepartureState(
  departureAt: Date | null,
  now: Date,
): BalanceRequestDepartureState {
  if (!departureAt) return "missing_departure";
  return isDepartureOpenForBooking(departureAt, now) ? "open" : "trip_departed";
}

export function canCreateBalanceRequestAfterLatest(input: {
  latestRequestStatus: string | null;
  hasUnresolvedRefund: boolean;
}): boolean {
  if (input.latestRequestStatus === null) return true;
  return input.latestRequestStatus === "refunded" && !input.hasUnresolvedRefund;
}

/**
 * Crea una sola obbligazione di saldo per booking. Il lock sulla booking rende
 * atomico il pattern SELECT/INSERT anche senza imporre un vincolo distruttivo
 * sullo storico payment_requests.
 */
export async function ensureBalanceRequest(
  bookingId: string,
  opts?: { now?: Date; notify?: boolean; allowBeforeConfirmation?: boolean },
): Promise<EnsureBalanceOutcome> {
  const requestedNow = opts?.now;
  const settings = await getPaymentSettings();

  const outcome = await db.transaction(
    async (tx): Promise<EnsureBalanceOutcome> => {
      const [booking] = await tx
        .select()
        .from(excursionBookingsTable)
        .where(eq(excursionBookingsTable.id, bookingId))
        .for("update")
        .limit(1);
      if (!booking || booking.cancelledAt) return { kind: "booking_not_found" };
      if (isPaymentBlockedByCancellation(booking)) {
        return { kind: "cancellation_in_progress" };
      }

      const [excursion] = await tx
        .select()
        .from(excursionsTable)
        .where(eq(excursionsTable.id, booking.excursionId))
        .for("update")
        .limit(1);
      if (!excursion) return { kind: "booking_not_found" };
      if (excursion.status !== "confirmed" && !opts?.allowBeforeConfirmation) {
        return { kind: "trip_not_confirmed" };
      }
      // In produzione l'istante viene acquisito soltanto dopo i lock, evitando
      // che un'attesa concorrente renda valida una partenza ormai trascorsa.
      const now = requestedNow ?? new Date();
      const departureState = balanceRequestDepartureState(
        excursion.departureAt,
        now,
      );
      if (departureState !== "open") return { kind: departureState };

      const residual =
        (booking.totalAmountCents ?? 0) - booking.amountPaidCents;
      if (residual <= 0) return { kind: "no_residual" };
      if (booking.amountPaidCents <= 0) return { kind: "deposit_not_paid" };

      const [existing] = await tx
        .select({
          id: paymentRequestsTable.id,
          status: paymentRequestsTable.status,
        })
        .from(paymentRequestsTable)
        .where(
          and(
            eq(paymentRequestsTable.bookingId, booking.id),
            eq(paymentRequestsTable.type, "balance"),
          ),
        )
        .orderBy(desc(paymentRequestsTable.createdAt))
        .limit(1);
      const [unresolvedRefund] =
        existing?.status === "refunded"
          ? await tx
              .select({ id: paymentRefundsTable.id })
              .from(paymentRefundsTable)
              .where(
                and(
                  eq(paymentRefundsTable.paymentRequestId, existing.id),
                  ne(paymentRefundsTable.status, "succeeded"),
                ),
              )
              .limit(1)
          : [];
      if (
        existing &&
        !canCreateBalanceRequestAfterLatest({
          latestRequestStatus: existing.status,
          hasUnresolvedRefund: Boolean(unresolvedRefund),
        })
      )
        return {
          kind: "exists",
          requestId: existing.id,
          status: existing.status,
        };

      const dueAt = computeBalanceDueAt(
        excursion.departureAt,
        excursion.balanceHoursOverride ?? settings.balanceHours,
      );
      // `departureAt` e gia stato validato come futuro sopra; il fallback resta
      // difensivo nel caso in cui la funzione di calcolo cambi contratto.
      if (!dueAt) return { kind: "missing_departure" };

      // Se la gita viene confermata oltre T-48, il saldo diventa immediatamente
      // dovuto ma resta pagabile nel periodo di tolleranza configurato.
      const deadline = dueAt > now ? dueAt : now;
      const graceUntil = computeGraceUntil({
        deadline,
        graceMinutes: settings.paymentGraceMinutes,
        departureAt: excursion.departureAt,
      });
      const [request] = await tx
        .insert(paymentRequestsTable)
        .values({
          bookingId: booking.id,
          type: "balance",
          amountCents: residual,
          status: "pending",
          method: null,
          deadline,
          graceUntil,
        })
        .returning({ id: paymentRequestsTable.id });

      await tx
        .update(excursionBookingsTable)
        .set({
          paymentStatus: "balance_requested",
          paymentType: "balance",
          paymentMethod: null,
          amountDueCents: residual,
          paymentDeadline: deadline,
          updatedAt: now,
        })
        .where(eq(excursionBookingsTable.id, booking.id));

      return { kind: "created", requestId: request.id, deadline, graceUntil };
    },
  );

  const shouldRecoverNotification =
    outcome.kind === "exists" &&
    ["pending", "scheduled", "action_required"].includes(outcome.status);
  if (
    (outcome.kind === "created" || shouldRecoverNotification) &&
    opts?.notify !== false
  ) {
    await dispatchBalanceRequestEmailV2(bookingId, outcome.requestId);
  }
  return outcome;
}
