// The oil charge is one equation and two constants. What it must never do is
// turn a missing figure into a zero: a hop whose oil nobody publishes is
// unpriced and counted, not silently cheap.

import test from "node:test";
import assert from "node:assert/strict";

import {
  hopOilLineText,
  lintRatio,
  oilChargeMgPerL,
  oilChargeSummary,
  oilFormBasis,
  oilFormMultiplier,
  terpeneAlcoholMgPerL,
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

test("a whole cone charge says its multiplier is assumed", () => {
  const rows = [
    { product_form: "whole_cone", mass_kg: 0.1, total_oil_ml_per_100g: 2 },
    { product_form: "t90_pellet", mass_kg: 0.1, total_oil_ml_per_100g: 2 },
  ];
  const line = hopOilLineText({ rows, volumeL: 20, constants, formatNumber: (v, d) => v.toFixed(d) });
  assert.match(line, /whole cone assumed/);
  const summary = oilChargeSummary({ rows, volumeL: 20, constants });
  assert.equal(summary.assumed, 1);
});

test("a terpene alcohol is its share of the oil the charge adds", () => {
  assert.ok(close(terpeneAlcoholMgPerL({ oilMgPerL: 100, fractionOfOil: 0.015 }), 1.5));
  assert.equal(terpeneAlcoholMgPerL({ oilMgPerL: 100, fractionOfOil: 0 }), 0);
});

test("an absent fraction is null and a measured zero is not", async () => {
  const { oilComponentCharges } = await import("../../frontend/src/views/producer/hopOil.js");
  const [absent, zero] = oilComponentCharges({
    rows: [
      { product_form: "t90_pellet", mass_kg: 0.1, total_oil_ml_per_100g: 2 },
      { product_form: "t90_pellet", mass_kg: 0.1, total_oil_ml_per_100g: 2, linalool_pct_of_oil: 0 },
    ],
    volumeL: 20,
    constants,
  });
  assert.equal(absent.linalool, null);
  assert.equal(zero.linalool, 0);
});

test("a fraction without an oil figure stays unpriced", async () => {
  const { oilComponentCharges } = await import("../../frontend/src/views/producer/hopOil.js");
  const [charge] = oilComponentCharges({
    rows: [{ product_form: "t90_pellet", mass_kg: 0.1, linalool_pct_of_oil: 0.01 }],
    volumeL: 20,
    constants,
  });
  assert.equal(charge.oil, null);
  assert.equal(charge.linalool, null);
});

test("one charge's L/G is its fractions' ratio, because the oil cancels", () => {
  const charges = [{ oil: 50, linalool: 50 * 0.015, geraniol: 50 * 0.005 }];
  const lint = lintRatio(charges);
  assert.ok(close(lint.ratio, 3));
  assert.equal(lint.priced, 1);
  assert.equal(lint.total, 1);
});

test("a charge missing either fraction drops out of the ratio and is counted", () => {
  const charges = [
    { linalool: 0.75, geraniol: 0.25 },
    { linalool: 0.5, geraniol: null },
    { linalool: null, geraniol: 0.4 },
  ];
  const lint = lintRatio(charges);
  assert.equal(lint.ratio, 3);
  assert.equal(lint.priced, 1);
  assert.equal(lint.total, 3);
});

test("the ratio is oil-mass weighted, so a large charge dominates", () => {
  const small = { linalool: 0.9, geraniol: 0.1 };
  const large = { linalool: 0.2, geraniol: 0.8 };
  const lint = lintRatio([small, large]);
  assert.ok(close(lint.ratio, 1.1 / 0.9));
  assert.ok(lint.ratio < 9, "a tiny charge must not set the blend ratio on its own");
});

test("no geraniol anywhere is a null ratio, never a division by zero", () => {
  assert.equal(lintRatio([{ linalool: 0.9, geraniol: 0 }]).ratio, null);
  assert.equal(lintRatio([]).ratio, null);
});

test("the line reports the terpenes and the ratio when the hops carry them", () => {
  const rows = [
    { product_form: "t90_pellet", mass_kg: 0.1, total_oil_ml_per_100g: 2, linalool_pct_of_oil: 0.015, geraniol_pct_of_oil: 0.005 },
    { product_form: "t90_pellet", mass_kg: 0.1, total_oil_ml_per_100g: 2, linalool_pct_of_oil: 0.005, geraniol_pct_of_oil: 0.01 },
  ];
  const line = hopOilLineText({ rows, volumeL: 20, constants, formatNumber: (v, d) => v.toFixed(d) });
  assert.match(line, /linalool 1\.70 \+ geraniol 1\.27 mg\/L/);
  assert.match(line, /L\/G 1\.33/);
});

test("the line says how many charges the ratio could price", () => {
  const rows = [
    { product_form: "t90_pellet", mass_kg: 0.1, total_oil_ml_per_100g: 2, linalool_pct_of_oil: 0.01, geraniol_pct_of_oil: 0.005 },
    { product_form: "t90_pellet", mass_kg: 0.1, total_oil_ml_per_100g: 2, linalool_pct_of_oil: 0.01 },
  ];
  const line = hopOilLineText({ rows, volumeL: 20, constants, formatNumber: (v, d) => v.toFixed(d) });
  assert.match(line, /L\/G 2\.00 \(1 of 2\)/);
});

test("a bill without fractions keeps the oil line it had", () => {
  const rows = [{ product_form: "t90_pellet", mass_kg: 0.1, total_oil_ml_per_100g: 2 }];
  const line = hopOilLineText({ rows, volumeL: 20, constants, formatNumber: (v, d) => v.toFixed(d) });
  assert.equal(line, "oil added 85.0 mg/L · kettle");
});
