export type BookingFlowSchemaScope = "prerequisite" | "foundation";

export type BookingFlowCatalogRelation = {
  tableName: string;
  kind: string;
};

export type BookingFlowCatalogColumn = {
  tableName: string;
  columnName: string;
  udtName: string;
  nullable: boolean;
};

export type BookingFlowCatalogIndex = {
  tableName: string;
  indexName: string;
  unique: boolean;
  valid: boolean;
  ready: boolean;
  plain: boolean;
  unconditional: boolean;
  columns: string[];
};

export type BookingFlowSchemaCatalog = {
  relations: BookingFlowCatalogRelation[];
  columns: BookingFlowCatalogColumn[];
  indexes: BookingFlowCatalogIndex[];
};

type ExpectedColumn = {
  scope: BookingFlowSchemaScope;
  tableName: string;
  columnName: string;
  udtName: string;
  nullable: boolean;
};

type ExpectedUniqueTarget = {
  scope: BookingFlowSchemaScope;
  label: string;
  tableName: string;
  columns: string[];
};

function expectedColumns(
  scope: BookingFlowSchemaScope,
  tableName: string,
  definitions: Array<
    readonly [columnName: string, udtName: string, nullable: boolean]
  >,
): ExpectedColumn[] {
  return definitions.map(([columnName, udtName, nullable]) => ({
    scope,
    tableName,
    columnName,
    udtName,
    nullable,
  }));
}

/**
 * Contratto minimo richiesto dal backend corrente. Il prerequisito corrisponde
 * alle aggiunte della migrazione Gite v2; le fondazioni sono gli oggetti della
 * migrazione booking-flow. Le colonne delle tabelle nuove sono elencate per
 * intero perché le select Drizzle senza proiezione le richiedono tutte.
 */
