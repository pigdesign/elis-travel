import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pool, sessionPool } from "@workspace/db";
import {
  BOOKING_FLOW_EXPECTED_TABLE_NAMES,
  inspectBookingFlowSchema,
  type BookingFlowCatalogColumn,
  type BookingFlowCatalogIndex,
  type BookingFlowCatalogRelation,
  type BookingFlowSchemaCatalog,
} from "./services/booking-flow-schema-contract";

const APPLY_CONFIRMATION = "APPLY_BOOKING_FLOW_FOUNDATIONS";
const migrationPath = fileURLToPath(
  new URL(
    "../../../lib/db/manual/2026-07-21_booking_flow_foundations.sql",
    import.meta.url,
  ),
);

type PreflightReport = {
  schemaReady: boolean;
  prerequisiteReady: boolean;
  schemaIssues: string[];
  prerequisiteSchemaIssues: string[];
  foundationSchemaIssues: string[];
  duplicateBookingCodes: number | null;
  duplicateBookingAttempts: number | null;
  activeExcursionsWithoutDeparture: number | null;
  invalidPaidAmounts: number | null;
  participantCountMismatches: number | null;
};

async function loadSchemaCatalog(): Promise<BookingFlowSchemaCatalog> {
  const [relations, columns, indexes] = await Promise.all([
    pool.query<BookingFlowCatalogRelation>(
      `SELECT relation.relname::text AS "tableName",
              relation.relkind::text AS kind
       FROM pg_catalog.pg_class relation
       JOIN pg_catalog.pg_namespace namespace
         ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = current_schema()
         AND relation.relname = ANY($1::text[])`,
      [BOOKING_FLOW_EXPECTED_TABLE_NAMES],
    ),
    pool.query<BookingFlowCatalogColumn>(
      `SELECT table_name::text AS "tableName",
              column_name::text AS "columnName",
              udt_name::text AS "udtName",
              (is_nullable = 'YES') AS nullable
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = ANY($1::text[])`,
      [BOOKING_FLOW_EXPECTED_TABLE_NAMES],
    ),
    pool.query<BookingFlowCatalogIndex>(
      `SELECT table_relation.relname::text AS "tableName",
              index_relation.relname::text AS "indexName",
              index_meta.indisunique AS unique,
              index_meta.indisvalid AS valid,
              index_meta.indisready AS ready,
              (index_meta.indexprs IS NULL) AS plain,
              (index_meta.indpred IS NULL) AS unconditional,
              ARRAY(
                SELECT attribute.attname::text
                FROM unnest(index_meta.indkey::smallint[])
                  WITH ORDINALITY AS index_key(attnum, key_position)
                JOIN pg_catalog.pg_attribute attribute
                  ON attribute.attrelid = index_meta.indrelid
                 AND attribute.attnum = index_key.attnum
                WHERE index_key.key_position <= index_meta.indnkeyatts
                ORDER BY index_key.key_position
              )::text[] AS columns
       FROM pg_catalog.pg_index index_meta
       JOIN pg_catalog.pg_class table_relation
         ON table_relation.oid = index_meta.indrelid
       JOIN pg_catalog.pg_class index_relation
         ON index_relation.oid = index_meta.indexrelid
       JOIN pg_catalog.pg_namespace namespace
         ON namespace.oid = table_relation.relnamespace
       WHERE namespace.nspname = current_schema()
         AND table_relation.relname = ANY($1::text[])`,
      [BOOKING_FLOW_EXPECTED_TABLE_NAMES],
    ),
  ]);
  return {
    relations: relations.rows,
    columns: columns.rows,
    indexes: indexes.rows,
  };
}

function catalogHasColumn(
  catalog: BookingFlowSchemaCatalog,
  tableName: string,
  columnName: string,
  udtName: string,
): boolean {
  const relation = catalog.relations.find(
    (candidate) => candidate.tableName === tableName,
  );
  if (!relation || !["r", "p"].includes(relation.kind)) return false;
  return catalog.columns.some(
    (column) =>
      column.tableName === tableName &&
      column.columnName === columnName &&
      column.udtName === udtName,
  );
}

async function scalarCount(query: string): Promise<number> {
  const result = await pool.query<{ count: number | string }>(query);
  return Number(result.rows[0]?.count ?? 0);
}

