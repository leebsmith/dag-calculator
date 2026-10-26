// Pin-matrix panel: visibility, pin switching, target edit/reset, captions.

import test from "node:test";
import assert from "node:assert/strict";

import { createTestApp } from "./appHelpers.js";

const SUGAR = {
  sugar_id: "dextrose",
  name: "Dextrose",
  mass_kg: 0.5,
  parts: 0,
  resolved_mass_kg: 0,
  yield_fraction: 0.9,
  yield_basis: "extract",
  yield_provenance: {},
  fermentability_fraction: 1,
  fermentability_provenance: {},
  fermentability_basis: "real",
  fermentability_method: "",
  color_lovibond: 0,
  notes: "",
};

async function appWithSugar() {
  const app = createTestApp();
  await app.boot();
  app.engine.setCollection("batch.sugars", [{ ...SUGAR }]);
  app.compute();
  return app;
}

test("the panel appears and opens when sugar is first authored", async () => {
  const app = await appWithSugar();
  assert.equal(app.latePinPanelVisible, true);
  assert.equal(app.latePinPanelOpen, true);
  assert.equal(app.scalePin, "abv");
  assert.equal(app.scalePreviewRows.length, 3);
  assert.equal(app.scalePreviewRows.filter((row) => row.active).length, 1);
});

test("the panel collapses when no sugar is active", async () => {
  const app = await appWithSugar();
  app.engine.setCollection("batch.sugars", []);
  app.compute();
  assert.equal(app.latePinPanelVisible, false);
  assert.equal(app.latePinPanelOpen, false);
});

test("the radios switch the persisted scale pin", async () => {
  const app = await appWithSugar();
  app.setScalePin("fg");
  app.compute();
  assert.equal(app.engine.get("batch.scale_pin"), "fg");
  assert.equal(app.activeScaleTargetRoot, "batch.target_fg");
  assert.equal(app.scalePreviewRows.find((row) => row.active).pin, "fg");
});

test("the active target edits and resets to the identity default", async () => {
  const app = await appWithSugar();
  app.setScalePin("og");
  app.compute();
  app.setScaleTarget("1.060");
  app.compute();
  assert.equal(app.engine.get("batch.target_og"), 1.06);
  app.resetScaleTarget();
  app.compute();
  assert.equal(app.engine.get("batch.target_og"), 1.05);
});

test("the composition caption follows dose and share", async () => {
  const app = await appWithSugar();
  assert.match(app.previewCompositionCaption, /kg sugar extract/);

  app.setRoot("batch.late_addition_intent", "share");
  app.setRoot("batch.sugar_extract_share", 0.1);
  app.engine.setCollection("batch.sugars", [{ ...SUGAR, mass_kg: 0, parts: 1 }]);
  app.compute();
  assert.match(app.previewCompositionCaption, /of extract/);
});
