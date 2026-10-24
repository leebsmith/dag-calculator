import test from "node:test";
import assert from "node:assert/strict";

import { createTestApp } from "./appHelpers.js";
import { MASH_PRESETS } from "../../frontend/src/views/mash.js";

test("mash card defaults to a single-infusion schedule with every canonical rest", async () => {
  const app = createTestApp();
  await app.boot();

  assert.equal(app.mashPresetId, "single_infusion");

  const ids = app.mashRests.map((r) => r.rest_id);
  assert.deepEqual(
    new Set(ids),
    new Set(["phytase", "ferulic", "beta_glucan", "protein", "beta_amylase", "alpha_amylase", "beta_alpha_amylase", "mash_out"])
  );

  const enabled = app.enabledMashRests.map((r) => r.rest_id).sort();
  assert.deepEqual(enabled, ["beta_alpha_amylase", "mash_out"].sort());

  assert.equal(app.doughInInheritedTempC, 67.0);
  assert.equal(app.doughInDisplay, "67.0");

  assert.equal(app.totalMashTimeMin, 70);
});

test("onMashPresetChange applies a preset, seeds durations, and leaves mash-out alone", async () => {
  const app = createTestApp();
  await app.boot();

  app.onMashPresetChange("german_pils");

  assert.equal(app.mashPresetId, "german_pils");
  const enabled = app.enabledMashRests.filter((r) => r.rest_id !== "mash_out");
  assert.deepEqual(enabled.map((r) => r.rest_id).sort(), ["alpha_amylase", "beta_amylase"].sort());

  const beta = app.mashRests.find((r) => r.rest_id === "beta_amylase");
  const alpha = app.mashRests.find((r) => r.rest_id === "alpha_amylase");
  const mashOut = app.mashRests.find((r) => r.rest_id === "mash_out");
  assert.equal(beta.use_temp_c, 63.5);
  assert.equal(alpha.use_temp_c, 70.0);
  assert.equal(beta.duration_min, 30);
  assert.equal(alpha.duration_min, 20);
  assert.equal(mashOut.enabled, true);

  assert.equal(app.doughInInheritedTempC, 63.5);
});

test("toggleMashRest marks the schedule custom, seeds temp and duration, and allows mash-out", async () => {
  const app = createTestApp();
  await app.boot();

  app.toggleMashRest("protein", true);

  assert.equal(app.mashPresetId, "custom");
  const protein = app.mashRests.find((r) => r.rest_id === "protein");
  assert.equal(protein.enabled, true);
  assert.equal(protein.use_temp_c, 52.0);
  assert.equal(protein.duration_min, 20);

  app.toggleMashRest("mash_out", false);
  assert.equal(app.mashRests.find((r) => r.rest_id === "mash_out").enabled, false);
});

test("dough-in target tracks ticked and configured rests", async () => {
  const app = createTestApp();
  await app.boot();

  app.toggleMashRest("beta_alpha_amylase", false);
  app.toggleMashRest("alpha_amylase", true);
  assert.equal(app.mashDoughInTempC, 70.0);
  assert.equal(app.doughInInheritedTempC, 70.0);
  assert.equal(app.doughInDisplay, "70.0");

  app.openMashModal();
  app.setMashDraftTemp("alpha_amylase", "69.0");
  app.commitMashSchedule();
  assert.equal(app.mashDoughInTempC, 69.0);
  assert.equal(app.doughInInheritedTempC, 69.0);
  assert.equal(app.doughInDisplay, "69.0");
});

test("Configure Rests modal is draft/cancel: Cancel discards, OK commits", async () => {
  const app = createTestApp();
  await app.boot();

  app.openMashModal();
  assert.equal(app.mashModalOpen, true);
  assert.ok(app.mashDraft.length > 0);

  app.setMashDraftTemp("beta_alpha_amylase", "68.0");
  const live = app.mashRests.find((r) => r.rest_id === "beta_alpha_amylase");
  assert.equal(live.use_temp_c, 67.0, "live collection unchanged while drafting");

  app.closeMashModal();
  assert.equal(app.mashModalOpen, false);
  assert.equal(live.use_temp_c, 67.0);

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

test("custom preset leaves the dough-in target unresolved and keeps mash-out", async () => {
  const app = createTestApp();
  await app.boot();

  app.onMashPresetChange("custom");
  assert.equal(app.mashPresetId, "custom");
  assert.equal(app.doughInInheritedTempC, undefined);
  assert.equal(app.doughInDisplay, "");
  assert.equal(app.strikeWaterTempDisplay(), "");
  assert.equal(app.mashRests.find((r) => r.rest_id === "mash_out").enabled, true);
});

test("mash temperature labels and ranges follow the unit tracker", async () => {
  const app = createTestApp();
  await app.boot();

  assert.equal(app.temperatureUnit, "°C");
  assert.equal(app.restTempRangeDisplay("beta_amylase"), "62–65");
  assert.equal(app.restTempRangeDisplay("alpha_amylase"), "68–72");

  app.setUnit("temperature", "degF");

  assert.equal(app.temperatureUnit, "°F");
  assert.equal(app.restTempRangeDisplay("beta_amylase"), "144–149");
  assert.equal(app.restTempRangeDisplay("alpha_amylase"), "154–162");

  app.setUnit("temperature", "degC");

  assert.equal(app.temperatureUnit, "°C");
  assert.equal(app.restTempRangeDisplay("beta_amylase"), "62–65");
});

test("mash draft temperatures parse in the active display unit", async () => {
  const app = createTestApp();
  await app.boot();
  app.openMashModal();
  app.setUnit("temperature", "degF");

  app.setMashDraftTemp("beta_amylase", "150");

  const row = app.mashDraftRow("beta_amylase");
  assert.ok(Math.abs(row.use_temp_c - (150 - 32) / 1.8) < 1e-9);
});
