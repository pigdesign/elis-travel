import assert from "node:assert/strict";
import test from "node:test";
import { isPaymentBlockedByCancellation } from "./booking-cancellation-guard";

test("blocca pagamenti durante annullamento pending o approved", () => {
  for (const status of ["pending", "approved"]) {
    assert.equal(
      isPaymentBlockedByCancellation({
        cancelledAt: null,
        cancellationRequestStatus: status,
      }),
      true,
    );
  }
});

test("un caso rejected non blocca, una booking cancellata resta bloccata", () => {
  assert.equal(
    isPaymentBlockedByCancellation({
      cancelledAt: null,
      cancellationRequestStatus: "rejected",
    }),
    false,
  );
  assert.equal(
    isPaymentBlockedByCancellation({
      cancelledAt: new Date("2026-07-22T10:00:00Z"),
      cancellationRequestStatus: "completed",
    }),
    true,
  );
});
