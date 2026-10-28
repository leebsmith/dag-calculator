import test from "node:test";
import assert from "node:assert/strict";

import {
  hopAlphaInputValue,
  hopAlphaIsOutsideStock,
  hopAlphaLabel,
  hopAlphaStockLabel,
  hopBoilPctLabel,
  hopFormLabel,
  hopIbuLabel,
  hopMinutesLabel,
  hopPctLabel,
} from "../../frontend/src/views/producer/hopRows.js";

const ROW = {
  hop_id: "cascade",
  name: "Cascade",
  alpha_acid_pct: 0.065,
  boil_time_fraction: 0.5,
  minutes: 30,
  ibu: 12.25,
  pct: 0.5,
};

const STOCK = { alpha_acid_min_pct: 0.04, alpha_acid_max_pct: 0.07 };

test("hopRows: a formatted row prints every readout", () => {
  assert.equal(hopFormLabel(ROW), "T-90 pellets");
  assert.equal(hopAlphaLabel(ROW), "6.5%");
  assert.equal(hopAlphaInputValue(ROW), 6.5);
  assert.equal(hopBoilPctLabel(ROW), "50%");
  assert.equal(hopMinutesLabel(ROW), "30 min");
  assert.equal(hopIbuLabel(ROW), "12.3");
  assert.equal(hopPctLabel(ROW), "50.0%");
});

test("hopRows: a missing row degrades to the dash, never a number", () => {
  assert.equal(hopAlphaLabel(undefined), "—");
  assert.equal(hopAlphaInputValue(undefined), "");
  assert.equal(hopBoilPctLabel({}), "—");
  assert.equal(hopMinutesLabel({ minutes: null }), "—");
  assert.equal(hopIbuLabel({ ibu: null }), "—");
  assert.equal(hopPctLabel({}), "—");
});

test("hopRows: the product form falls back to the raw code", () => {
  assert.equal(hopFormLabel({ product_form: "flowable_extract" }), "Flowable CO₂ extract");
  assert.equal(hopFormLabel({}), "T-90 pellets");
  assert.equal(hopFormLabel({ product_form: "unknown_form" }), "unknown_form");
});

test("hopRows: the alpha band is context, never a gate", () => {
  assert.equal(hopAlphaStockLabel(STOCK), "stock 4.0–7.0%");
  assert.equal(hopAlphaStockLabel({ alpha_acid_min_pct: 0.04 }), "");
  assert.equal(hopAlphaStockLabel(undefined), "");

  assert.equal(hopAlphaIsOutsideStock(ROW, STOCK), false);
  assert.equal(hopAlphaIsOutsideStock({ ...ROW, alpha_acid_pct: 0.08 }, STOCK), true);
  assert.equal(hopAlphaIsOutsideStock({ ...ROW, alpha_acid_pct: 0.03 }, STOCK), true);
  assert.equal(hopAlphaIsOutsideStock(ROW, undefined), false);
  assert.equal(hopAlphaIsOutsideStock({ hop_id: "nope" }, STOCK), false);
});
