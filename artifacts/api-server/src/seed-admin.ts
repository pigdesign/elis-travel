import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { adminUsersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? "Amministratore";

  if (!email || !password) {
    console.error(
      "❌ ADMIN_EMAIL e ADMIN_PASSWORD devono essere impostati come variabili d'ambiente."
    );
    console.error(
      "   Esempio: ADMIN_EMAIL=admin@tuosito.it ADMIN_PASSWORD=<password-sicura> pnpm seed:admin"
    );
    process.exit(1);
  }

  const [existing] = await db
    .select()
    .from(adminUsersTable)
    .where(eq(adminUsersTable.email, email))
    .limit(1);

  if (existing) {
    console.log(`✓ Utente admin già esistente: ${email}`);
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await db.insert(adminUsersTable).values({
    email,
    passwordHash,
    name,
    role: "admin",
  });

  console.log(`✓ Utente admin creato: ${email}`);
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
