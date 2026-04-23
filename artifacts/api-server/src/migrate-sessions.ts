import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function migrate() {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      sid VARCHAR NOT NULL COLLATE "default",
      sess JSON NOT NULL,
      expire TIMESTAMP(6) NOT NULL,
      CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE
    )
  `));

  await db.execute(sql.raw(
    "CREATE INDEX IF NOT EXISTS IDX_session_expire ON admin_sessions (expire)"
  ));

  console.log("✓ admin_sessions table ready");
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
