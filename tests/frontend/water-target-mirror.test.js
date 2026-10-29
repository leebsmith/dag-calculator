// The water target select is bound to mirrors: the engine drops the profile id
// without changing `waterTargetLocked`, and library syncs replace the option
// records. A live getter would freeze the select on the mounted state.

import test from "node:test";
import assert from "node:assert/strict";

import { sharedTestApp } from "./appHelpers.js";

function bootedApp() {
  return sharedTestApp();
}

test("the target options are mirrored from the reference cache", async () => {
  const app = await bootedApp();

  assert.ok(app.waterTargetOptions.length > 2);
  assert.equal(app.waterTargetOptions, app.waterTargetOptionsState);
  assert.deepEqual(
    app.waterTargetOptions.map((option) => option.value).slice(0, 1),
    ["none"]
  );
  assert.equal(app.waterTargetOptions.at(-1).value, "freeform");
});

test("a preset selection is mirrored on refresh", async () => {
  const app = await bootedApp();

  app.selectWaterTarget("hoppy-ipa");
  app.compute();

  assert.equal(app.engine.get("water.target_profile_id"), "hoppy-ipa");
  assert.equal(app.waterTargetSelection, "hoppy-ipa");
});

test("dropping the preset falls back to freeform after the refresh", async () => {
  const app = await bootedApp();
  app.selectWaterTarget("hoppy-ipa");
  app.compute();

  app.engine.setRoot("water.target_profile_id", "");
  assert.equal(app.waterTargetSelection, "hoppy-ipa", "the mirror only moves on refresh");

  app.compute();
  assert.equal(app.waterTargetSelection, "freeform");
});

test("the select is a snapshot, not a live engine read", async () => {
  const app = await bootedApp();
  app.selectWaterTarget("burton-ipa");
  app.compute();

  app.engine.setRoot("water.target_profile_id", "soft-pilsner");
  assert.equal(app.waterTargetSelection, "burton-ipa");

  app.compute();
  assert.equal(app.waterTargetSelection, "soft-pilsner");
});
