import assert from "node:assert/strict";
import test from "node:test";
import { shouldReviveCancelledPaymentEmail } from "./email-outbox";

test("una email saldo cancellata viene riattivata solo dopo la fine del freeze", () => {
  assert.equal(
    shouldReviveCancelledPaymentEmail({
      entryStatus: "cancelled",
      paymentBlocked: false,
      settled: false,
    }),
    true,
  );
  assert.equal(
    shouldReviveCancelledPaymentEmail({
      entryStatus: "cancelled",
      paymentBlocked: true,
      settled: false,
    }),
    false,
  );
  assert.equal(
    shouldReviveCancelledPaymentEmail({
      entryStatus: "cancelled",
      paymentBlocked: false,
      settled: true,
    }),
    false,
  );
});