export const BOOKING_FLOW_EXPECTED_COLUMNS: ExpectedColumn[] = [
  ...expectedColumns("prerequisite", "age_ranges", [
    ["id", "uuid", false],
    ["label", "text", false],
    ["min_age", "int4", false],
    ["max_age", "int4", false],
    ["active", "bool", false],
    ["sort_order", "int4", false],
    ["created_at", "timestamp", false],
    ["updated_at", "timestamp", false],
  ]),
  ...expectedColumns("prerequisite", "excursion_age_prices", [
    ["id", "uuid", false],
    ["excursion_id", "uuid", false],
    ["age_range_id", "uuid", false],
    ["price", "numeric", false],
    ["created_at", "timestamp", false],
    ["updated_at", "timestamp", false],
  ]),
  ...expectedColumns("prerequisite", "booking_participants", [
    ["id", "uuid", false],
    ["booking_id", "uuid", false],
    ["participant_type", "text", false],
    ["age_range_id", "uuid", true],
    ["age_range_label", "text", true],
    ["pickup_point_id", "uuid", true],
    ["pickup_point_name", "text", true],
    ["base_price_cents", "int4", false],
    ["pickup_surcharge_cents", "int4", false],
    ["final_price_cents", "int4", false],
    ["first_name", "text", true],
    ["last_name", "text", true],
    ["personal_data", "jsonb", true],
    ["notes", "text", true],
    ["data_completed", "bool", false],
    ["sort_order", "int4", false],
    ["created_at", "timestamp", false],
    ["updated_at", "timestamp", false],
  ]),
  ...expectedColumns("prerequisite", "booking_consents", [
    ["id", "uuid", false],
    ["booking_id", "uuid", false],
    ["consent_type", "text", false],
    ["accepted", "bool", false],
    ["policy_version", "text", true],
    ["accepted_at", "timestamp", false],
  ]),
  ...expectedColumns("prerequisite", "payment_requests", [
    ["id", "uuid", false],
    ["booking_id", "uuid", false],
    ["type", "text", false],
    ["amount_cents", "int4", false],
    ["status", "text", false],
    ["method", "text", true],
    ["deadline", "timestamp", true],
    ["paid_at", "timestamp", true],
    ["transaction_reference", "text", true],
    ["stripe_payment_intent_id", "text", true],
    ["notes", "text", true],
    ["created_at", "timestamp", false],
    ["updated_at", "timestamp", false],
  ]),
  ...expectedColumns("prerequisite", "excursions", [
    ["patient_price", "numeric", true],
    ["companion_price", "numeric", true],
    ["return_date", "date", true],
    ["booking_close_date", "date", true],
    ["deposit_enabled", "bool", false],
    ["deposit_type", "text", false],
    ["deposit_value", "numeric", true],
    ["deposit_available_after_confirm", "bool", false],
    ["deposit_deadline_date", "date", true],
    ["balance_deadline_date", "date", true],
    ["balance_hours_override", "int4", true],
    ["pay_card_enabled", "bool", false],
    ["pay_bank_transfer_enabled", "bool", false],
    ["pay_office_enabled", "bool", false],
    ["pay_on_bus_enabled", "bool", false],
    ["bank_transfer_hours_override", "int4", true],
    ["office_hours_override", "int4", true],
    ["full_payment_only_days_before", "int4", true],
    ["confirmed_at", "timestamp", true],
    ["waitlist_enabled", "bool", false],
  ]),
  ...expectedColumns("prerequisite", "excursion_bookings", [
    ["booking_code", "text", true],
    ["payment_type", "text", true],
    ["payment_method", "text", true],
    ["total_amount_cents", "int4", true],
    ["amount_paid_cents", "int4", false],
    ["payment_deadline", "timestamp", true],
  ]),
  ...expectedColumns("prerequisite", "excursion_pickup_points", [
    ["surcharge", "numeric", true],
  ]),
  ...expectedColumns("prerequisite", "pickup_locations", [
    ["active", "bool", false],
    ["maps_url", "text", true],
    ["notes", "text", true],
  ]),

  ...expectedColumns("foundation", "excursions", [
    ["departure_at", "timestamptz", true],
  ]),
  ...expectedColumns("foundation", "excursion_bookings", [
    ["home_pickup_address", "text", true],
    ["workflow_version", "int4", false],
    ["booking_attempt_id", "text", true],
    ["customer_notifications_enabled", "bool", false],
    ["seat_status", "text", false],
    ["seat_hold_expires_at", "timestamptz", true],
    ["seat_released_at", "timestamptz", true],
    ["seat_release_reason", "text", true],
    ["cancellation_requested_at", "timestamptz", true],
    ["cancellation_request_status", "text", true],
    ["cancellation_request_reason", "text", true],
    ["cancellation_decision_at", "timestamptz", true],
    ["cancellation_completed_at", "timestamptz", true],
    ["cancellation_resolution_note", "text", true],
    ["cancellation_refund_amount_cents", "int4", true],
    ["cancellation_penalty_amount_cents", "int4", true],
    ["access_token_hash", "text", true],
    ["access_token_expires_at", "timestamptz", true],
  ]),
  ...expectedColumns("foundation", "payment_requests", [
    ["grace_until", "timestamptz", true],
    ["stripe_checkout_session_id", "text", true],
  ]),
  ...expectedColumns("foundation", "payment_attempts", [
    ["id", "uuid", false],
    ["payment_request_id", "uuid", false],
    ["provider", "text", false],
    ["status", "text", false],
    ["amount_cents", "int4", false],
    ["idempotency_key", "text", false],
    ["stripe_payment_intent_id", "text", true],
    ["last_error_code", "text", true],
    ["last_error_message", "text", true],
    ["completed_at", "timestamptz", true],
    ["created_at", "timestamptz", false],
    ["updated_at", "timestamptz", false],
  ]),
  ...expectedColumns("foundation", "booking_cancellation_cases", [
    ["id", "uuid", false],
    ["booking_id", "uuid", false],
    ["excursion_id", "uuid", true],
    ["source", "text", false],
    ["source_key", "text", false],
    ["status", "text", false],
    ["request_reason", "text", true],
    ["decision_reason", "text", true],
    ["opened_by_admin_user_id", "text", true],
    ["opened_by_admin_name", "text", true],
    ["decided_by_admin_user_id", "text", true],
    ["decided_by_admin_name", "text", true],
    ["refundable_at_decision_cents", "int4", true],
    ["approved_refund_cents", "int4", true],
    ["requested_at", "timestamptz", false],
    ["decided_at", "timestamptz", true],
    ["completed_at", "timestamptz", true],
    ["created_at", "timestamptz", false],
    ["updated_at", "timestamptz", false],
  ]),
  ...expectedColumns("foundation", "payment_refunds", [
    ["id", "uuid", false],
    ["booking_id", "uuid", false],
    ["payment_request_id", "uuid", true],
    ["payment_attempt_id", "uuid", true],
    ["cancellation_case_id", "uuid", true],
    ["amount_cents", "int4", false],
    ["reason", "text", false],
    ["status", "text", false],
    ["provider", "text", false],
    ["stripe_payment_intent_id", "text", true],
    ["stripe_refund_id", "text", true],
    ["provider_reference", "text", true],
    ["idempotency_key", "text", false],
    ["last_error_code", "text", true],
    ["last_error_message", "text", true],
    ["attempt_count", "int4", false],
    ["max_attempts", "int4", false],
    ["next_attempt_at", "timestamptz", false],
    ["last_attempt_at", "timestamptz", true],
    ["lease_owner", "text", true],
    ["lease_expires_at", "timestamptz", true],
    ["completed_at", "timestamptz", true],
    ["created_at", "timestamptz", false],
    ["updated_at", "timestamptz", false],
  ]),
  ...expectedColumns("foundation", "payment_refund_attempts", [
    ["id", "uuid", false],
    ["payment_refund_id", "uuid", false],
    ["attempt_number", "int4", false],
    ["idempotency_key", "text", false],
    ["status", "text", false],
    ["stripe_refund_id", "text", true],
    ["last_error_code", "text", true],
    ["last_error_message", "text", true],
    ["completed_at", "timestamptz", true],
    ["created_at", "timestamptz", false],
    ["updated_at", "timestamptz", false],
  ]),
  ...expectedColumns("foundation", "stripe_cleanup_jobs", [
    ["id", "uuid", false],
    ["booking_id", "uuid", true],
    ["operation", "text", false],
    ["stripe_resource_id", "text", false],
    ["status", "text", false],
    ["attempt_count", "int4", false],
    ["max_attempts", "int4", false],
    ["next_attempt_at", "timestamptz", false],
    ["last_attempt_at", "timestamptz", true],
    ["lease_owner", "text", true],
    ["lease_expires_at", "timestamptz", true],
    ["last_error_code", "text", true],
    ["last_error_message", "text", true],
    ["manual_completion_reference", "text", true],
    ["completed_at", "timestamptz", true],
    ["created_at", "timestamptz", false],
    ["updated_at", "timestamptz", false],
  ]),
  ...expectedColumns("foundation", "email_outbox", [
    ["id", "uuid", false],
    ["booking_id", "uuid", true],
    ["event_type", "text", false],
    ["dedupe_key", "text", false],
    ["payload", "jsonb", false],
    ["status", "text", false],
    ["attempt_count", "int4", false],
    ["max_attempts", "int4", false],
    ["next_attempt_at", "timestamptz", false],
    ["last_attempt_at", "timestamptz", true],
    ["lease_owner", "text", true],
    ["lease_expires_at", "timestamptz", true],
    ["sent_at", "timestamptz", true],
    ["last_error", "text", true],
    ["provider_message_id", "text", true],
    ["created_at", "timestamptz", false],
    ["updated_at", "timestamptz", false],
  ]),
];

