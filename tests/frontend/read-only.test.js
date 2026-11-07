import test from "node:test";
import assert from "node:assert/strict";

import { withFreshApp } from "./appHelpers.js";

test("read-only blocks root and collection writes until released", withFreshApp(async (app) => {
  const abv = app.engine.get("batch.target_abv");
  const rests = app.engine.get("mash.rests");

  app.setReadOnly(true);
  app.engine.setRoot("batch.target_abv", abv + 1);
  app.engine.setCollection("mash.rests", []);

  assert.equal(app.engine.get("batch.target_abv"), abv);
  assert.deepEqual(app.engine.get("mash.rests"), rests);

  app.setReadOnly(false);
  app.engine.setRoot("batch.target_abv", 8.5);

  assert.equal(app.engine.get("batch.target_abv"), 8.5);
}));