async function runPreflight(): Promise<PreflightReport> {
  const catalog = await loadSchemaCatalog();
  const schemaInspection = inspectBookingFlowSchema(catalog);
  const hasBookingCode = catalogHasColumn(
    catalog,
    "excursion_bookings",
    "booking_code",
    "text",
  );
  const duplicateBookingCodes = hasBookingCode
    ? await scalarCount(`
        SELECT count(*)::int AS count
        FROM (
          SELECT booking_code
          FROM excursion_bookings
          WHERE booking_code IS NOT NULL
          GROUP BY booking_code
          HAVING count(*) > 1
        ) duplicates
      `)
    : null;
  const hasAttemptId = catalogHasColumn(
    catalog,
    "excursion_bookings",
    "booking_attempt_id",
    "text",
  );
  const duplicateBookingAttempts = hasAttemptId
    ? await scalarCount(`
        SELECT count(*)::int AS count
        FROM (
          SELECT booking_attempt_id
          FROM excursion_bookings
          WHERE booking_attempt_id IS NOT NULL
          GROUP BY booking_attempt_id
          HAVING count(*) > 1
        ) duplicates
      `)
    : null;

  const hasDeparture = catalogHasColumn(
    catalog,
    "excursions",
    "departure_at",
    "timestamptz",
  );
  const canCheckActiveExcursions =
    hasDeparture && catalogHasColumn(catalog, "excursions", "status", "text");
  const hasWorkflow = catalogHasColumn(
    catalog,
    "excursion_bookings",
    "workflow_version",
    "int4",
  );
  const hasFinancials =
    catalogHasColumn(
      catalog,
      "excursion_bookings",
      "amount_paid_cents",
      "int4",
    ) &&
    catalogHasColumn(
      catalog,
      "excursion_bookings",
      "total_amount_cents",
      "int4",
    );
  const canCheckParticipants =
    hasWorkflow &&
    catalogHasColumn(
      catalog,
      "excursion_bookings",
      "cancelled_at",
      "timestamp",
    ) &&
    catalogHasColumn(catalog, "excursion_bookings", "id", "uuid") &&
    catalogHasColumn(catalog, "excursion_bookings", "seat_status", "text") &&
    catalogHasColumn(catalog, "excursion_bookings", "seats", "int4") &&
    catalogHasColumn(catalog, "booking_participants", "booking_id", "uuid");

  const activeExcursionsWithoutDeparture = canCheckActiveExcursions
    ? await scalarCount(`
        SELECT count(*)::int AS count
        FROM excursions
        WHERE status IN ('open', 'confirmed')
          AND departure_at IS NULL
      `)
    : null;
  const invalidPaidAmounts = hasFinancials
    ? await scalarCount(`
        SELECT count(*)::int AS count
        FROM excursion_bookings
        WHERE amount_paid_cents < 0
           OR (total_amount_cents IS NOT NULL
               AND amount_paid_cents > total_amount_cents)
      `)
    : null;
  const participantCountMismatches = canCheckParticipants
    ? await scalarCount(`
        SELECT count(*)::int AS count
        FROM excursion_bookings booking
        WHERE booking.workflow_version >= 3
          AND booking.cancelled_at IS NULL
          AND booking.seat_status <> 'released'
          AND (
            SELECT count(*)::int
            FROM booking_participants participant
            WHERE participant.booking_id = booking.id
          ) <> booking.seats
      `)
    : null;

  return {
    schemaReady: schemaInspection.schemaIssues.length === 0,
    prerequisiteReady: schemaInspection.prerequisiteSchemaIssues.length === 0,
    ...schemaInspection,
    duplicateBookingCodes,
    duplicateBookingAttempts,
    activeExcursionsWithoutDeparture,
    invalidPaidAmounts,
    participantCountMismatches,
  };
}

