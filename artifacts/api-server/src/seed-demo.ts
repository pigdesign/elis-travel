import { db } from "@workspace/db";
import {
  excursionsTable,
  excursionVehiclesTable,
  excursionBookingsTable,
  offersTable,
} from "@workspace/db/schema";

async function seedDemo() {
  console.log("🌱 Seeding demo data...");

  const existingExcursions = await db.select().from(excursionsTable).limit(1);
  if (existingExcursions.length > 0) {
    console.log("✓ Excursion demo data already exists, skipping excursions.");
  } else {

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
  }

  const existingOffers = await db.select().from(offersTable).limit(1);
  if (existingOffers.length === 0) {
    const offerValidFrom = (offsetDays: number) => {
      const d = new Date();
      d.setDate(d.getDate() + offsetDays);
      return d;
    };

    await db.insert(offersTable).values([
      {
        name: "Capodanno a Vienna",
        destination: "Vienna, Austria",
        tourOperator: "Alpitour",
        status: "published",
        validFrom: offerValidFrom(-30),
        validTo: offerValidFrom(60),
        baseFormula: "Volo + Hotel 4★ + colazione",
        departureCity: "Milano Malpensa",
        durationDays: 4,
        durationNights: 3,
        period: "30 Dic – 2 Gen",
        publicPrice: "890.00",
        advertisingText: "Festeggia il Capodanno nella magica Vienna! Concerti, mercatini e l'atmosfera mitteleuropea ti aspettano.",
        servicesIncluded: "Volo A/R, Hotel 4 stelle BB, trasferimenti aeroporto, guida locale",
        servicesExcluded: "Visti, assicurazione, pranzi e cene, extra personali",
        highlights: "Concerto di Capodanno|Passeggiata al Prater|Mercatino di Natale",
        pricingNotes: "Prezzo a persona in camera doppia. Supplemento singola €120.",
        internalNotes: "Contratto con Alpitour valido fino al 30 Nov. Commissione 12%.",
        publicLink: "https://elistravel.it/offerte/capodanno-vienna",
        leadsCount: 23,
        lastInterestAt: offerValidFrom(-2),
        mainSource: "newsletter",
      },
      {
        name: "Costiera Amalfitana — Primavera",
        destination: "Amalfi, Positano, Ravello",
        tourOperator: "Costa Express",
        status: "published",
        validFrom: offerValidFrom(30),
        validTo: offerValidFrom(120),
        baseFormula: "Pullman + Hotel 3★ + mezza pensione",
        departureCity: "Verona",
        durationDays: 5,
        durationNights: 4,
        period: "Aprile – Giugno",
        publicPrice: "420.00",
        advertisingText: "Un viaggio lungo la costa più bella d'Italia. Limoni, limonata e panorami mozzafiato.",
        servicesIncluded: "Pullman privato, Hotel MP, guide, traghetto Positano",
        servicesExcluded: "Bevande ai pasti, cena libera sabato, ingresso Villa Rufolo",
        highlights: "Belvedere di Ravello|Sentiero degli Dei|Grotta dello Smeraldo",
        pricingNotes: "Min 25 partecipanti. Prezzo include tutto il servizio a terra.",
        internalNotes: "Fornita da Costa Express. Verificare disponibilità hotel prima di confermare.",
        publicLink: null,
        leadsCount: 15,
        lastInterestAt: offerValidFrom(-5),
        mainSource: "sito web",
      },
      {
        name: "Marocco — Tour Imperiale 8 giorni",
        destination: "Marrakech, Fès, Casablanca",
        tourOperator: "Turisanda",
        status: "published",
        validFrom: offerValidFrom(15),
        validTo: offerValidFrom(90),
        baseFormula: "Volo + Riad 4★ + pensione completa + guida",
        departureCity: "Roma Fiumicino",
        durationDays: 8,
        durationNights: 7,
        period: "Mar – Mag / Set – Nov",
        publicPrice: "1190.00",
        advertisingText: "Scopri le città imperiali del Marocco: souq colorati, palazzi dorati e il deserto del Sahara.",
        servicesIncluded: "Volo A/R, Riad PC, guida italiano parlante, jeep nel deserto",
        servicesExcluded: "Mance, assicurazione sanitaria, extra personali",
        highlights: "Djemaa el-Fna|Medina di Fès|Notte nel deserto",
        pricingNotes: "Prezzo per persona in camera doppia. Singola +€250.",
        internalNotes: "Tour garantito min 10 pax. Data confermata 15 aprile. Ottima marginalità.",
        publicLink: "https://elistravel.it/offerte/marocco-tour-imperiale",
        leadsCount: 31,
        lastInterestAt: offerValidFrom(-1),
        mainSource: "instagram",
      },
      {
        name: "Maldive — Settimana al Paradiso",
        destination: "Atollo di Ari, Maldive",
        tourOperator: "Francorosso",
        status: "draft",
        validFrom: offerValidFrom(60),
        validTo: offerValidFrom(180),
        baseFormula: "Volo + Resort 5★ all inclusive",
        departureCity: "Milano Malpensa",
        durationDays: 9,
        durationNights: 8,
        period: "Ottobre – Aprile",
        publicPrice: "3200.00",
        advertisingText: null,
        servicesIncluded: "Volo A/R, idrovolante, Resort All Inclusive, snorkeling attrezzatura",
        servicesExcluded: "Escursioni opzionali, SPA, bevande premium",
        highlights: "Overwater bungalow|Barriera corallina|Coucher du soleil in barca",
        pricingNotes: "Prezzo in camera water bungalow. Land bungalow -€400.",
        internalNotes: "Da finalizzare. Aspettiamo aggiornamento prezzi Francorosso Q3.",
        publicLink: null,
        leadsCount: 4,
        lastInterestAt: offerValidFrom(-10),
        mainSource: "fiera turismo",
      },
      {
        name: "Barcellona City Break",
        destination: "Barcellona, Spagna",
        tourOperator: null,
        status: "archived",
        validFrom: offerValidFrom(-120),
        validTo: offerValidFrom(-30),
        baseFormula: "Volo + Hotel 3★ BB",
        departureCity: "Venezia Marco Polo",
        durationDays: 4,
        durationNights: 3,
        period: "Febbraio 2025",
        publicPrice: "310.00",
        advertisingText: "Weekend nella città di Gaudí: Sagrada Família, Park Güell e tapas a volontà!",
        servicesIncluded: "Volo A/R, Hotel BB, metro pass 3 giorni",
        servicesExcluded: "Ingressi musei, pasti, trasferimenti extra",
        highlights: "Sagrada Família|Las Ramblas|Park Güell",
        pricingNotes: "Offerta scaduta.",
        internalNotes: "Archiviata. Buona performance: 48 leads. Replicare per autunno 2025.",
        publicLink: null,
        leadsCount: 48,
        lastInterestAt: offerValidFrom(-32),
        mainSource: "email marketing",
      },
    ]);

    console.log("✓ Created 5 demo offers");
  }

  process.exit(0);
}

seedDemo().catch((err) => {
  console.error("Demo seed failed:", err);
  process.exit(1);
});
