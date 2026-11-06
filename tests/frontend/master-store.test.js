import test from "node:test";
import assert from "node:assert/strict";

import { withFreshApp } from "./appHelpers.js";

test("direct engine root writes are visible through the master mirror", withFreshApp((app) => {
  app.engine.setRoot("batch.boil_time_min", 77);

  assert.equal(app.master.getRoot("batch.boil_time_min"), 77);
  assert.equal(app.master.hasRoot("batch.boil_time_min"), true);
  assert.equal(app.master.allRoots()["batch.boil_time_min"], 77);
}));

test("direct engine unset removes the mirrored root", withFreshApp((app) => {
  app.engine.setRoot("batch.boil_time_min", 77);
  app.engine.unsetRoot("batch.boil_time_min");

  assert.equal(app.master.getRoot("batch.boil_time_min"), undefined);
  assert.equal(app.master.hasRoot("batch.boil_time_min"), false);
  assert.equal("batch.boil_time_min" in app.master.allRoots(), false);
}));

test("master subscribers receive engine root events and can detach", withFreshApp((app) => {
  const events = [];
  const detach = app.master.subscribe((nodeId, value) => events.push([nodeId, value]));

  app.engine.setRoot("batch.boil_time_min", 60);
  app.engine.setRoot("batch.boil_time_min", 30);
  assert.deepEqual(events, [
    ["batch.boil_time_min", 60],
    ["batch.boil_time_min", 30],
  ]);

  detach();
  app.engine.setRoot("batch.boil_time_min", 15);
  assert.equal(events.length, 2);
}));
