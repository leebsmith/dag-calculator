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

test("pinDrift materializes overridable fields that changed since freeze", () => {
  const app = createStepApp();
  app.init();
  const drift = [{ selectionNodeId: "equipment.profile", templateId: "herms-30l", reason: "changed" }];
  const valuation = { "equipment.profile": { id: "herms-30l", mash_tun_mass_kg: 9.0 } };
  const overlays = app.pinDrift(valuation, drift);
  assert.deepEqual(overlays, { "equipment.profile": { mash_tun_mass_kg: 9.0 } });
});

test("pinDrift leaves unchanged overridable fields unpinned", () => {
  const app = createStepApp();
  app.init();
  const drift = [{ selectionNodeId: "equipment.profile", templateId: "herms-30l", reason: "changed" }];
  // frozen value equals the current seed (6.5) -> nothing to pin
  const valuation = { "equipment.profile": { id: "herms-30l", mash_tun_mass_kg: 6.5 } };
  assert.deepEqual(app.pinDrift(valuation, drift), {});
});
