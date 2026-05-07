import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Aggiunta colonne category, featured, last_minute a offers (IF NOT EXISTS)...");
  await db.execute(
    sql`ALTER TABLE offers ADD COLUMN IF NOT EXISTS category TEXT`
  );
  await db.execute(
    sql`ALTER TABLE offers ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE`
  );
  await db.execute(
    sql`ALTER TABLE offers ADD COLUMN IF NOT EXISTS last_minute BOOLEAN NOT NULL DEFAULT FALSE`
  );
  console.log("Migrazione completata.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Errore migrazione:", err);
  process.exit(1);
});
