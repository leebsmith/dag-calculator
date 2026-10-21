import test from "node:test";
import assert from "node:assert/strict";

import { createStepApp } from "../../frontend/src/adapters/stepAdapter.js";

test("brew day checklist starts with four sections and twelve disabled rows", async () => {
  const app = createStepApp();
  await app.boot();

  assert.equal(app.brewDaySections.length, 4);
  assert.equal(app.brewDayRows.length, 12);
  assert.deepEqual(
    app.brewDaySections.map((section) => section.name),
    ["Preparation", "Mashing & Lautering", "The Boil", "Knockout & Transfer"]
  );
  assert.equal(app.brewDaySections[0].steps.length, 2);
  assert.equal(app.brewDaySections[1].steps.length, 4);
  assert.ok(app.brewDayRows.every((row) => row.enabled === false));
  assert.ok(app.brewDayRows.every((row) => row.instructions === ""));
});

test("toggling a step updates the active count and grouped payload", async () => {
  const app = createStepApp();
  await app.boot();

  app.toggleBrewDayStep("advance-prep", true);

  assert.equal(app.brewDaySections[0].activeCount, 1);
  assert.equal(app.brewDaySections[1].activeCount, 0);
  assert.deepEqual(app.brewDayPayload, {
    process: "single_batch_batch_sparge",
    sections: [
      {
        id: "preparation",
        name: "Preparation",
        steps: [{ id: "advance-prep", name: "Advance Prep", instructions: "" }],
      },
    ],
  });

  app.setBrewDayInstruction("advance-prep", "Mill the night before");

  assert.equal(app.brewDayRow("advance-prep").instructions, "Mill the night before");
  assert.equal(
    app.brewDayPayload.sections[0].steps[0].instructions,
    "Mill the night before"
  );
});

test("accordion sections open and close independently", async () => {
  const app = createStepApp();
  await app.boot();

  assert.equal(app.isBrewDaySectionOpen("preparation"), true);
  assert.equal(app.isBrewDaySectionOpen("mashing"), false);

  app.toggleBrewDaySection("mashing");
  app.toggleBrewDaySection("preparation");

  assert.equal(app.isBrewDaySectionOpen("preparation"), false);
  assert.equal(app.isBrewDaySectionOpen("mashing"), true);
});

test("draft and freeze payloads include the checklist rows", async () => {
  const app = createStepApp();
  await app.boot();

  app.toggleBrewDayStep("batch-sparge", true);
  app.setBrewDayInstruction("batch-sparge", "Sparge slowly");

  const draftRows = app.draftState().collections["batch.brew_day_steps"];
  assert.equal(draftRows.length, 12);
  assert.equal(draftRows.find((row) => row.step_id === "batch-sparge").enabled, true);
  assert.equal(
    draftRows.find((row) => row.step_id === "batch-sparge").instructions,
    "Sparge slowly"
  );

  const frozenRows = app.freezePayload().valuation["batch.brew_day_steps"];
  assert.equal(frozenRows.find((row) => row.step_id === "batch-sparge").enabled, true);
  assert.equal(
    frozenRows.find((row) => row.step_id === "batch-sparge").instructions,
    "Sparge slowly"
  );
});

test("loadState hydrates stored rows and materializes the canonical order", async () => {
  const app = createStepApp();
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

  assert.equal(app.brewDayRows.length, 12);
  assert.equal(app.brewDayRow("batch-sparge").enabled, true);
  assert.equal(app.brewDayRow("batch-sparge").instructions, "Sparge slowly");
  assert.equal(app.brewDayRow("advance-prep").enabled, false);
});

test("teardown restores the disabled defaults", async () => {
  const app = createStepApp();
  await app.boot();

  app.toggleBrewDayStep("whirlpool", true);
  app.setBrewDayInstruction("whirlpool", "Hold the whirlpool rest");
  app.teardown();

  assert.ok(app.brewDayRows.every((row) => row.enabled === false));
  assert.ok(app.brewDayRows.every((row) => row.instructions === ""));
});