export const BOOKING_FLOW_EXPECTED_UNIQUE_TARGETS: ExpectedUniqueTarget[] = [
  {
    scope: "prerequisite",
    label: "excursion_age_prices_excursion_range_uq",
    tableName: "excursion_age_prices",
    columns: ["excursion_id", "age_range_id"],
  },
  {
    scope: "prerequisite",
    label: "booking_consents_booking_type_uq",
    tableName: "booking_consents",
    columns: ["booking_id", "consent_type"],
  },
  {
    scope: "foundation",
    label: "excursion_bookings_booking_code_uq",
    tableName: "excursion_bookings",
    columns: ["booking_code"],
  },
  {
    scope: "foundation",
    label: "excursion_bookings_booking_attempt_id_uq",
    tableName: "excursion_bookings",
    columns: ["booking_attempt_id"],
  },
  {
    scope: "foundation",
    label: "excursion_bookings_access_token_hash_uq",
    tableName: "excursion_bookings",
    columns: ["access_token_hash"],
  },
  {
    scope: "foundation",
    label: "payment_attempts_idempotency_key_uq",
    tableName: "payment_attempts",
    columns: ["idempotency_key"],
  },
  {
    scope: "foundation",
    label: "payment_attempts_stripe_payment_intent_id_uq",
    tableName: "payment_attempts",
    columns: ["stripe_payment_intent_id"],
  },
  {
    scope: "foundation",
    label: "booking_cancellation_cases_source_key_uq",
    tableName: "booking_cancellation_cases",
    columns: ["source_key"],
  },
  {
    scope: "foundation",
    label: "payment_refunds_stripe_refund_id_uq",
    tableName: "payment_refunds",
    columns: ["stripe_refund_id"],
  },
  {
    scope: "foundation",
    label: "payment_refunds_idempotency_key_uq",
    tableName: "payment_refunds",
    columns: ["idempotency_key"],
  },
  {
    scope: "foundation",
    label: "payment_refund_attempts_refund_number_uq",
    tableName: "payment_refund_attempts",
    columns: ["payment_refund_id", "attempt_number"],
  },
  {
    scope: "foundation",
    label: "payment_refund_attempts_idempotency_key_uq",
    tableName: "payment_refund_attempts",
    columns: ["idempotency_key"],
  },
  {
    scope: "foundation",
    label: "payment_refund_attempts_stripe_refund_id_uq",
    tableName: "payment_refund_attempts",
    columns: ["stripe_refund_id"],
  },
  {
    scope: "foundation",
    label: "stripe_cleanup_jobs_operation_resource_uq",
    tableName: "stripe_cleanup_jobs",
    columns: ["operation", "stripe_resource_id"],
  },
  {
    scope: "foundation",
    label: "email_outbox_dedupe_key_uq",
    tableName: "email_outbox",
    columns: ["dedupe_key"],
  },
];

