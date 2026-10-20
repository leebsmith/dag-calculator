import test from "node:test";
import assert from "node:assert/strict";

import { createStepApp } from "../../frontend/src/adapters/stepAdapter.js";
import { derivationsFor, seedDerivations } from "../../frontend/src/views/seedDerivations.js";

test("seedDerivations maps copy-in targets to their selection + derive", () => {
  const water = seedDerivations("water.source.alkalinity_as_caco3");
  assert.equal(water.length, 1);
  assert.equal(water[0].selection, "water.source_report");
  // the rename: source reads total_alkalinity_caco3
  assert.equal(water[0].derive({ total_alkalinity_caco3: 78 }), 78);

  // apparent attenuation has both yeast and style sources
  const atten = seedDerivations("batch.apparent_attenuation");
  assert.equal(atten.length, 2);
  assert.equal(atten[0].selection, "batch.yeast");
  assert.equal(atten[1].selection, "batch.style");
});

test("derivationsFor returns the roots seeded from a selection", () => {
  const yeast = derivationsFor("batch.yeast");
  assert.deepEqual(yeast.map((d) => d.rootId), ["batch.apparent_attenuation"]);
});

test("water ions are seeded from a report, overridable, and resettable", () => {
  const app = createStepApp();
  app.boot();

  const reportField = () =>
    app.fieldsBySlice.water.find((f) => f.id === "water.source_report_id");
  const calcium = () =>
    app.fieldsBySlice.water.find((f) => f.id === "water.source.calcium_ca");

  app.edit(reportField(), "25138");
  assert.equal(calcium().value, 21.5, "copies the report's calcium");
  assert.equal(calcium().seeded, true, "marked seeded while it matches the report");
  assert.equal(calcium().seededSource, "Ward Laboratories, Inc.");

  app.edit(calcium(), "50");
  assert.equal(calcium().value, 50, "user override sticks");
  assert.equal(calcium().seeded, false, "divergence clears the seeded flag");
  assert.equal(calcium().seededValue, 21.5, "reset target retained");

  app.resetField(calcium());
  assert.equal(calcium().value, 21.5, "reset restores the report value");
  assert.equal(calcium().seeded, true);
});
