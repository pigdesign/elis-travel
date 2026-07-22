export type BookingCancellationGuardSnapshot = {
  cancelledAt: Date | null;
  cancellationRequestStatus: string | null;
};

/**
 * Durante richiesta e decisione approvata non devono nascere nuovi incassi o
 * obblighi di saldo. Dopo `completed` la booking resta comunque bloccata da
 * cancelledAt; un caso `rejected` riabilita invece il flusso ordinario.
 */
export function isPaymentBlockedByCancellation(
  booking: BookingCancellationGuardSnapshot,
): boolean {
  return (
    Boolean(booking.cancelledAt) ||
    ["pending", "approved"].includes(
      booking.cancellationRequestStatus ?? "",
    )
  );
}
