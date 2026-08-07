import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

// Store della sessione dell'area clienti. Tabella separata da admin_sessions:
// le due sessioni hanno durate diverse (90 giorni contro 7) e tenerle distinte
// evita che una potatura o un troncamento tocchi le sessioni dell'altra platea.
// Schema richiesto da connect-pg-simple; nomi di vincolo e indice diversi da
// quelli di admin_sessions, che sono globali al database.
async function migrate() {
  await db.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS customer_sessions (
      sid VARCHAR NOT NULL COLLATE "default",
      sess JSON NOT NULL,
      expire TIMESTAMP(6) NOT NULL,
      CONSTRAINT customer_session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE
    )
  `),
  );

  await db.execute(
    sql.raw(
      "CREATE INDEX IF NOT EXISTS idx_customer_session_expire ON customer_sessions (expire)",
    ),
  );

  console.log("✓ customer_sessions table ready");
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
