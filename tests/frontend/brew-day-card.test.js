import test from "node:test";
import assert from "node:assert/strict";

import { createTestApp, withFreshApp } from "./appHelpers.js";

function rowsOf(payload) {
  return payload.phases.flatMap((phase) =>
    phase.sections.flatMap((section) => section.rows)
  );
}

test("brew checklist starts with three phases, fourteen sections and every step", withFreshApp(async (app) => {
  assert.equal(app.brewDayRows.length, 94);
  assert.deepEqual(
    app.brewDaySections.map((phase) => phase.name),
    ["Before brew day", "Brew day", "After brew day", "Observation Log"]
  );
  assert.equal(app.brewDaySections[0].sections.length, 5);
  assert.equal(app.brewDaySections[1].sections.length, 6);
  assert.equal(app.brewDaySections[2].sections.length, 3);
  assert.equal(app.brewDaySections[3].sections.length, 1);
  assert.ok(app.brewDayRows.every((row) => row.note === ""));
  assert.ok(app.brewDayRows.every((row) => row.skipped === false));
  assert.equal(app.brewDayLevel, "info");
}));

test("the level changes the rendered rows and the payload", withFreshApp(async (app) => {
  const infoRows = rowsOf(app.brewDayPayload);
  assert.ok(infoRows.length > 40);

  app.setBrewDayLevel("critical");
  const criticalRows = rowsOf(app.brewDayPayload);
  assert.equal(app.brewDayLevel, "critical");
  assert.ok(criticalRows.length > 0);
  assert.ok(criticalRows.length < infoRows.length);
  assert.ok(criticalRows.every((row) => row.level === "critical"));

  app.setBrewDayLevel("debug");
  assert.ok(rowsOf(app.brewDayPayload).length >= infoRows.length);
}));

test("notes, skips and skip reasons persist on the row", withFreshApp(async (app) => {
  app.setBrewDayNote("advance-prep", "Mill the night before");
  app.setBrewDaySkipped("advance-prep", true);
  app.setBrewDaySkipReason("advance-prep", "Bought pre-milled");

  assert.equal(app.brewDayRow("advance-prep").note, "Mill the night before");
  assert.equal(app.brewDayRow("advance-prep").skipped, true);
  assert.equal(app.brewDayRow("advance-prep").skip_reason, "Bought pre-milled");

  const row = rowsOf(app.brewDayPayload).find((entry) => entry.step_id === "advance-prep");
  assert.equal(row.note, "Mill the night before");
  assert.equal(row.skipped, true);
  assert.equal(row.skip_reason, "Bought pre-milled");
}));

test("accordion phases open and close independently", async () => {
  const app = createTestApp();
  await app.boot();
  assert.equal(app.isBrewDaySectionOpen("pre"), true);
  assert.equal(app.isBrewDaySectionOpen("brew"), false);

  app.toggleBrewDaySection("brew");
  app.toggleBrewDaySection("pre");

  assert.equal(app.isBrewDaySectionOpen("pre"), false);
  assert.equal(app.isBrewDaySectionOpen("brew"), true);
});

test("draft and freeze payloads include the checklist rows", withFreshApp(async (app) => {
  app.setBrewDayNote("batch-sparge", "Sparge slowly");

  const draftRows = app.draftState().collections["batch.brew_checklist"];
  assert.equal(draftRows.length, 94);
  assert.equal(draftRows.find((row) => row.step_id === "batch-sparge").note, "Sparge slowly");

  const frozenRows = app.freezePayload().valuation["batch.brew_checklist"];
  assert.equal(frozenRows.find((row) => row.step_id === "batch-sparge").note, "Sparge slowly");
}));

test("loadState migrates the retired brew-day collection", async () => {
  const app = createTestApp();
  await app.boot();

  await app.loadState({
    collections: {
      "batch.brew_day_steps": [
        {
          step_id: "batch-sparge",
          section: "mashing",
          name: "Batch Sparge",
          enabled: true,
          instructions: "Sparge slowly",
        },
      ],
    },
  });

  assert.equal(app.brewDayRows.length, 94);
  assert.equal(app.brewDayRow("batch-sparge").note, "Sparge slowly");
  assert.equal(app.brewDayRow("advance-prep").note, "");
  assert.equal(app.draftState().collections["batch.brew_day_steps"], undefined);
});

test("teardown restores the empty defaults", withFreshApp(async (app) => {
  app.setBrewDayNote("whirlpool", "Hold the whirlpool rest");
  app.setBrewDaySkipped("whirlpool", true);
  app.teardown();

  assert.ok(app.brewDayRows.every((row) => row.note === ""));
  assert.ok(app.brewDayRows.every((row) => row.skipped === false));
}));
