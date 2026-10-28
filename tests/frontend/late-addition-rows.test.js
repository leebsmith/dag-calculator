import test from "node:test";
import assert from "node:assert/strict";

import {
  columnValueLabel,
  LATE_SCALE_PINS,
  scaleEnvelopeClass,
  scaleEnvelopeState,
  scalePinLabel,
  sugarActive,
  sugarCatalogCountLabel,
  sugarEffectLabels,
  sugarTableCountLabel,
} from "../../frontend/src/views/producer/lateAdditionRows.js";

const EFFECT = {
  active: true,
  share: 0.125,
  ogPoints: 0.00421,
  fgPoints: 0,
  abvPoints: 0.314,
  gristKg: 0.62,
};

test("lateAdditionRows: the effect block prints signed deltas", () => {
  assert.deepEqual(sugarEffectLabels(EFFECT), {
    share: "12.5%",
    og: "+0.004",
    fg: "+0.000",
    abv: "+0.31%",
    grist: "0.62 kg",
  });
});

test("lateAdditionRows: a negative delta keeps its sign, a missing grist a dash", () => {
  const labels = sugarEffectLabels({ ...EFFECT, ogPoints: -0.004, gristKg: null });
  assert.equal(labels.og, "-0.004");
  assert.equal(labels.grist, "—");
});

test("lateAdditionRows: an inactive effect has no block", () => {
  assert.equal(sugarEffectLabels(null), null);
  assert.equal(sugarEffectLabels(undefined), null);
  assert.equal(sugarEffectLabels({ ...EFFECT, active: false }), null);
});

test("lateAdditionRows: the column label follows the display unit and precision", () => {
  assert.equal(columnValueLabel(1.234, { decimals: 2, unit: "kg" }), "1.23 kg");
  assert.equal(columnValueLabel(1.2, { decimals: 2, unit: "kg" }), "1.20 kg");
  assert.equal(columnValueLabel(1.234, { decimals: 2 }), "1.23");
  assert.equal(columnValueLabel(1.234, undefined), "1.234");
  assert.equal(columnValueLabel(1.234, { unit: "kg" }, 2), "1.23 kg");
});

test("lateAdditionRows: a sugar counts by mass or by its share weights", () => {
  assert.equal(sugarActive({}), false);
  assert.equal(sugarActive({ rows: [] }), false);
  assert.equal(sugarActive({ rows: [{ mass_kg: 0.5 }], intent: "dose" }), true);
  assert.equal(sugarActive({ rows: [{ mass_kg: 0 }], intent: "dose" }), false);

  assert.equal(
    sugarActive({ rows: [{ parts: 10 }], intent: "share", share: 0.2 }),
    true
  );
  assert.equal(
    sugarActive({ rows: [{ parts: 10 }], intent: "share", share: 0 }),
    false
  );
  assert.equal(
    sugarActive({ rows: [{ parts: 0 }], intent: "share", share: 0.2 }),
    false
  );
});

test("lateAdditionRows: the table and catalog counters keep their words", () => {
  assert.equal(sugarTableCountLabel(0), "No sugars");
  assert.equal(sugarTableCountLabel(1), "1 sugar");
  assert.equal(sugarTableCountLabel(2), "2 sugars");

  assert.equal(
    sugarCatalogCountLabel({ shown: 5, total: 7, truncated: true }),
    "Showing 5 of 7 sugars — refine search"
  );
  assert.equal(
    sugarCatalogCountLabel({ shown: 1, total: 1, truncated: false }),
    "Showing 1 sugar"
  );
});

test("lateAdditionRows: the preview pins label and class the style envelope", () => {
  assert.deepEqual(
    LATE_SCALE_PINS.map((pin) => pin.value),
    ["abv", "og", "fg"]
  );
  assert.equal(scalePinLabel("abv"), "ABV");
  assert.equal(scalePinLabel("ibu"), "ibu");

  assert.equal(scaleEnvelopeState(1.05, 1.04, 1.06), "in");
  assert.equal(scaleEnvelopeState(1.02, 1.04, 1.06), "out");
  assert.equal(scaleEnvelopeState(null, 1.04, 1.06), "na");
  assert.equal(scaleEnvelopeState("1.05", 1.04, 1.06), "na");

  assert.equal(scaleEnvelopeClass("out"), "text-danger");
  assert.equal(scaleEnvelopeClass("in"), "status-badge-success");
  assert.equal(scaleEnvelopeClass("na"), "");
});
