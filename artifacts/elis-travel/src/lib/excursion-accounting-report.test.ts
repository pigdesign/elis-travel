import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAccountingRows,
  buildCancelledWithMoney,
  buildSeatLines,
  summarizeAccounting,
  type AccountingBookingInput,
} from "./excursion-accounting-report";

const ORA = new Date("2026-09-30T10:00:00Z").getTime();
const etichetta = (status: string) => `stato:${status}`;

function prenotazione(
  over: Partial<AccountingBookingInput> = {},
): AccountingBookingInput {
  return {
    customerName: "Rossi Mario",
    phone: "3330000000",
    adults: 2,
    children: 0,
    bookingCode: "ET-0001",
    totalAmountCents: 10000,
    amountPaidCents: 0,
    paymentMethod: "bank_transfer",
    paymentDeadline: "2026-10-10T00:00:00Z",
    paymentStatus: "pending",
    ...over,
  };
}

test("il residuo e totale meno incassato", () => {
  const [riga] = buildAccountingRows(
    [prenotazione({ totalAmountCents: 10000, amountPaidCents: 3000 })],
    { now: ORA, statusLabel: etichetta },
  );
  assert.equal(riga!.residualCents, 7000);
});

// Un incasso superiore al totale (rimborso da fare) non deve produrre un
// residuo negativo: sommato in colonna abbasserebbe il totale da incassare.
test("un incasso superiore al totale non genera residuo negativo", () => {
  const [riga] = buildAccountingRows(
    [prenotazione({ totalAmountCents: 5000, amountPaidCents: 8000 })],
    { now: ORA, statusLabel: etichetta },
  );
  assert.equal(riga!.residualCents, 0);
});

test("senza totale il residuo resta ignoto, non zero", () => {
  const [riga] = buildAccountingRows(
    [prenotazione({ totalAmountCents: null, amountPaidCents: 2000 })],
    { now: ORA, statusLabel: etichetta },
  );
  assert.equal(riga!.totalCents, null);
  assert.equal(riga!.residualCents, null);
});

test("la scadenza passata e segnalata solo se resta qualcosa da incassare", () => {
  const scaduta = { paymentDeadline: "2026-09-01T00:00:00Z" };
  const [conDebito] = buildAccountingRows(
    [prenotazione({ ...scaduta, amountPaidCents: 0 })],
    { now: ORA, statusLabel: etichetta },
  );
  const [saldata] = buildAccountingRows(
    [prenotazione({ ...scaduta, amountPaidCents: 10000 })],
    { now: ORA, statusLabel: etichetta },
  );
  assert.equal(conDebito!.overdue, true);
  assert.equal(saldata!.overdue, false);
});

// L'ordine e quello in cui si fanno le telefonate: prima chi deve dare
// qualcosa, partendo dalle scadenze piu vecchie.
test("ordina i debitori per scadenza e manda in fondo i saldati", () => {
  const righe = buildAccountingRows(
    [
      prenotazione({
        customerName: "Saldata Anna",
        amountPaidCents: 10000,
        paymentDeadline: "2026-09-02T00:00:00Z",
      }),
      prenotazione({
        customerName: "Debito Tardi",
        paymentDeadline: "2026-11-01T00:00:00Z",
      }),
      prenotazione({
        customerName: "Debito Presto",
        paymentDeadline: "2026-10-01T00:00:00Z",
      }),
      prenotazione({ customerName: "Debito Senza Scadenza", paymentDeadline: null }),
    ],
    { now: ORA, statusLabel: etichetta },
  );
  assert.deepEqual(
    righe.map((r) => r.name),
    ["Debito Presto", "Debito Tardi", "Debito Senza Scadenza", "Saldata Anna"],
  );
});

test("i totali escludono le righe senza importo e le contano a parte", () => {
  const righe = buildAccountingRows(
    [
      prenotazione({ totalAmountCents: 10000, amountPaidCents: 4000 }),
      prenotazione({ totalAmountCents: null, amountPaidCents: 1500 }),
    ],
    { now: ORA, statusLabel: etichetta },
  );
  const s = summarizeAccounting(righe);
  assert.equal(s.totalCents, 10000);
  // L'incassato comprende anche la riga senza totale: quei soldi sono entrati.
  assert.equal(s.collectedCents, 5500);
  assert.equal(s.residualCents, 6000);
  assert.equal(s.rowsWithoutTotal, 1);
});

