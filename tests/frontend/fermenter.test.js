// Fermenter identity: the cold-side vessel seeds the packaged volume, caps it,
// and a legacy draft without the namespace is repaired on load.

import test from "node:test";
import assert from "node:assert/strict";

import { createTestApp, withFreshApp } from "./appHelpers.js";
import { createReferenceCache } from "../../frontend/src/store/referenceCache.js";

const NOMINAL = 23.091012;
const MAX = 26.497882;

function volumeField(app) {
  return app.fieldsBySlice.batch.find((field) => field.id === "batch.v_ferm");
}

test("a new batch starts at the fermenter's nominal packaged volume", withFreshApp(async (app) => {
  assert.equal(app.engine.get("batch.v_ferm"), NOMINAL);
  assert.match(volumeField(app).hint ?? "", /Maximum capacity/);
}));

test("the packaged volume is clamped to the fermenter capacity on commit", withFreshApp(async (app) => {
  const field = volumeField(app);

  app.edit(field, "30");
  app.commitField(field);

  assert.equal(app.engine.get("batch.v_ferm"), MAX);
}));

test("a volume above capacity violates the blocking relation", withFreshApp(async (app) => {
  app.setRoot("batch.v_ferm", 30);

  const relation = app.engine
    .relationStates()
    .find((state) => state.id === "fermenter_not_overfilled");

  assert.equal(relation.blocking, true);
  assert.equal(relation.holds, false);
}));

test("a draft saved before the namespace existed inherits the default fermenter", async () => {
  const cache = createReferenceCache();
  const water = Object.values(cache.references.water_report ?? {})[0] ?? {};
  const app = createTestApp();

  await app.loadState({
    identity: {
      style: cache.references.style["21A"] ?? {},
      equipment: cache.references.equipment?.["herms-30l"] ?? {},
      "water.source": water,
    },
    roots: {},
    collections: {},
    selections: {},
  });
  await app.boot();

  assert.equal(app.engine.resolve("fermenter.nominal_volume_l"), NOMINAL);
  assert.equal(app.engine.get("batch.v_ferm"), NOMINAL);
});
