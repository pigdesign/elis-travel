import assert from "node:assert/strict";
import test from "node:test";
import {
  automaticBalanceRemindersEnabled,
  runFinancialRecoveryPipeline,
} from "./booking-maintenance";

test("riconcilia cancellazioni dopo refund e cleanup nello stesso ciclo", async () => {
  const order: string[] = [];
  const outcome = await runFinancialRecoveryPipeline({
    processRefunds: async () => {
      order.push("refunds");
      return { leased: 2 };
    },
    processCleanup: async () => {
      order.push("cleanup");
      return { leased: 1 };
    },
    reconcileCancellations: async () => {
      order.push("cancellations");
      return { checked: 3, completed: 1 };
    },
  });

  assert.deepEqual(order, ["refunds", "cleanup", "cancellations"]);
  assert.deepEqual(outcome, {
    refunds: { leased: 2 },
    stripeCleanup: { leased: 1 },
    cancellations: { checked: 3, completed: 1 },
  });
});

test("i reminder automatici sono fail-closed e richiedono true esplicito", () => {
  assert.equal(automaticBalanceRemindersEnabled(undefined), false);
  assert.equal(automaticBalanceRemindersEnabled("false"), false);
  assert.equal(automaticBalanceRemindersEnabled("TRUE"), false);
  assert.equal(automaticBalanceRemindersEnabled("true"), true);
});
