export type OutboxBookingState = {
  id: string;
  seatStatus: string;
  paymentStatus: string;
  paymentMethod: string | null;
  paymentType: string | null;
  totalAmountCents: number | null;
  amountPaidCents: number;
  cancelledAt: Date | null;
  cancellationRequestStatus: string | null;
  customerNotificationsEnabled?: boolean;
};

export type OutboxPaymentRequestState = {
  id: string;
  bookingId: string;
  type: string;
  status: string;
  method: string | null;
  deadline: Date | null;
  graceUntil: Date | null;
  paidAt?: Date | null;
  transactionReference?: string | null;
};

export type OutboxCancellationCaseState = {
  id: string;
  bookingId: string;
  source: string;
  status: string;
};

export type OutboxApplicabilityInput = {
  eventType: string;
  dedupeKey: string;
  booking: OutboxBookingState | null;
  paymentRequest?: OutboxPaymentRequestState | null;
  cancellationCase?: OutboxCancellationCaseState | null;
  excursionStatus?: string | null;
  now?: Date;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function paymentRequestIdFromOutboxKey(
  dedupeKey: string,
): string | null {
  const match = /^payment-request:([^:]+):/.exec(dedupeKey);
  const candidate = match?.[1] ?? "";
  return UUID_PATTERN.test(candidate) ? candidate : null;
}

export function cancellationCaseIdFromOutboxKey(
  dedupeKey: string,
): string | null {
  const match = /^cancellation-case:([^:]+):/.exec(dedupeKey);
  const candidate = match?.[1] ?? "";
  return UUID_PATTERN.test(candidate) ? candidate : null;
}

export function deadlineSnapshotFromOutboxKey(dedupeKey: string): {
  deadline: Date;
  graceUntil: Date;
} | null {
  const match =
    /^payment-request:[^:]+:deadline-extended:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z):(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z):v2$/.exec(
      dedupeKey,
    );
  if (!match?.[1] || !match[2]) return null;
  const deadline = new Date(match[1]);
  const graceUntil = new Date(match[2]);
  return Number.isFinite(deadline.getTime()) &&
    Number.isFinite(graceUntil.getTime())
    ? { deadline, graceUntil }
    : null;
}

export function outboxEventTargetsCustomer(eventType: string): boolean {
  return (
    eventType.endsWith(".customer") ||
    eventType === "booking.instructions.customer" ||
    eventType === "booking.card-saved.customer" ||
    eventType.startsWith("booking.balance-reminder.")
  );
}

function isActiveBooking(booking: OutboxBookingState): boolean {
  return (
    (booking.seatStatus === "held" || booking.seatStatus === "confirmed") &&
    !booking.cancelledAt &&
    !["pending", "approved"].includes(booking.cancellationRequestStatus ?? "")
  );
}

function hasResidual(booking: OutboxBookingState): boolean {
  return (booking.totalAmountCents ?? 0) > booking.amountPaidCents;
}

function requestBelongsToBooking(
  request: OutboxPaymentRequestState | null | undefined,
  booking: OutboxBookingState,
): request is OutboxPaymentRequestState {
  return Boolean(request && request.bookingId === booking.id);
}

function paymentWindowIsOpen(
  request: OutboxPaymentRequestState,
  now: Date,
): boolean {
  const effectiveExpiry = request.graceUntil ?? request.deadline;
  return Boolean(effectiveExpiry && now <= effectiveExpiry);
}

function methodIsCoherent(
  booking: OutboxBookingState,
  request: OutboxPaymentRequestState,
): boolean {
  return booking.paymentMethod === request.method;
}

function factualPaymentWasReceived(
  request: OutboxPaymentRequestState,
): boolean {
  return (
    request.status === "paid" ||
    Boolean(
      request.paidAt &&
      request.transactionReference &&
      ["refunded", "partially_refunded"].includes(request.status),
    )
  );
}

/**
 * Restituisce il motivo per cui uno snapshot email non e piu applicabile.
 * `null` significa che puo essere consegnato. Le ricevute di un incasso sono
 * eventi fattuali: non dipendono dallo stato corrente dei posti o dal residuo.
 */
