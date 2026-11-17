// The oil charge is one equation and two constants. What it must never do is
// turn a missing figure into a zero: a hop whose oil nobody publishes is
// unpriced and counted, not silently cheap.

import test from "node:test";
import assert from "node:assert/strict";

import {
  oilChargeMgPerL,
  oilChargeSummary,
  oilFormBasis,
  oilFormMultiplier,
} from "../../frontend/src/views/producer/hopOil.js";
import { loadArtifact } from "./helpers.js";

const constants = loadArtifact().constants;

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test("the model reads its constants from the artifact", () => {
  assert.equal(constants.oil_density_g_per_ml.value, 0.85);
  assert.equal(constants.oil_form_multiplier_lupulin.value, 2.7);
});

test("a charge is mass × concentration × multiplier, in mg/L", () => {
  // 100 g of a 2 mL/100 g hop is 2 mL of oil; at 0.85 g/mL that is 1700 mg.
  assert.ok(
    close(
      oilChargeMgPerL({ massKg: 0.1, oilMlPer100g: 2, multiplier: 1, volumeL: 20, density: 0.85 }),
      85
    )
  );
  // Lupulin at the measured 2.7× carries 2.7 times as much per gram.
  assert.ok(
    close(
      oilChargeMgPerL({ massKg: 0.1, oilMlPer100g: 2, multiplier: 2.7, volumeL: 20, density: 0.85 }),
      229.5
    )
  );
});

test("a missing input is null, never zero", () => {
  assert.equal(oilChargeMgPerL({ massKg: 0.1, volumeL: 20, density: 0.85 }), null);
  assert.equal(
    oilChargeMgPerL({ massKg: 0.1, oilMlPer100g: 2, multiplier: null, volumeL: 20, density: 0.85 }),
    null
  );
  assert.equal(
    oilChargeMgPerL({ massKg: 0, oilMlPer100g: 2, multiplier: 1, volumeL: 20, density: 0.85 }),
    null
  );
  assert.equal(
    oilChargeMgPerL({ massKg: 0.1, oilMlPer100g: 2, multiplier: 1, volumeL: 0, density: 0.85 }),
    null
  );
});

test("the form supplies the multiplier, and the basis says why", () => {
  assert.equal(oilFormMultiplier("lupulin_pellet", constants), 2.7);
  assert.equal(oilFormMultiplier("t90_pellet", constants), 1);
  assert.equal(oilFormMultiplier("whole_cone", constants), 1);
  assert.equal(oilFormMultiplier("flowable_extract", constants), null);
  assert.equal(oilFormBasis("lupulin_pellet"), "measured");
  assert.equal(oilFormBasis("whole_cone"), "assumed");
  assert.equal(oilFormBasis("t90_pellet"), "reference");
  assert.equal(oilFormBasis("flowable_extract"), "unpublished");
});

test("a summary prices what it can and counts the rest", () => {
  const rows = [
    { product_form: "t90_pellet", mass_kg: 0.1, total_oil_ml_per_100g: 2 },
    { product_form: "lupulin_pellet", mass_kg: 0.05, total_oil_ml_per_100g: 3 },
    { product_form: "t90_pellet", mass_kg: 0.02 },
  ];
  const summary = oilChargeSummary({ rows, volumeL: 20, constants });
  assert.equal(summary.rows, 3);
  assert.equal(summary.priced, 2);
  assert.ok(summary.total > 0);
  assert.equal(summary.assumed, 0);
});

test("a whole cone charge says its multiplier is assumed", async () => {
  const { hopOilLineText } = await import("../../frontend/src/views/producer/hopOil.js");
  const rows = [
    { product_form: "whole_cone", mass_kg: 0.1, total_oil_ml_per_100g: 2 },
    { product_form: "t90_pellet", mass_kg: 0.1, total_oil_ml_per_100g: 2 },
  ];
  const line = hopOilLineText({ rows, volumeL: 20, constants, formatNumber: (v, d) => v.toFixed(d) });
  assert.match(line, /whole cone assumed/);
  const summary = oilChargeSummary({ rows, volumeL: 20, constants });
  assert.equal(summary.assumed, 1);
});
