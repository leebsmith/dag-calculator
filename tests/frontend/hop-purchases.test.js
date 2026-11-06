import test from "node:test";
import assert from "node:assert/strict";

import { dryHopPurchaseRow, hopPurchaseGroups } from "../../frontend/src/views/producer/hopPurchases.js";

const row = (overrides) => ({
  id: "citra",
  name: "Citra",
  form: "t90_pellet",
  massKg: null,
  volumeMl: null,
  ...overrides,
});

test("the same product sums across stages", () => {
  const groups = hopPurchaseGroups([
    row({ massKg: 0.05 }),
    row({ massKg: 0.03 }),
    row({ massKg: 0.02 }),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].basis, "mass");
  assert.equal(groups[0].totalKg, 0.1);
  assert.equal(groups[0].resolved, true);
});

test("different products and forms stay separate", () => {
  const groups = hopPurchaseGroups([
    row({ id: "citra", name: "Citra", massKg: 0.05 }),
    row({ id: "cryo-citra", name: "Cryo Citra", form: "lupulin_pellet", massKg: 0.02 }),
    row({ id: "simcoe", name: "Simcoe", massKg: 0.01 }),
  ]);

  assert.deepEqual(
    groups.map((group) => group.name),
    ["Citra", "Cryo Citra", "Simcoe"]
  );
});

test("unresolved and volume lines do not join the mass total", () => {
  const groups = hopPurchaseGroups([
    row({ massKg: 0.05 }),
    row({ massKg: null }),
    row({ unit: "ml", volumeMl: 30 }),
  ]);

  assert.deepEqual(
    groups.map((group) => group.basis),
    ["mass", "volume", "unresolved"]
  );
  assert.equal(groups[0].totalKg, 0.05);
  assert.equal(groups[1].totalMl, 30);
  assert.equal(groups[2].resolved, false);
});

test("dry hops normalise by unit, with ml kept as volume", () => {
  const massKgOf = (quantity, unit) => (unit === "oz" ? quantity * 0.028349523125 : quantity / 1000);
  const grams = dryHopPurchaseRow(
    { hop_id: "citra", variety: "Citra", product_type: "t90_pellet", quantity: 56, unit: "g" },
    massKgOf
  );
  const ounces = dryHopPurchaseRow(
    { hop_id: "mosaic", variety: "Mosaic", product_type: "lupulin_pellet", quantity: 2, unit: "oz" },
    massKgOf
  );
  const millilitres = dryHopPurchaseRow(
    { hop_id: "extract", variety: "Extract", quantity: 30, unit: "ml" },
    massKgOf
  );

  assert.ok(Math.abs(grams.massKg - 0.056) < 1e-12);
  assert.ok(Math.abs(ounces.massKg - 0.05669904625) < 1e-12);
  assert.equal(millilitres.volumeMl, 30);
  assert.equal(millilitres.massKg, undefined);
});

test("zero uses are dropped and rows sort by name and form", () => {
  const groups = hopPurchaseGroups([
    row({ name: "Simcoe", id: "simcoe", form: "t90_pellet", massKg: 0.01 }),
    row({ name: "Citra", id: "citra", form: "t90_pellet", massKg: 0 }),
    row({ name: "Amarillo", id: "amarillo", form: "t90_pellet", massKg: 0.02 }),
  ]);

  assert.deepEqual(
    groups.map((group) => group.name),
    ["Amarillo", "Simcoe"]
  );
});
