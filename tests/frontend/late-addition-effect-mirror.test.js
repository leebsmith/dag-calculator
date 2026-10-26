// The late-additions readouts are refresh-time snapshots. Templates bind the
// display object, so a getter that reads the engine directly would register no
// Alpine dependency and freeze at its first render.

import test from "node:test";
import assert from "node:assert/strict";

import { createTestApp } from "./appHelpers.js";

const ROW = {
  sugar_id: "dextrose",
  name: "Dextrose",
  mass_kg: 0.45,
  parts: 100,
  resolved_mass_kg: 0.45,
  yield_fraction: 1,
  yield_basis: "extract",
  yield_provenance: {},
  fermentability_fraction: 1,
  fermentability_provenance: {},
  fermentability_basis: "real",
  fermentability_method: "",
  color_lovibond: 0.6,
  notes: "",
};

async function dosedApp() {
  const app = createTestApp();
  await app.boot();
  app.engine.setCollection("batch.sugars", [{ ...ROW }]);
  app.engine.setRoot("batch.late_addition_intent", "dose");
  app.compute();
  return app;
}

test("the sugar effect survives a solve and reports the dose", async () => {
  const app = await dosedApp();

  assert.equal(app.sugarEffect.active, true);
  assert.ok(app.sugarEffect.share > 0);
  assert.ok(app.sugarEffectDisplay);
  assert.match(app.sugarEffectDisplay.share, /%$/);
});

test("the sugar effect block is a snapshot, not a live engine read", async () => {
  const app = await dosedApp();
  const frozen = app.sugarEffectDisplay;
  const frozenShare = frozen.share;

  app.engine.setCollection("batch.sugars", [{ ...ROW, mass_kg: 0 }]);

  assert.equal(app.sugarEffectDisplay, frozen, "the display must not re-read the engine");
  assert.equal(app.sugarEffectDisplay.share, frozenShare);
  assert.equal(app.sugarEffect.active, true, "the snapshot still describes the last solve");

  app.compute();

  assert.equal(app.sugarEffect.active, false, "zero dose clears the effect");
  assert.equal(app.sugarEffectDisplay, null, "and the block disappears");
});

test("the late-addition intent is mirrored for the block that gates on it", async () => {
  const app = await dosedApp();
  assert.equal(app.lateAdditionIntent, "dose");

  app.engine.setRoot("batch.late_addition_intent", "share");
  assert.equal(app.lateAdditionIntent, "dose", "the mirror only moves on refresh");

  app.compute();
  assert.equal(app.lateAdditionIntent, "share");
});

test("switching intent through the control moves the mirror immediately", async () => {
  const app = await dosedApp();
  app.setLateAdditionIntent("share");

  assert.equal(app.lateAdditionIntent, "share");
  assert.equal(app.engine.get("batch.late_addition_intent"), "share");
});
