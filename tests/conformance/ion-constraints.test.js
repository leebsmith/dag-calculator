// Cross-layer ion constraints: the grid's checked set must be the same
// constraint set the backend solver enforces. The fixture is generated from
// observed solver behaviour (tests/backend/conformance/test_water_routing.py),
// so a routing change fails here until the presentation table catches up.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createStepApp } from "../../frontend/src/adapters/stepAdapter.js";
import { WATER_IONS, strategyForHeld } from "../../frontend/src/views/registry/water.js";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/ion-constraints.json", import.meta.url), "utf8")
);

const PIN_BY_ION = Object.fromEntries(WATER_IONS.map((row) => [row.ion, row.pin]));
const ION_BY_PIN = Object.fromEntries(WATER_IONS.map((row) => [row.pin, row.ion]));
const ALL_PINS = WATER_IONS.map((row) => row.pin);

function appFor(pins) {
  const app = createStepApp();
  app.boot();
  app.selectWaterTarget("freeform");
  for (const ion of Object.keys(PIN_BY_ION)) {
    app.setRoot(`water.target.${ion}`, fixture.target[PIN_BY_ION[ion]]);
  }
  for (const pin of pins) app.toggleWaterTarget(pin);
  app.compute();
  return app;
}

function constrained(rows) {
  return rows
    .filter((row) => row.status !== "Auto" && row.status !== "No value")
    .map((row) => PIN_BY_ION[row.ion])
    .sort();
}

test("the checked set routes to the solver's observed constraint set", () => {
  const cases = [
    { mode: "BASELINE", pins: [] },
    { mode: "CALCIUM_FLOOR", pins: fixture.modes.CALCIUM_FLOOR },
    { mode: "HYBRID", pins: fixture.modes.HYBRID },
    { mode: "OPTIMIZE", pins: ALL_PINS },
  ];
  for (const { mode, pins } of cases) {
    const app = appFor(pins);
    assert.equal(app.waterSummary.mode, mode, mode);
    assert.equal(app.waterSummary.ions.length, WATER_IONS.length, mode);
    if (mode === "OPTIMIZE") {
      for (const row of app.waterSummary.ions) assert.equal(row.status, "Best fit", row.ion);
      assert.deepEqual(fixture.modes.OPTIMIZE, [], "least squares holds nothing exactly");
      continue;
    }
    assert.deepEqual(constrained(app.waterSummary.ions), [...pins].sort(), mode);
    for (const row of app.waterSummary.ions) {
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
  const app = appFor([]);
  assert.deepEqual(constrained(app.waterSummary.ions), fixture.modes.BASELINE);
  for (const row of app.waterSummary.ions) assert.equal(row.valueText, "(Auto)");
});

test("CUSTOM constrains exactly the checked ions", () => {
  for (const [key, expected] of Object.entries(fixture.pin_examples)) {
    const pins = key.split(",");
    const app = appFor(pins);
    assert.equal(app.waterSummary.mode, "CUSTOM", key);
    assert.deepEqual(constrained(app.waterSummary.ions), [...expected].sort(), key);
    for (const row of app.waterSummary.ions) {
      if (!pins.includes(PIN_BY_ION[row.ion])) assert.equal(row.status, "Auto");
    }
  }
});

test("FLAVOR is not reachable: the checked set cannot express a floor-less pair", () => {
  assert.equal(strategyForHeld(["so4", "cl"]), "CALCIUM_FLOOR");
  assert.ok(fixture.modes.FLAVOR.length > 0, "fixture still documents the legacy alias");
});

test("every fixture ion maps to a grid row and back", () => {
  const app = appFor(["so4", "cl"]);
  assert.deepEqual(
    app.waterSummary.ions.map((row) => row.ion).sort(),
    Object.keys(PIN_BY_ION).sort()
  );
  for (const pins of Object.values(fixture.modes)) {
    for (const pin of pins) assert.ok(ION_BY_PIN[pin], `fixture ion "${pin}" has no grid row`);
  }
});
