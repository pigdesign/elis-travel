import assert from "node:assert/strict";
import test from "node:test";
import { cancellationEmailPhaseForReconciliation } from "./email-outbox-reconciliation";

test("la riconciliazione cancellation ricostruisce soltanto la fase corrente inferibile", () => {
  assert.equal(
    cancellationEmailPhaseForReconciliation({
      source: "customer",
      status: "pending",
    }),
    "requested",
  );
  assert.equal(
    cancellationEmailPhaseForReconciliation({
      source: "admin",
      status: "pending",
    }),
    null,
  );
  assert.equal(
    cancellationEmailPhaseForReconciliation({
      source: "customer",
      status: "rejected",
    }),
    "rejected",
  );
  assert.equal(
    cancellationEmailPhaseForReconciliation({
      source: "excursion",
      status: "refunding",
    }),
    "excursion_cancelled",
  );
  assert.equal(
    cancellationEmailPhaseForReconciliation({
      source: "customer",
      status: "manual_required",
    }),
    "approved",
  );
  assert.equal(
    cancellationEmailPhaseForReconciliation({
      source: "excursion",
      status: "completed",
    }),
    "completed",
  );
  assert.equal(
    cancellationEmailPhaseForReconciliation({
      source: "customer",
      status: "superseded",
    }),
    null,
  );
});