export const BOOKING_FLOW_EXPECTED_TABLE_NAMES = [
  ...new Set(BOOKING_FLOW_EXPECTED_COLUMNS.map((column) => column.tableName)),
];

function issuePrefix(scope: BookingFlowSchemaScope): string {
  return scope === "prerequisite"
    ? "[prerequisito Gite v2]"
    : "[fondazioni booking-flow]";
}

function sameColumnSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();
  return normalizedLeft.every(
    (value, index) => value === normalizedRight[index],
  );
}

function expectedTableScopes(): Map<string, BookingFlowSchemaScope> {
  const scopes = new Map<string, BookingFlowSchemaScope>();
  for (const column of BOOKING_FLOW_EXPECTED_COLUMNS) {
    const current = scopes.get(column.tableName);
    if (!current || column.scope === "prerequisite") {
      scopes.set(column.tableName, column.scope);
    }
  }
  return scopes;
}

export function inspectBookingFlowSchema(catalog: BookingFlowSchemaCatalog): {
  schemaIssues: string[];
  prerequisiteSchemaIssues: string[];
  foundationSchemaIssues: string[];
} {
  const prerequisiteSchemaIssues: string[] = [];
  const foundationSchemaIssues: string[] = [];
  const targetFor = (scope: BookingFlowSchemaScope) =>
    scope === "prerequisite"
      ? prerequisiteSchemaIssues
      : foundationSchemaIssues;
  const addIssue = (scope: BookingFlowSchemaScope, message: string) => {
    targetFor(scope).push(`${issuePrefix(scope)} ${message}`);
  };

  const relations = new Map(
    catalog.relations.map((relation) => [relation.tableName, relation]),
  );
  const invalidRelations = new Set<string>();
  for (const [tableName, scope] of expectedTableScopes()) {
    const relation = relations.get(tableName);
    if (!relation) {
      invalidRelations.add(tableName);
      addIssue(scope, `tabella ${tableName} assente.`);
    } else if (!new Set(["r", "p"]).has(relation.kind)) {
      invalidRelations.add(tableName);
      addIssue(
        scope,
        `${tableName} non è una tabella PostgreSQL ordinaria/partizionata (relkind=${relation.kind}).`,
      );
    }
  }

  const columns = new Map(
    catalog.columns.map((column) => [
      `${column.tableName}.${column.columnName}`,
      column,
    ]),
  );
  for (const expected of BOOKING_FLOW_EXPECTED_COLUMNS) {
    if (invalidRelations.has(expected.tableName)) continue;
    const qualifiedName = `${expected.tableName}.${expected.columnName}`;
    const actual = columns.get(qualifiedName);
    if (!actual) {
      addIssue(expected.scope, `colonna ${qualifiedName} assente.`);
      continue;
    }
    if (actual.udtName !== expected.udtName) {
      addIssue(
        expected.scope,
        `colonna ${qualifiedName} di tipo ${actual.udtName}; atteso ${expected.udtName}.`,
      );
    }
    if (actual.nullable !== expected.nullable) {
      addIssue(
        expected.scope,
        `colonna ${qualifiedName} ${actual.nullable ? "ammette NULL" : "è NOT NULL"}; atteso ${expected.nullable ? "NULL consentito" : "NOT NULL"}.`,
      );
    }
  }

  for (const expected of BOOKING_FLOW_EXPECTED_UNIQUE_TARGETS) {
    if (invalidRelations.has(expected.tableName)) continue;
    const candidates = catalog.indexes.filter(
      (index) => index.tableName === expected.tableName,
    );
    const matching = candidates.find(
      (index) =>
        index.unique &&
        index.valid &&
        index.ready &&
        index.plain &&
        index.unconditional &&
        sameColumnSet(index.columns, expected.columns),
    );
    if (matching) continue;

    const named = candidates.find(
      (index) => index.indexName === expected.label,
    );
    const detail = named
      ? ` L'indice omonimo ha colonne (${named.columns.join(", ") || "nessuna"}), unique=${named.unique}, valid=${named.valid}, ready=${named.ready}, plain=${named.plain}, unconditional=${named.unconditional}.`
      : "";
    addIssue(
      expected.scope,
      `vincolo univoco valido mancante su ${expected.tableName}(${expected.columns.join(", ")}); indice atteso ${expected.label}.${detail}`,
    );
  }

  return {
    schemaIssues: [...prerequisiteSchemaIssues, ...foundationSchemaIssues],
    prerequisiteSchemaIssues,
    foundationSchemaIssues,
  };
}
