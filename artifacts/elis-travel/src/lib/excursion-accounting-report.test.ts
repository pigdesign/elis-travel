import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAccountingRows,
  buildCancelledWithMoney,
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
