import test from "node:test";
import assert from "node:assert/strict";

import { createTestApp, sharedTestApp } from "./appHelpers.js";

test("number inputs keep raw text while editing and format on blur", async () => {
  const app = await sharedTestApp();
  const field = app.fieldsById["batch.boil_time_min"];

  app.editNumberInput("field:batch.boil_time_min", field, "1");
  assert.equal(app.inputDraft("field:batch.boil_time_min", field.display), "1");
  assert.equal(app.master.getRoot("batch.boil_time_min"), 1);

  app.editNumberInput("field:batch.boil_time_min", field, "17");
  app.editNumberInput("field:batch.boil_time_min", field, "170");
  assert.equal(app.inputDraft("field:batch.boil_time_min", field.display), "170");
  assert.equal(app.master.getRoot("batch.boil_time_min"), 170);

  app.commitNumberInput("field:batch.boil_time_min", field);
  assert.equal(app.inputDraft("field:batch.boil_time_min", field.display), field.display);
  assert.equal(app.master.getRoot("batch.boil_time_min"), 170);
});

test("draft grid cells keep raw text for the whirlpool temperature", async () => {
  const app = createTestApp();
  await app.boot();
  app.openWhirlpoolHopEditor();
  app.addCatalogWhirlpoolHop("cascade");

  const key = app.inputKey("draft", app.draftNodeId, 0, "initial_temp_c");
  app.editDraftCellInput(key, 0, "initial_temp_c", "170");
  assert.equal(app.draftDisplayRows[0].initial_temp_c, "170");

  app.commitDraftCellInput(key);
  assert.equal(app.draftDisplayRows[0].initial_temp_c, "170.0");
});

test("collection cells keep raw text while editing", async () => {
  const app = await sharedTestApp();
  app.openHopEditor();
  app.addCatalogHop("cascade");
  app.saveHopEditor();
  app.compute();

  const field = app.fieldsBySlice.fermentables.find((f) => f.id === "grist.major_malts");
  const key = app.inputKey("cell", field.id, 0, "parts");
  app.editCellInput(key, field, 0, "parts", "12.");
  assert.equal(app.inputDraft(key, field.rows[0].parts), "12.");
  app.commitCellInput(key);
  assert.equal(app.inputDraft(key, "fallback"), "fallback");
});