test("il residuo e diviso per metodo, perche si risolvono in posti diversi", () => {
  const righe = buildAccountingRows(
    [
      prenotazione({ paymentMethod: "bank_transfer", totalAmountCents: 10000 }),
      prenotazione({ paymentMethod: "on_bus", totalAmountCents: 5000 }),
      prenotazione({ paymentMethod: "on_bus", totalAmountCents: 4000 }),
      // Saldata: non deve comparire in nessun metodo.
      prenotazione({
        paymentMethod: "card",
        totalAmountCents: 9000,
        amountPaidCents: 9000,
      }),
      prenotazione({ paymentMethod: null, totalAmountCents: 2000 }),
    ],
    { now: ORA, statusLabel: etichetta },
  );
  const s = summarizeAccounting(righe);
  assert.deepEqual(s.residualByMethod, {
    bank_transfer: 10000,
    on_bus: 9000,
    "non indicato": 2000,
  });
});

test("le annullate senza denaro versato non compaiono", () => {
  const righe = buildCancelledWithMoney(
    [
      prenotazione({
        customerName: "Con Acconto",
        amountPaidCents: 3000,
        cancelledAt: "2026-09-10T00:00:00Z",
      }),
      prenotazione({ customerName: "Senza Nulla", amountPaidCents: 0 }),
      prenotazione({
        customerName: "Saldata Intera",
        amountPaidCents: 12000,
        cancelledAt: "2026-09-11T00:00:00Z",
      }),
    ],
    { statusLabel: etichetta },
  );
  // Ordinate per importo: si guarda prima dove c'e piu denaro fermo.
  assert.deepEqual(
    righe.map((r) => r.name),
    ["Saldata Intera", "Con Acconto"],
  );
});

// --- Composizione dei posti ------------------------------------------------

const adulto = (cents: number) => ({ participantType: "adult", finalPriceCents: cents });
const bambino = (eta: string, cents: number) => ({
  participantType: "child",
  ageRangeLabel: eta,
  finalPriceCents: cents,
});

test("posti: adulti e bambini con fascia e prezzo, raggruppati", () => {
  const righe = buildSeatLines({
    seats: 3,
    adults: 1,
    children: 2,
    seatParticipants: [bambino("4-11 anni", 200), adulto(400), bambino("4-11 anni", 200)],
  });
  assert.deepEqual(righe, [
    { count: 1, label: "adulto", unitPriceCents: 400 },
    { count: 2, label: "bambini 4-11 anni", unitPriceCents: 200 },
  ]);
});

test("posti: fasce diverse su righe diverse, i piu piccoli prima", () => {
  const righe = buildSeatLines({
    seats: 4,
    adults: 2,
    children: 2,
    seatParticipants: [adulto(400), adulto(400), bambino("12-17 anni", 300), bambino("0-3 anni", 0)],
  });
  assert.deepEqual(
    righe.map((r) => `${r.count} ${r.label} ${r.unitPriceCents}`),
    ["2 adulti 400", "1 bambino 0-3 anni 0", "1 bambino 12-17 anni 300"],
  );
});

// Stesso tipo e fascia ma prezzo diverso (supplementi di raccolta diversi):
// unire le righe mostrerebbe un prezzo falso per uno dei due.
test("posti: stesso tipo con prezzi diversi resta su due righe", () => {
  const righe = buildSeatLines({
    seats: 2,
    adults: 2,
    children: 0,
    seatParticipants: [adulto(4500), adulto(4000)],
  });
  assert.deepEqual(
    righe.map((r) => [r.count, r.unitPriceCents]),
    [[1, 4500], [1, 4000]],
  );
});

test("posti: senza partecipanti registrati restano i contatori, senza prezzo", () => {
  assert.deepEqual(buildSeatLines({ seats: 3, adults: 1, children: 2, seatParticipants: [] }), [
    { count: 1, label: "adulto", unitPriceCents: null },
    { count: 2, label: "bambini", unitPriceCents: null },
  ]);
});

test("posti: i posti senza dettaglio compaiono invece di sparire", () => {
  const righe = buildSeatLines({ seats: 3, adults: 3, children: 0, seatParticipants: [adulto(400)] });
  assert.deepEqual(righe.at(-1), { count: 2, label: "posti senza dettaglio", unitPriceCents: null });
});

test("posti: gite Rident con pazienti e accompagnatori", () => {
  const righe = buildSeatLines({
    seats: 2,
    adults: 2,
    children: 0,
    seatParticipants: [
      { participantType: "companion", finalPriceCents: 10000 },
      { participantType: "patient", finalPriceCents: 18000 },
    ],
  });
  assert.deepEqual(
    righe.map((r) => r.label),
    ["paziente", "accompagnatore"],
  );
});

test("il prospetto porta la composizione dei posti su ogni riga", () => {
  const [riga] = buildAccountingRows(
    [prenotazione({ seats: 1, adults: 1, children: 0, seatParticipants: [adulto(800)] })],
    { now: ORA, statusLabel: etichetta },
  );
  assert.deepEqual(riga!.seatLines, [{ count: 1, label: "adulto", unitPriceCents: 800 }]);
});
