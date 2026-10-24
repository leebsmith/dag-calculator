import test from "node:test";
import assert from "node:assert/strict";

import { unitDecimals } from "../../frontend/src/views/registry/units.js";
import { createStepApp } from "../../frontend/src/adapters/stepAdapter.js";

// Per-unit display precision: precision belongs to the unit, not the dimension,
// so the same field shows a different number of digits when its unit changes.

test("unitDecimals resolves per-unit precision", () => {
  assert.equal(unitDecimals("gravity", "SG"), 3);
  assert.equal(unitDecimals("gravity", "Plato"), 1);
  assert.equal(unitDecimals("volume", "L"), 1);
  assert.equal(unitDecimals("volume", "gal"), 1);
  assert.equal(unitDecimals("temperature", "degF"), 1);
  assert.equal(unitDecimals("temperature_delta", "dF"), 1);
  assert.equal(unitDecimals("mass", "lb"), 2);
  assert.equal(unitDecimals("mass", "oz"), 2);
  assert.equal(unitDecimals("mass", "g"), 1);
});

test("unitDecimals falls back to dimension-level precision", () => {
  assert.equal(unitDecimals("grain_color", "EBC"), 1);
  assert.equal(unitDecimals("grain_color", "Lovibond"), 1);
  assert.equal(unitDecimals("mass", "kg"), 1);
  assert.equal(unitDecimals("ibu", "IBU"), 1);
  assert.equal(unitDecimals("abv", "pct"), 1);
  assert.equal(unitDecimals("ph", "pH"), 2);
  assert.equal(unitDecimals("percentage", "pct"), 1);
  assert.equal(unitDecimals("percentage", "fraction"), 3);
  assert.equal(unitDecimals("time", "min"), 0);
  assert.equal(unitDecimals("time", "hr"), 1);
});

test("unitDecimals is null where no precision is declared", () => {
  assert.equal(unitDecimals("dimensionless", "1"), null);
  assert.equal(unitDecimals("unknown_dimension", "x"), null);
});

test("gravity readouts use the active unit's precision (SG=3, °P=1)", () => {
  const app = createStepApp();
  app.boot();
  const gravity = () => app.fieldsBySlice.batch.find((f) => f.id === "solver.batch.sg_post_boil");

  // Default unit is Plato → one decimal.
  assert.equal(gravity().display, "13.6");

  // Switching to SG → three decimals.
  app.setUnit("gravity", "SG");
  assert.equal(gravity().display, "1.055");
});

test("editable number inputs render their natural value (no fixed-decimal padding)", () => {
  const app = createStepApp();
  app.boot();
  const field = () => app.fieldsBySlice.batch.find((f) => f.id === "batch.v_ferm");

  // The volume input must not be padded to the unit's 1-decimal precision, or a
  // debounced re-render would rewrite a mid-keystroke "6" into "6.0".
  assert.equal(field().display, "20");
  app.edit(field(), "6");
  assert.equal(field().display, "6");
});
