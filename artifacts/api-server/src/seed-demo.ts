import { db } from "@workspace/db";
import {
  excursionsTable,
  excursionVehiclesTable,
  excursionBookingsTable,
} from "@workspace/db/schema";

async function seedDemo() {
  console.log("🌱 Seeding demo data...");

  const existingExcursions = await db.select().from(excursionsTable).limit(1);
  if (existingExcursions.length > 0) {
    console.log("✓ Demo data already exists, skipping.");
    process.exit(0);
  }

  const [pullman] = await db
    .insert(excursionVehiclesTable)
    .values({
      name: "Pullman Gran Turismo 54 posti",
      capacity: 54,
      fixedCost: "1200.00",
      notes: "Autista incluso, AC, WC a bordo",
    })
    .returning();

  const [minibus] = await db
    .insert(excursionVehiclesTable)
    .values({
      name: "Minibus 19 posti",
      capacity: 19,
      fixedCost: "450.00",
      notes: "Autista incluso",
    })
    .returning();

  const today = new Date();
  const addDays = (d: Date, n: number) => {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r.toISOString().split("T")[0];
  };

  const [gita1] = await db
    .insert(excursionsTable)
    .values({
      name: "Gita ai Laghi di Plitvice",
      location: "Plitvice, Croazia",
      date: addDays(today, 45),
      status: "confirmed",
      vehicleId: pullman.id,
      currentCapacity: 54,
      minThreshold: 30,
      adherentsCount: 42,
      depositsCount: 35,
      balancesCount: 20,
      vehicleFixedCost: "1200.00",
      mealCostPerPerson: "25.00",
      entranceCostPerPerson: "18.00",
      extraCostPerPerson: "5.00",
      pricePerPerson: "89.00",
      switchThreshold: 40,
      switchVehicleId: null,
      operationalNotes: "Partenza ore 06:00 da Piazza Roma. Pranzo incluso.",
    })
    .returning();

  const [gita2] = await db
    .insert(excursionsTable)
    .values({
      name: "Tour Toscana — Siena e San Gimignano",
      location: "Siena e San Gimignano, Toscana",
      date: addDays(today, 12),
      status: "confirmed",
      vehicleId: pullman.id,
      currentCapacity: 54,
      minThreshold: 25,
      adherentsCount: 48,
      depositsCount: 48,
      balancesCount: 48,
      vehicleFixedCost: "1200.00",
      mealCostPerPerson: "20.00",
      entranceCostPerPerson: "12.00",
      extraCostPerPerson: "3.00",
      pricePerPerson: "75.00",
      operationalNotes: "Gita confermata. Tutti i partecipanti hanno saldato.",
    })
    .returning();

  const [gita3] = await db
    .insert(excursionsTable)
    .values({
      name: "Weekend a Praga",
      location: "Praga, Repubblica Ceca",
      date: addDays(today, 90),
      status: "draft",
      vehicleId: null,
      currentCapacity: 0,
      minThreshold: 20,
      adherentsCount: 8,
      depositsCount: 3,
      balancesCount: 0,
      vehicleFixedCost: "0",
      mealCostPerPerson: "35.00",
      entranceCostPerPerson: "0.00",
      extraCostPerPerson: "15.00",
      pricePerPerson: "195.00",
      operationalNotes: "In fase di raccolta adesioni. Volo da prenotare.",
    })
    .returning();

  const [gita4] = await db
    .insert(excursionsTable)
    .values({
      name: "Escursione alle Cinque Terre",
      location: "Cinque Terre, Liguria",
      date: addDays(today, -30),
      status: "completed",
      vehicleId: minibus.id,
      currentCapacity: 19,
      minThreshold: 12,
      adherentsCount: 19,
      depositsCount: 19,
      balancesCount: 19,
      vehicleFixedCost: "450.00",
      mealCostPerPerson: "18.00",
      entranceCostPerPerson: "8.00",
      extraCostPerPerson: "2.00",
      pricePerPerson: "65.00",
      operationalNotes: "Gita completata con successo.",
    })
    .returning();

  const bookingsData = [
    { excursionId: gita1.id, names: ["Marco Rossi", "Giulia Bianchi", "Antonio Verdi", "Sofia Colombo", "Luca Ferrari"], statuses: ["paid", "deposit", "paid", "deposit", "paid"] },
    { excursionId: gita2.id, names: ["Elena Martini", "Roberto Russo", "Maria Greco", "Francesco Bruno"], statuses: ["paid", "paid", "paid", "paid"] },
    { excursionId: gita3.id, names: ["Valentina Esposito", "Giovanni Ricci"], statuses: ["deposit", "pending"] },
    { excursionId: gita4.id, names: ["Chiara Lombardi", "Davide Costa", "Federica Conti"], statuses: ["paid", "paid", "paid"] },
  ];

  for (const { excursionId, names, statuses } of bookingsData) {
    for (let i = 0; i < names.length; i++) {
      await db.insert(excursionBookingsTable).values({
        excursionId,
        customerName: names[i],
        seats: 1,
        paymentStatus: statuses[i],
      });
    }
  }

  console.log(`✓ Created ${4} demo excursions with bookings`);
  process.exit(0);
}

seedDemo().catch((err) => {
  console.error("Demo seed failed:", err);
  process.exit(1);
});
