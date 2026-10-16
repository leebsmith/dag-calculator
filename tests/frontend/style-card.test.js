import test from "node:test";
import assert from "node:assert/strict";

import { createStepApp } from "../../frontend/src/adapters/stepAdapter.js";

test("selectStyle seeds the envelope, fermentation, and fermentation targets", () => {
  const app = createStepApp();
  app.boot();
  app.selectStyle("21A");
  app.compute();

  assert.equal(app.master.getRoot("batch.style_id"), "21A");
  assert.equal(app.master.getRoot("batch.style_og_min"), 1.056);
  assert.equal(app.master.getRoot("batch.style_abv_max"), 7.5);
  assert.equal(app.master.getRoot("batch.fermentation"), "ale");

  const aa = app.master.getRoot("batch.apparent_attenuation");
  const abv = app.master.getRoot("batch.target_abv");
  assert.ok(typeof aa === "number" && aa > 0 && aa <= 1);
  assert.ok(typeof abv === "number" && abv >= 5.5 && abv <= 7.5);
});

test("clearStyleSelection clears the style id and resets fermentation", () => {
  const app = createStepApp();
  app.boot();
  app.selectStyle("21A");
  app.clearStyleSelection();
  app.compute();

  assert.equal(app.master.getRoot("batch.style_id"), "");
  assert.equal(app.master.getRoot("batch.fermentation"), "ale");
});

test("selecting a stats-less style does not seed fermentation targets", () => {
  const app = createStepApp();
  app.boot();
  app.selectStyle("34C");
  app.compute();

  assert.equal(app.master.getRoot("batch.style_id"), "34C");
  assert.equal(app.master.getRoot("batch.style_og_min"), undefined);
  assert.equal(app.master.getRoot("batch.apparent_attenuation"), undefined);
});
