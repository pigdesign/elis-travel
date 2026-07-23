import assert from "node:assert/strict";
import test from "node:test";
import {
  BOOKING_FLOW_EXPECTED_COLUMNS,
  BOOKING_FLOW_EXPECTED_TABLE_NAMES,
  BOOKING_FLOW_EXPECTED_UNIQUE_TARGETS,
  inspectBookingFlowSchema,
  type BookingFlowSchemaCatalog,
} from "./booking-flow-schema-contract";

function completeCatalog(): BookingFlowSchemaCatalog {
  return {
    relations: BOOKING_FLOW_EXPECTED_TABLE_NAMES.map((tableName) => ({
      tableName,
      kind: "r",
    })),
    columns: BOOKING_FLOW_EXPECTED_COLUMNS.map((column) => ({
      tableName: column.tableName,
      columnName: column.columnName,
      udtName: column.udtName,
      nullable: column.nullable,
    })),
    indexes: BOOKING_FLOW_EXPECTED_UNIQUE_TARGETS.map((target) => ({
      tableName: target.tableName,
      indexName: target.label,
      unique: true,
      valid: true,
      ready: true,
      plain: true,
      unconditional: true,
      columns: [...target.columns],
    })),
  };
}

test("accepts the complete booking-flow schema contract", () => {
  const result = inspectBookingFlowSchema(completeCatalog());
  assert.deepEqual(result.schemaIssues, []);
  assert.deepEqual(result.prerequisiteSchemaIssues, []);
  assert.deepEqual(result.foundationSchemaIssues, []);
});

test("reports payment_refund_attempts as a foundation issue", () => {
  const catalog = completeCatalog();
  catalog.relations = catalog.relations.filter(
    (relation) => relation.tableName !== "payment_refund_attempts",
  );
  catalog.columns = catalog.columns.filter(
    (column) => column.tableName !== "payment_refund_attempts",
  );
  catalog.indexes = catalog.indexes.filter(
    (index) => index.tableName !== "payment_refund_attempts",
  );

  const result = inspectBookingFlowSchema(catalog);
  assert.equal(result.prerequisiteSchemaIssues.length, 0);
  assert.ok(
    result.foundationSchemaIssues.some((issue) =>
      issue.includes("tabella payment_refund_attempts assente"),
    ),
  );
});

test("keeps a complete Gite v2 schema eligible for applying missing foundations", () => {
  const catalog = completeCatalog();
  const prerequisiteColumns = BOOKING_FLOW_EXPECTED_COLUMNS.filter(
    (column) => column.scope === "prerequisite",
  );
  const prerequisiteColumnNames = new Set(
    prerequisiteColumns.map(
      (column) => `${column.tableName}.${column.columnName}`,
    ),
  );
  const prerequisiteTables = new Set(
    prerequisiteColumns.map((column) => column.tableName),
  );
  catalog.relations = catalog.relations.filter((relation) =>
    prerequisiteTables.has(relation.tableName),
  );
  catalog.columns = catalog.columns.filter((column) =>
    prerequisiteColumnNames.has(`${column.tableName}.${column.columnName}`),
  );
  catalog.indexes = catalog.indexes.filter((index) =>
    BOOKING_FLOW_EXPECTED_UNIQUE_TARGETS.some(
      (target) =>
        target.scope === "prerequisite" && target.label === index.indexName,
    ),
  );

  const result = inspectBookingFlowSchema(catalog);
  assert.deepEqual(result.prerequisiteSchemaIssues, []);
  assert.ok(result.foundationSchemaIssues.length > 0);
  assert.ok(result.schemaIssues.length > 0);
});

test("reports wrong PostgreSQL type and nullability", () => {
  const catalog = completeCatalog();
  const departure = catalog.columns.find(
    (column) =>
      column.tableName === "excursions" && column.columnName === "departure_at",
  );
  const notifications = catalog.columns.find(
    (column) =>
      column.tableName === "excursion_bookings" &&
      column.columnName === "customer_notifications_enabled",
  );
  assert.ok(departure);
  assert.ok(notifications);
  departure.udtName = "timestamp";
  notifications.nullable = true;

  const result = inspectBookingFlowSchema(catalog);
  assert.ok(
    result.foundationSchemaIssues.some((issue) =>
      issue.includes("excursions.departure_at di tipo timestamp"),
    ),
  );
  assert.ok(
    result.foundationSchemaIssues.some((issue) =>
      issue.includes("customer_notifications_enabled ammette NULL"),
    ),
  );
});

test("rejects an invalid or wrongly shaped named unique index", () => {
  const catalog = completeCatalog();
  const index = catalog.indexes.find(
    (candidate) =>
      candidate.indexName === "payment_attempts_idempotency_key_uq",
  );
  assert.ok(index);
  index.valid = false;
  index.columns = ["status"];

  const result = inspectBookingFlowSchema(catalog);
  assert.ok(
    result.foundationSchemaIssues.some(
      (issue) =>
        issue.includes("payment_attempts(idempotency_key)") &&
        issue.includes("payment_attempts_idempotency_key_uq") &&
        issue.includes("valid=false"),
    ),
  );
});

test("accepts an equivalent valid unique target independently of its name and order", () => {
  const catalog = completeCatalog();
  const index = catalog.indexes.find(
    (candidate) =>
      candidate.indexName === "stripe_cleanup_jobs_operation_resource_uq",
  );
  assert.ok(index);
  index.indexName = "equivalent_cleanup_unique";
  index.columns.reverse();

  const result = inspectBookingFlowSchema(catalog);
  assert.equal(
    result.foundationSchemaIssues.some((issue) =>
      issue.includes("stripe_cleanup_jobs_operation_resource_uq"),
    ),
    false,
  );
});
