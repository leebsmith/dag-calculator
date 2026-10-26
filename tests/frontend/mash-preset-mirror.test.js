// The mash preset select is bound to a mirror: the engine writes "custom" from
// rest edits, and a live getter would freeze the select on the old preset.

import test from "node:test";
import assert from "node:assert/strict";

import { createTestApp } from "./appHelpers.js";

test("the mash preset is mirrored from the engine on refresh", () => {
  const app = createTestApp();
  app.boot();
  app.compute();

  assert.equal(app.mashPresetId, "single_infusion");
});

test("a rest edit moves the preset to custom and the mirror follows the refresh", () => {
  const app = createTestApp();
  app.boot();
  app.compute();

  app.toggleMashRest("beta_rest");
  app.compute();

  assert.equal(app.engine.get("mash.preset_id"), "custom");
  assert.equal(app.mashPresetId, "custom");
});

test("the preset select is a snapshot, not a live engine read", () => {
  const app = createTestApp();
  app.boot();
  app.compute();

  app.engine.setRoot("mash.preset_id", "custom");
  assert.equal(app.mashPresetId, "single_infusion", "the mirror only moves on refresh");

  app.compute();
  assert.equal(app.mashPresetId, "custom");
});
