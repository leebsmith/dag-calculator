// Cross-layer ion constraints: the grid's target column must be driven by the
// same constraint set the backend solver actually enforces. The fixture is
// generated from observed solver behaviour
// (tests/backend/conformance/test_water_routing.py), so a routing change fails
// here until the presentation table catches up.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createStepApp } from "../../frontend/src/adapters/stepAdapter.js";
import { WATER_IONS } from "../../frontend/src/views/registry/water.js";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/ion-constraints.json", import.meta.url), "utf8")
);

const PIN_BY_ION = Object.fromEntries(WATER_IONS.map((row) => [row.ion, row.pin]));
const ION_BY_PIN = Object.fromEntries(WATER_IONS.map((row) => [row.pin, row.ion]));

function gridFor(strategy, pins = []) {
  const app = createStepApp();
  app.boot();
  app.setRoot("water.strategy", strategy);
  for (const ion of Object.keys(PIN_BY_ION)) {
    app.setRoot(`water.target.${ion}`, fixture.target[PIN_BY_ION[ion]]);
  }
  for (const pin of pins) app.toggleWaterPin(pin);
  app.compute();
  return app.waterSummary.ions;
}

function constrained(rows) {
  return rows
    .filter((row) => row.status !== "Auto")
    .map((row) => PIN_BY_ION[row.ion])
    .sort();
}

test("the grid's constrained rows equal the solver's observed constraint set", () => {
  for (const mode of ["CALCIUM_FLOOR", "FLAVOR", "HYBRID"]) {
    const rows = gridFor(mode);
    assert.deepEqual(constrained(rows), [...fixture.modes[mode]].sort(), mode);
    for (const row of rows) {
      const expected =
        row.status === "Auto"
          ? "Auto"
          : mode === "HYBRID" && PIN_BY_ION[row.ion] === "alk"
            ? "Buffer"
            : "Target";
      assert.equal(row.status, expected, `${mode}/${row.ion}`);
    }
  }
});

test("BASELINE constrains nothing, matching the solver", () => {
  const rows = gridFor("BASELINE");
  assert.deepEqual(constrained(rows), fixture.modes.BASELINE);
  for (const row of rows) assert.equal(row.targetText, "(Auto)");
});

test("OPTIMIZE targets all six but holds none exactly", () => {
  const rows = gridFor("OPTIMIZE");
  for (const row of rows) assert.equal(row.status, "Best fit", row.ion);
  assert.deepEqual(fixture.modes.OPTIMIZE, [], "least squares holds nothing exactly");
});

test("CUSTOM constrains exactly the pinned ions", () => {
  for (const [key, expected] of Object.entries(fixture.pin_examples)) {
    const pins = key.split(",");
    const rows = gridFor("CUSTOM", pins);
    assert.deepEqual(constrained(rows), [...expected].sort(), key);
    for (const row of rows) {
      if (!pins.includes(PIN_BY_ION[row.ion])) assert.equal(row.targetText, "(Auto)");
    }
  }
});

test("every fixture ion maps to a grid row and back", () => {
  const rows = gridFor("CALCIUM_FLOOR");
  assert.deepEqual(
    rows.map((row) => row.ion).sort(),
    Object.keys(PIN_BY_ION).sort()
  );
  for (const mode of Object.keys(fixture.modes)) {
    for (const pin of fixture.modes[mode]) {
      assert.ok(ION_BY_PIN[pin], `fixture ion "${pin}" has no grid row`);
    }
  }
});
