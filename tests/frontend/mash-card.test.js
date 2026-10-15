import test from "node:test";
import assert from "node:assert/strict";

import { createStepApp } from "../../frontend/src/adapters/stepAdapter.js";
import { MASH_PRESETS } from "../../frontend/src/views/mash.js";

test("mash card defaults to a single-infusion schedule with all canonical rests", async () => {
  const app = createStepApp();
  await app.boot();

  assert.equal(app.mashPresetId, "single_infusion");

  // The collection carries every canonical rest (dough-in + 7 optional + mash-out).
  const ids = app.mashRests.map((r) => r.rest_id);
  assert.deepEqual(
    new Set(ids),
    new Set(["dough_in", "phytase", "ferulic", "beta_glucan", "protein", "beta_amylase", "alpha_amylase", "beta_alpha_amylase", "mash_out"])
  );

  // Bookends are always enabled; the single-infusion rest is the sole optional.
  const enabled = app.enabledMashRests.map((r) => r.rest_id).sort();
  assert.deepEqual(enabled, ["beta_alpha_amylase", "dough_in", "mash_out"].sort());

  // Dough-in target is derived from the first enabled optional rest (67 °C).
  assert.equal(app.doughInInheritedTempC, 67.0);
  assert.equal(app.doughInDisplay, "67.0");

  // Total mash time sums enabled durations (0 + 60 + 10).
  assert.equal(app.totalMashTimeMin, 70);

  // LoA is a duration-weighted single-infusion estimate (67 °C -> 74.28%).
  assert.ok(Math.abs(app.limitOfAttenuation - 0.7428) < 1e-4, `loa=${app.limitOfAttenuation}`);
});

test("onMashPresetChange applies a named preset and seeds default temps", async () => {
  const app = createStepApp();
  await app.boot();

  app.onMashPresetChange("german_pils");

  assert.equal(app.mashPresetId, "german_pils");
  const enabled = app.enabledMashRests.filter((r) => !["dough_in", "mash_out"].includes(r.rest_id));
  assert.deepEqual(enabled.map((r) => r.rest_id).sort(), ["alpha_amylase", "beta_amylase"].sort());

  const beta = app.mashRests.find((r) => r.rest_id === "beta_amylase");
  const alpha = app.mashRests.find((r) => r.rest_id === "alpha_amylase");
  assert.equal(beta.use_temp_c, 63.5);
  assert.equal(alpha.use_temp_c, 70.0);

  // Dough-in target now follows the lowest enabled rest.
  assert.equal(app.doughInInheritedTempC, 63.5);
});

test("toggleMashRest marks the schedule custom and seeds a default temp", async () => {
  const app = createStepApp();
  await app.boot();

  app.toggleMashRest("protein", true);

  assert.equal(app.mashPresetId, "custom");
  const protein = app.mashRests.find((r) => r.rest_id === "protein");
  assert.equal(protein.enabled, true);
  assert.equal(protein.use_temp_c, 52.0); // (50 + 54) / 2
});

test("Configure Rests modal is draft/cancel: Cancel discards, OK commits", async () => {
  const app = createStepApp();
  await app.boot();

  app.openMashModal();
  assert.equal(app.mashModalOpen, true);
  assert.ok(app.mashDraft.length > 0);

  // Editing the draft must not touch the engine.
  app.setMashDraftTemp("beta_alpha_amylase", "68.0");
  const live = app.mashRests.find((r) => r.rest_id === "beta_alpha_amylase");
  assert.equal(live.use_temp_c, 67.0, "live collection unchanged while drafting");

  // Cancel discards.
  app.closeMashModal();
  assert.equal(app.mashModalOpen, false);
  assert.equal(live.use_temp_c, 67.0);

  // OK commits and marks the schedule custom.
  app.openMashModal();
  app.setMashDraftTemp("beta_alpha_amylase", "68.0");
  app.commitMashSchedule();
  assert.equal(app.mashModalOpen, false);
  assert.equal(app.mashRests.find((r) => r.rest_id === "beta_alpha_amylase").use_temp_c, 68.0);
  assert.equal(app.mashPresetId, "custom");
});

test("MASH_PRESETS includes single_infusion and custom as bookends of the matrix", () => {
  assert.deepEqual(MASH_PRESETS.single_infusion, ["beta_alpha_amylase"]);
  assert.deepEqual(MASH_PRESETS.custom, []);
});

test("custom preset leaves the dough-in target unresolved (mash-out excluded)", async () => {
  const app = createStepApp();
  await app.boot();

  app.onMashPresetChange("custom");
  assert.equal(app.mashPresetId, "custom");
  assert.equal(app.doughInInheritedTempC, undefined);
  assert.equal(app.doughInDisplay, "");
  assert.equal(app.strikeWaterTempDisplay(), "");
});
