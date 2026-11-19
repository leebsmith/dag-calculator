// The bract floor is a physical composition rule, not a sensory score: YCH's
// benchmark keeps 25 g of T-90 per 40 g of Cryo so the vegetative polyphenol and
// tannin structure survives the conversion. It must never fire when there is no
// lupulin, and the remedy has to be the arithmetic the shortfall implies.

import test from "node:test";
import assert from "node:assert/strict";

import {
  bractFloorLine,
  bractFloorShort,
} from "../../frontend/src/views/producer/hopBract.js";

const grams = (kg, unit) => `${(kg * 1000).toFixed(1)} ${unit}`;

const readout = (bractKg, lupulinKg, shortfallKg = 0, ratio = 0.625) =>
  bractFloorLine({
    bractKg,
    lupulinKg,
    floorKg: ratio * lupulinKg,
    shortfallKg,
    ratio,
    formatMass: grams,
  });

test("no lupulin means no readout", () => {
  assert.equal(readout(0.05, 0), "");
  assert.equal(readout(0.05, null), "");
});

test("a satisfied floor shows the composition without a warning", () => {
  const line = readout(0.025, 0.04);
  assert.match(line, /Hot-side bract 25\.0 g/);
  assert.match(line, /lupulin 40\.0 g/);
  assert.match(line, /floor 25\.0 g \(0\.625 × lupulin\)/);
  assert.doesNotMatch(line, /Short/);
  assert.equal(bractFloorShort(0), false);
});

test("a shortfall names both remedies in grams", () => {
  // 10 g bract against 40 g lupulin: floor is 25 g, so 15 g missing, and
  // converting 15/(1+0.625) = 9.23 g of lupulin would close it.
  const line = readout(0.01, 0.04, 0.015);
  assert.match(line, /10\.0 g/);
  assert.match(line, /25\.0 g/);
  assert.match(line, /Short 15\.0 g/);
  assert.match(line, /add ≥ 15\.0 g T-90/);
  assert.match(line, /convert 9\.2 g lupulin/);
  assert.equal(bractFloorShort(0.015), true);
});

test("a zero or missing ratio never shows a readout", () => {
  assert.equal(readout(0.01, 1, 0, 0), "");
  assert.equal(
    bractFloorLine({
      bractKg: 0.01,
      lupulinKg: 1,
      floorKg: null,
      shortfallKg: 0,
      ratio: null,
      formatMass: grams,
    }),
    ""
  );
  assert.equal(bractFloorShort(null), false);
});