function printReport(report: PreflightReport): void {
  console.log("Preflight flusso prenotazioni:");
  console.log(
    `- schema fondazioni presente: ${report.schemaReady ? "sì" : "no"}`,
  );
  console.log(
    `- prerequisito Gite v2 completo: ${report.prerequisiteReady ? "sì" : "no"}`,
  );
  if (report.schemaIssues.length > 0) {
    console.log(`- problemi schema (${report.schemaIssues.length}):`);
    for (const issue of report.schemaIssues) console.log(`  - ${issue}`);
  }
  console.log(
    `- gruppi di booking_code duplicati: ${report.duplicateBookingCodes ?? "non verificabile"}`,
  );
  console.log(
    `- gruppi di booking_attempt_id duplicati: ${report.duplicateBookingAttempts ?? "non verificabile"}`,
  );
  console.log(
    `- gite open/confirmed senza departureAt: ${report.activeExcursionsWithoutDeparture ?? "verificabile dopo la migrazione"}`,
  );
  console.log(
    `- importi pagati incoerenti: ${report.invalidPaidAmounts ?? "non verificabile"}`,
  );
  console.log(
    `- booking v3 con numero partecipanti incoerente: ${report.participantCountMismatches ?? "non verificabile"}`,
  );
}

function hasMigrationBlockingDataIssues(report: PreflightReport): boolean {
  return (
    (report.duplicateBookingCodes ?? 0) > 0 ||
    (report.duplicateBookingAttempts ?? 0) > 0
  );
}

function hasReleaseBlockingIssues(report: PreflightReport): boolean {
  return (
    hasMigrationBlockingDataIssues(report) ||
    (report.activeExcursionsWithoutDeparture ?? 0) > 0 ||
    (report.invalidPaidAmounts ?? 0) > 0 ||
    (report.participantCountMismatches ?? 0) > 0
  );
}

function databaseLabel(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) return "DATABASE_URL non impostato";
  try {
    const parsed = new URL(raw);
    const port = parsed.port ? `:${parsed.port}` : "";
    return `${parsed.hostname}${port}${parsed.pathname}`;
  } catch {
    return "DATABASE_URL non valida";
  }
}

async function main(): Promise<void> {
  // `pnpm run <script> -- --check` forwards the conventional `--` separator
  // to tsx on some pnpm versions. Accept both that form and a direct
  // `tsx ... --check` invocation so the documented release command is stable.
  const forwardedArgs = process.argv.slice(2).filter((arg) => arg !== "--");
  const mode = forwardedArgs[0] ?? "--check";
  if (forwardedArgs.length > 1) {
    throw new Error("Uso: migrate:booking-flow --check | --apply");
  }
  if (mode !== "--check" && mode !== "--apply") {
    throw new Error("Uso: migrate:booking-flow --check | --apply");
  }

  console.log(`Database target: ${databaseLabel()}`);
  const before = await runPreflight();
  printReport(before);

  if (mode === "--check") {
    if (!before.schemaReady || hasReleaseBlockingIssues(before)) {
      process.exitCode = 2;
    }
    return;
  }

  if (process.env.BOOKING_FLOW_MIGRATION_CONFIRM !== APPLY_CONFIRMATION) {
    throw new Error(
      `Per applicare la migrazione imposta BOOKING_FLOW_MIGRATION_CONFIRM=${APPLY_CONFIRMATION}.`,
    );
  }
  if (!before.prerequisiteReady) {
    throw new Error(
      "Migrazione non applicata: completare prima i prerequisiti Gite v2 elencati dal preflight.",
    );
  }
  if (hasMigrationBlockingDataIssues(before)) {
    throw new Error(
      "Migrazione non applicata: risolvere prima le incoerenze dati indicate dal preflight.",
    );
  }

  const sql = await readFile(migrationPath, "utf8");
  await pool.query(sql);
  console.log("Migrazione booking flow applicata.");

  const after = await runPreflight();
  printReport(after);
  if (!after.schemaReady || hasMigrationBlockingDataIssues(after)) {
    throw new Error("Verifica post-migrazione non superata.");
  }
  if (hasReleaseBlockingIssues(after)) {
    console.warn(
      "ATTENZIONE: migrazione applicata, ma il rilascio resta bloccato finché il preflight dati non è pulito (incluso departureAt sulle gite attive).",
    );
    process.exitCode = 2;
  }
}

main()
  .catch((error) => {
    console.error("Migrazione booking flow fallita:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all([pool.end(), sessionPool.end()]);
  });
