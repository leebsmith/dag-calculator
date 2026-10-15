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
});

test("unitDecimals falls back to dimension-level precision", () => {
  // grain_color/beer_color carry a dimension-level default (1) for both units.
  assert.equal(unitDecimals("grain_color", "EBC"), 1);
  assert.equal(unitDecimals("grain_color", "Lovibond"), 1);
});

test("unitDecimals is null where no precision is declared", () => {
  assert.equal(unitDecimals("mass", "kg"), null);
  assert.equal(unitDecimals("unknown_dimension", "x"), null);
});

test("gravity readouts use the active unit's precision (SG=3, °P=1)", () => {
  const app = createStepApp();
  app.boot();
  const anchor = (id) =>
    app.fieldsBySlice.batch
      .find((f) => f.id === "derived-anchors")
      .rows.find((r) => r.cells.label.text === id).cells.value;

  // Default unit is Plato → one decimal.
  assert.equal(anchor("Post-Boil Gravity (incl. late additions, if any)").display, "13.6");

  // Switching to SG → three decimals.
  app.setUnit("gravity", "SG");
  assert.equal(anchor("Post-Boil Gravity (incl. late additions, if any)").display, "1.055");
});
