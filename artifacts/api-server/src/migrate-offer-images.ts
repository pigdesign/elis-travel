import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Creazione tabella offer_images (IF NOT EXISTS)...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS offer_images (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS offer_images_offer_id_idx ON offer_images(offer_id)
  `);
  console.log("Migrazione completata.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Errore migrazione:", err);
  process.exit(1);
});
