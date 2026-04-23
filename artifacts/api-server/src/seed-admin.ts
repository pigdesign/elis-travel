import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { adminUsersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL ?? "admin@elistravel.it";
  const password = process.env.ADMIN_PASSWORD ?? "admin123";
  const name = process.env.ADMIN_NAME ?? "Amministratore";

  const [existing] = await db
    .select()
    .from(adminUsersTable)
    .where(eq(adminUsersTable.email, email))
    .limit(1);

  if (existing) {
    console.log(`✓ Admin user already exists: ${email}`);
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await db.insert(adminUsersTable).values({
    email,
    passwordHash,
    name,
    role: "admin",
  });

  console.log(`✓ Admin user created: ${email}`);
  console.log(`  Password: ${password}`);
  console.log("  ⚠️  Cambia la password dopo il primo accesso!");
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
