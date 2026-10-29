// Zero-share allocation and the active representation in the sugar table.

import test from "node:test";
import assert from "node:assert/strict";

import { sharedTestApp } from "./appHelpers.js";
import { resolvedSugarMasses } from "../../frontend/src/views/producer/sugarAllocation.js";

const ROW = {
  sugar_id: "dextrose",
  name: "Dextrose",
  mass_kg: 0.89,
  parts: 100,
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

test("share mode with zero share allocates zero mass, not the dormant dose", () => {
  const resolved = resolvedSugarMasses({
    rows: [ROW],
    budgetKg: 0,
    share: 0,
    mode: "share",
  });
  assert.equal(resolved[0].extractKg, 0);
  assert.equal(resolved[0].massKg, 0);
});

test("dose mode keeps the authored mass at share zero", () => {
  const resolved = resolvedSugarMasses({
    rows: [ROW],
    budgetKg: 0,
    share: 0,
    mode: "dose",
  });
  assert.equal(resolved[0].massKg, 0.89);
});

async function shareZeroApp() {
  const app = await sharedTestApp();
  app.engine.setCollection("batch.sugars", [{ ...ROW }]);
  app.setRoot("batch.late_addition_intent", "share");
  app.setRoot("batch.sugar_extract_share", 0);
  app.compute();
  return app;
}

test("zero share shows derived mass 0 and hides the dormant dose", async () => {
  const app = await shareZeroApp();

  assert.equal(app.engine.get("batch.sugars")[0].resolved_mass_kg, 0);
  assert.equal(app.engine.get("batch.sugars")[0].mass_kg, 0.89);

  const ids = app.lateSugarField.columns.map((column) => column.id);
  assert.ok(!ids.includes("mass_kg"));
  assert.ok(ids.includes("resolved_mass_kg"));
  assert.equal(
    app.lateSugarField.columns.find((column) => column.id === "resolved_mass_kg").label,
    "Mass"
  );
  assert.equal(app.lateSugarField.rows[0].resolved_mass_kg, "0.00");
});

test("adopt share at zero clears the dose masses", async () => {
  const app = await shareZeroApp();

  app.adoptLateAdditionShare();
  app.compute();

  const row = app.engine.get("batch.sugars")[0];
  assert.equal(row.mass_kg, 0);
  assert.equal(row.resolved_mass_kg, 0);
  assert.equal(app.engine.get("batch.sugars")[0].resolved_mass_kg, 0);
});

test("dose mode shows the authored mass and hides resolved mass", async () => {
  const app = await sharedTestApp();
  app.engine.setCollection("batch.sugars", [{ ...ROW }]);
  app.setRoot("batch.late_addition_intent", "dose");
  app.compute();

  const ids = app.lateSugarField.columns.map((column) => column.id);
  assert.ok(ids.includes("mass_kg"));
  assert.ok(!ids.includes("resolved_mass_kg"));
  assert.equal(app.engine.get("batch.sugars")[0].resolved_mass_kg, 0.89);
});
