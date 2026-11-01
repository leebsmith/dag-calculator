import test from "node:test";
import assert from "node:assert/strict";

import { withFreshApp } from "./appHelpers.js";

function close(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} != ${expected}`);
}

test("the inactive ratio is a readout of the solved value", withFreshApp((app) => {
  app.setRoot("batch.topology", "r_l_to_g");
  app.compute();

  const active = app.fieldsById["batch.mash_thickness_l_per_kg"];
  const inactive = app.fieldsById["batch.runoff_ratio"];

  assert.equal(active.control, "number");
  assert.equal(active.editable, true);
  assert.equal(inactive.control, "readout");
  assert.equal(inactive.editable, false);
  assert.equal(inactive.target, null);
  assert.equal(inactive.label, "Runnings ratio (r, derived)");
  close(inactive.value, app.engine.resolve("batch.runnings_ratio"), "inactive r");
}));

test("switching topology hands the solved ratio to the new active root", withFreshApp((app) => {
  app.setRoot("batch.topology", "r_l_to_g");
  app.setRoot("batch.mash_thickness_l_per_kg", 2.6079);
  app.compute();
  const solvedR = app.engine.resolve("batch.runnings_ratio");

  app.edit(app.fieldsById["batch.topology"], "runoff_ratio");

  assert.equal(app.engine.get("batch.topology"), "runoff_ratio");
  close(app.engine.get("batch.runoff_ratio"), solvedR, "inherited r");
  assert.equal(app.fieldsById["batch.runoff_ratio"].control, "number");
  assert.equal(app.fieldsById["batch.mash_thickness_l_per_kg"].control, "readout");
  close(
    app.fieldsById["batch.mash_thickness_l_per_kg"].value,
    app.engine.resolve("solver.batch.mash_thickness_l_per_kg"),
    "derived L/kg"
  );
}));

test("switching back hands the solved L/kg ratio to the new active root", withFreshApp((app) => {
  app.setRoot("batch.topology", "runoff_ratio");
  app.setRoot("batch.runoff_ratio", 1.25);
  app.compute();
  const solvedThickness = app.engine.resolve("solver.batch.mash_thickness_l_per_kg");

  app.edit(app.fieldsById["batch.topology"], "r_l_to_g");

  assert.equal(app.engine.get("batch.topology"), "r_l_to_g");
  close(app.engine.get("batch.mash_thickness_l_per_kg"), solvedThickness, "inherited L/kg");
  assert.equal(app.fieldsById["batch.mash_thickness_l_per_kg"].control, "number");
  assert.equal(app.fieldsById["batch.runoff_ratio"].control, "readout");
  close(
    app.fieldsById["batch.runoff_ratio"].value,
    app.engine.resolve("batch.runnings_ratio"),
    "derived r"
  );
}));

test("the inactive root is not rewritten on every solve", withFreshApp((app) => {
  app.setRoot("batch.topology", "r_l_to_g");
  app.setRoot("batch.mash_thickness_l_per_kg", 2.6079);
  app.compute();

  app.edit(app.fieldsById["batch.topology"], "runoff_ratio");
  app.compute();
  app.compute();

  assert.equal(app.engine.get("batch.mash_thickness_l_per_kg"), 2.6079);
  close(
    app.fieldsById["batch.mash_thickness_l_per_kg"].value,
    app.engine.resolve("solver.batch.mash_thickness_l_per_kg"),
    "readout still solved"
  );
}));
