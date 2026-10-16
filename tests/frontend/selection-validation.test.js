import test from "node:test";
import assert from "node:assert/strict";

import { createStepApp } from "../../frontend/src/adapters/stepAdapter.js";

// Batch values seeded from a selected component are clamped to that component's
// envelope by the adapter (report-only relations live in the artifact).

test("HLT fill is clamped to the equipment envelope", () => {
  const app = createStepApp();
  app.boot();
  const field = () => app.fieldsBySlice.batch.find((f) => f.id === "batch.hlt_starting_volume_l");

  app.edit(field(), "50"); // > capacity (herms-30l max = 30 L)
  app.commitField(field());
  assert.equal(app.master.getRoot("batch.hlt_starting_volume_l"), 30);

  app.edit(field(), "1"); // < coil floor (4 L)
  app.commitField(field());
  assert.equal(app.master.getRoot("batch.hlt_starting_volume_l"), 4);
});

test("selecting a strain seeds apparent attenuation from its typical value", () => {
  const app = createStepApp();
  app.boot();
  app.selectYeast("fermentis-safale-american-ale-us-05");
  app.compute();
  assert.ok(Math.abs(app.master.getRoot("batch.apparent_attenuation") - 0.81) < 1e-9);
});

test("collection cells are validated against their schema domains", () => {
  const app = createStepApp();
  app.boot();
  const table = () => app.fieldsBySlice.fermentables.find((f) => f.control === "collection-table");

  // pct renders as a percentage, so 150 means 150% (base 1.5 > 1).
  app.editCell(table(), 0, "pct", "150");
  assert.ok(app.violationCount > 0);
  const row0 = table().rowValidations[0];
  assert.ok(row0.pct && !row0.pct.holds);
});