export function outboxSuppressionReason(
  input: OutboxApplicabilityInput,
): string | null {
  const { eventType, dedupeKey, booking } = input;
  const now = input.now ?? new Date();
  if (!booking) return "booking_missing";

  if (
    outboxEventTargetsCustomer(eventType) &&
    booking.customerNotificationsEnabled === false
  ) {
    return "customer_notifications_disabled";
  }

  const keyedRequestId = paymentRequestIdFromOutboxKey(dedupeKey);
  if (eventType.startsWith("booking.payment-received.")) {
    if (!keyedRequestId) {
      // Compatibilita con le ricevute gratuite/legacy, la cui vecchia chiave
      // era legata alla booking anziche alla singola payment_request.
      return (booking.totalAmountCents ?? 0) === 0 ||
        booking.amountPaidCents > 0
        ? null
        : "payment_not_evidenced";
    }
    if (
      !requestBelongsToBooking(input.paymentRequest, booking) ||
      input.paymentRequest.id !== keyedRequestId
    ) {
      return "payment_request_missing_or_mismatched";
    }
    if (!factualPaymentWasReceived(input.paymentRequest)) {
      return "payment_not_received";
    }
    if (
      eventType === "booking.payment-received.admin" &&
      input.paymentRequest.method !== "card"
    ) {
      return "admin_card_receipt_method_mismatch";
    }
    return null;
  }

  if (eventType === "booking.instructions.customer") {
    if (!isActiveBooking(booking)) return "booking_inactive";
    if (!hasResidual(booking)) return "booking_settled";
    if (
      !["deposit_requested", "full_requested"].includes(booking.paymentStatus)
    ) {
      return "instructions_state_stale";
    }
    if (
      !requestBelongsToBooking(input.paymentRequest, booking) ||
      input.paymentRequest.type !== booking.paymentType ||
      input.paymentRequest.status !== "pending"
    ) {
      return "instructions_request_stale";
    }
    if (
      !["bank_transfer", "office"].includes(
        input.paymentRequest.method ?? "",
      ) ||
      !methodIsCoherent(booking, input.paymentRequest)
    ) {
      return "instructions_method_mismatch";
    }
    return paymentWindowIsOpen(input.paymentRequest, now)
      ? null
      : "payment_window_expired";
  }

  if (eventType === "booking.card-saved.customer") {
    if (!isActiveBooking(booking)) return "booking_inactive";
    if (!hasResidual(booking)) return "booking_settled";
    if (
      booking.paymentStatus !== "card_saved" ||
      booking.paymentMethod !== "card"
    ) {
      return "saved_card_state_stale";
    }
    if (
      !requestBelongsToBooking(input.paymentRequest, booking) ||
      input.paymentRequest.type !== "deposit" ||
      input.paymentRequest.status !== "scheduled" ||
      input.paymentRequest.method !== "card"
    ) {
      return "saved_card_request_stale";
    }
    return null;
  }

  if (eventType === "booking.excursion-confirmed.customer") {
    if (!isActiveBooking(booking)) return "booking_inactive";
    return input.excursionStatus === "confirmed"
      ? null
      : "excursion_not_confirmed";
  }

  const isBalanceRequest = eventType === "booking.balance-requested.customer";
  const isActionRequired =
    eventType === "booking.payment-action-required.customer" ||
    eventType === "booking.payment-action-required.admin";
  const isReminder = eventType.startsWith("booking.balance-reminder.");
  const isDeadlineExtended =
    eventType === "booking.payment-deadline-extended.customer";
  if (
    isBalanceRequest ||
    isActionRequired ||
    isReminder ||
    isDeadlineExtended
  ) {
    if (!isActiveBooking(booking)) return "booking_inactive";
    if (!hasResidual(booking)) return "booking_settled";
    if (!requestBelongsToBooking(input.paymentRequest, booking)) {
      return "payment_request_missing_or_mismatched";
    }
    if (keyedRequestId && input.paymentRequest.id !== keyedRequestId) {
      return "payment_request_key_mismatch";
    }
    if (isBalanceRequest) {
      if (
        input.paymentRequest.type !== "balance" ||
        input.paymentRequest.status !== "pending"
      ) {
        return "balance_request_stale";
      }
    } else if (isActionRequired) {
      if (input.paymentRequest.status !== "action_required") {
        return "action_required_state_stale";
      }
    } else if (isDeadlineExtended) {
      if (
        !["pending", "action_required"].includes(input.paymentRequest.status)
      ) {
        return "deadline_extension_request_stale";
      }
      const snapshot = deadlineSnapshotFromOutboxKey(dedupeKey);
      if (
        !snapshot ||
        input.paymentRequest.deadline?.getTime() !==
          snapshot.deadline.getTime() ||
        input.paymentRequest.graceUntil?.getTime() !==
          snapshot.graceUntil.getTime()
      ) {
        return "deadline_extension_superseded";
      }
    } else if (
      input.paymentRequest.type !== "balance" ||
      !["pending", "action_required"].includes(input.paymentRequest.status)
    ) {
      return "reminder_request_stale";
    }
    if (!methodIsCoherent(booking, input.paymentRequest)) {
      return "payment_method_mismatch";
    }
    if (!paymentWindowIsOpen(input.paymentRequest, now)) {
      return "payment_window_expired";
    }

    if (isReminder) {
      const deadline = input.paymentRequest.deadline;
      if (!deadline) return "deadline_missing";
      if (eventType.endsWith(".before_due") && now >= deadline) {
        return "before_due_phase_stale";
      }
      if (eventType.endsWith(".due") && now < deadline) {
        return "due_phase_not_reached";
      }
      if (
        eventType.endsWith(".grace_ending") &&
        (!input.paymentRequest.graceUntil ||
          input.paymentRequest.graceUntil <= deadline)
      ) {
        return "grace_phase_unavailable";
      }
    }
    return null;
  }

  if (
    eventType.startsWith("booking.cancellation-requested.") ||
    eventType.startsWith("booking.cancellation.")
  ) {
    const keyedCaseId = cancellationCaseIdFromOutboxKey(dedupeKey);
    const cancellationCase = input.cancellationCase;
    if (
      keyedCaseId &&
      (!cancellationCase ||
        cancellationCase.id !== keyedCaseId ||
        cancellationCase.bookingId !== booking.id)
    ) {
      return "cancellation_case_missing_or_mismatched";
    }
    if (!cancellationCase) {
      // Compatibilita con vecchie chiavi booking-scoped gia in outbox.
      return keyedCaseId ? "cancellation_case_missing" : null;
    }
    if (
      eventType.startsWith("booking.cancellation-requested.") &&
      cancellationCase.status !== "pending"
    ) {
      return "cancellation_request_stale";
    }
    if (
      eventType === "booking.cancellation.rejected.customer" &&
      cancellationCase.status !== "rejected"
    ) {
      return "cancellation_rejection_mismatch";
    }
    if (
      eventType === "booking.cancellation.completed.customer" &&
      cancellationCase.status !== "completed"
    ) {
      return "cancellation_completion_mismatch";
    }
    if (
      (eventType === "booking.cancellation.approved.customer" ||
        eventType === "booking.cancellation.excursion_cancelled.customer") &&
      !["approved", "refunding", "manual_required", "completed"].includes(
        cancellationCase.status,
      )
    ) {
      return "cancellation_approval_mismatch";
    }
  }

  return null;
}
