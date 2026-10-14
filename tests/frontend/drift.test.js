import test from "node:test";
import assert from "node:assert/strict";

import { createStepApp } from "../../frontend/src/adapters/stepAdapter.js";

test("detectDrift: no drift when provenance matches current seeds", () => {
  const app = createStepApp();
  app.init();
  const { provenance } = app.freezePayload();
  assert.deepEqual(app.detectDrift(provenance), []);
});

test("detectDrift: flags a changed seed component", () => {
  const app = createStepApp();
  app.init();
  const drift = app.detectDrift({
    "equipment.profile": { source_template_id: "herms-30l", source_revision: "deadbeef" },
  });
  assert.equal(drift.length, 1);
  assert.equal(drift[0].selectionNodeId, "equipment.profile");
  assert.equal(drift[0].templateId, "herms-30l");
  assert.equal(drift[0].reason, "changed");
});

test("detectDrift: flags a missing seed component", () => {
  const app = createStepApp();
  app.init();
  const drift = app.detectDrift({
    "equipment.profile": { source_template_id: "does-not-exist", source_revision: "x" },
  });
  assert.equal(drift.length, 1);
  assert.equal(drift[0].reason, "missing");
});
