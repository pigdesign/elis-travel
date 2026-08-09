import { test } from "node:test";
import assert from "node:assert/strict";
import { calcFinancials } from "./excursion-financials";

const gita = {
  pricePerPerson: "150.00",
  mealCostPerPerson: "20.00",
  entranceCostPerPerson: "10.00",
  extraCostPerPerson: "7.50",
  vehicleFixedCost: "150.00",
  otherCostsTotal: "4.00",
  adherentsCount: 2,
};

test("i ricavi sommano i totali reali delle prenotazioni, non prezzo × posti", () => {
  // Due adulti a prezzo pieno: qui il vecchio calcolo e quello nuovo coincidono.
  const f = calcFinancials(gita, { totalCents: 30000, legacySeats: 0 });

  assert.equal(f.ricaviStimati, 300);
  assert.equal(f.costiVariabili, 75);
  assert.equal(f.costiTotali, 229);
  assert.equal(f.margineNetto, 71);
});

test("un bambino a prezzo ridotto non viene contato a prezzo pieno", () => {
  // Adulto 150 + bambino 90 = 240, non 300.
  const f = calcFinancials(gita, { totalCents: 24000, legacySeats: 0 });

  assert.equal(f.ricaviStimati, 240);
  assert.equal(f.margineNetto, 240 - 229);
});

test("il supplemento di provincia entra nei ricavi", () => {
  // Due adulti con +12,50 a testa di supplemento sul punto di raccolta.
  const f = calcFinancials(gita, { totalCents: 32500, legacySeats: 0 });

  assert.equal(f.ricaviStimati, 325);
  assert.equal(f.margineNetto, 96);
});

test("lo sconto di provincia abbassa i ricavi", () => {
  const f = calcFinancials(gita, { totalCents: 27000, legacySeats: 0 });

  assert.equal(f.ricaviStimati, 270);
  assert.equal(f.margineNetto, 41);
});

test("le prenotazioni senza snapshot ripiegano sul prezzo base per posto", () => {
  const f = calcFinancials(gita, { totalCents: 0, legacySeats: 2 });

  assert.equal(f.ricaviStimati, 300);
});

test("snapshot e righe storiche si sommano", () => {
  // Una prenotazione nuova da 90 € + un posto storico valorizzato a 150 €.
  const f = calcFinancials(
    { ...gita, adherentsCount: 2 },
    { totalCents: 9000, legacySeats: 1 },
  );

  assert.equal(f.ricaviStimati, 240);
});

test("senza prenotazioni i ricavi sono zero e il margine è la perdita secca", () => {
  const f = calcFinancials(
    { ...gita, adherentsCount: 0 },
    { totalCents: 0, legacySeats: 0 },
  );

  assert.equal(f.ricaviStimati, 0);
  assert.equal(f.costiVariabili, 0);
  // Restano i costi fissi: veicolo + altri costi.
  assert.equal(f.margineNetto, -154);
});

test("i centesimi non perdono precisione", () => {
  const f = calcFinancials(
    { ...gita, adherentsCount: 3 },
    { totalCents: 33333, legacySeats: 0 },
  );

  assert.equal(f.ricaviStimati, 333.33);
});

test("i costi per persona restano legati ai posti occupati", () => {
  // Il bambino paga meno ma pasto e ingresso li consuma comunque.
  const ridotto = calcFinancials(gita, { totalCents: 24000, legacySeats: 0 });
  const pieno = calcFinancials(gita, { totalCents: 30000, legacySeats: 0 });

  assert.equal(ridotto.costiVariabili, pieno.costiVariabili);
});
