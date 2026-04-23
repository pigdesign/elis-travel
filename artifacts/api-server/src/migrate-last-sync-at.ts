import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Aggiunta colonna last_sync_at a customer_external_links (IF NOT EXISTS)...");
  await db.execute(
    sql`ALTER TABLE customer_external_links ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP WITH TIME ZONE`
  );
  console.log("Migrazione completata.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Errore migrazione:", err);
  process.exit(1);
});
