// Share-mode row weights: a positive sugar budget must never be left with zero
// mass on every row (a catalog add, or a batch saved before rows carried a
// weight).

import test from "node:test";
import assert from "node:assert/strict";

import { createTestApp, sharedTestApp } from "./appHelpers.js";
import { createReferenceCache } from "../../frontend/src/store/referenceCache.js";

const cache = createReferenceCache();

const ROW = {
  sugar_id: "d-180-candi-syrup",
  name: "D-180 Candi Syrup",
  mass_kg: 0,
  parts: 0,
  resolved_mass_kg: 0,
  yield_fraction: 0.606,
  yield_basis: "extract",
  yield_provenance: {},
  fermentability_fraction: 0.86,
  fermentability_provenance: {},
  fermentability_basis: "real",
  fermentability_method: "",
  color_lovibond: 133.4,
  notes: "",
};

test("a catalog add in share mode carries an equal weight and derives its mass", async () => {
  const app = createTestApp();
  await app.boot();
  app.engine.setCollection("batch.sugars", []);
  app.setRoot("batch.late_addition_intent", "share");
  app.setRoot("batch.sugar_extract_share", 0.15);
  app.compute();

  app.openSugarEditor();
  app.openSugarSearch();
  app.addCatalogSugar(app.sugarCatalog[0].id);
  assert.ok(app.draftRows[0].parts > 0);

  const massColumn = app.draftColumns.find((column) => column.id === "resolved_mass_kg");
  assert.ok(massColumn, "share mode shows the derived mass column");
  assert.notEqual(app.draftDisplayRows[0].resolved_mass_kg, "0.00");

  app.saveSugarEditor();
  app.compute();

  const row = app.engine.get("batch.sugars")[0];
  assert.ok(row.resolved_mass_kg > 0);
  assert.ok(app.engine.get("grist.sugars_mass") > 0);
  assert.notEqual(app.lateSugarField.rows[0].resolved_mass_kg, "0.00");
});

test("dose -> share with no dose seeds equal parts instead of zeros", async () => {
  const app = createTestApp();
  await app.boot();
  app.engine.setCollection("batch.sugars", [{ ...ROW }]);
  app.setRoot("batch.late_addition_intent", "dose");
  app.compute();

  app.setLateAdditionIntent("share");
  app.compute();

  assert.equal(app.engine.get("batch.sugars")[0].parts, 10);
  assert.equal(app.engine.get("batch.sugar_extract_share"), 0);

  app.setRoot("batch.sugar_extract_share", 0.15);
  app.compute();

  const row = app.engine.get("batch.sugars")[0];
  assert.ok(row.resolved_mass_kg > 0);
  assert.ok(app.engine.get("grist.sugars_mass") > 0);
});

test("loading a legacy share batch repairs zero row weights", async () => {
  const app = createTestApp();
  const water = Object.values(cache.references.water_report ?? {})[0] ?? {};
  await app.loadState({
    identity: {
      style: cache.references.style["21A"] ?? {},
      equipment: cache.references.equipment?.["herms-30l"] ?? {},
      "water.source": water,
    },
    roots: {
      "batch.late_addition_intent": "share",
      "batch.sugar_extract_share": 0.15,
    },
    collections: { "batch.sugars": [{ ...ROW }] },
    selections: {},
  });
  await app.boot();

  const row = app.engine.get("batch.sugars")[0];
  assert.equal(row.parts, 10);
  assert.ok(row.resolved_mass_kg > 0);
  assert.ok(app.engine.get("grist.sugars_mass") > 0);
});

test("saving a share draft with no weights completes them", async () => {
  const app = await sharedTestApp();
  app.engine.setCollection("batch.sugars", [{ ...ROW }]);
  app.setRoot("batch.late_addition_intent", "share");
  app.setRoot("batch.sugar_extract_share", 0.15);
  app.compute();

  app.openSugarEditor();
  app.saveSugarEditor();
  app.compute();

  const row = app.engine.get("batch.sugars")[0];
  assert.equal(row.parts, 10);
  assert.ok(row.resolved_mass_kg > 0);
});

test("the late-addition volume feeds the ledger's shrinkage base", async () => {
  const app = createTestApp();
  const water = Object.values(cache.references.water_report ?? {})[0] ?? {};
  await app.loadState({
    identity: {
      style: cache.references.style["21A"] ?? {},
      equipment: cache.references.equipment?.["herms-30l"] ?? {},
      "water.source": water,
    },
    roots: { "batch.late_addition_intent": "dose" },
    collections: { "batch.sugars": [{ ...ROW, mass_kg: 1.0, yield_fraction: 0.9 }] },
    selections: {},
  });
  await app.boot();

  const extract = app.engine.get("batch.sugar_extract_total");
  const lateVolume = app.engine.get("batch.late_addition_volume_l");
  assert.ok(Math.abs(lateVolume - extract * 0.625) < 1e-9);

  const post = app.engine.resolve("solver.batch.cascade.v_post_boil");
  const shrink = app.engine.resolve("equipment.shrinkage_pct");
  const shrinkage = app.engine.get("batch.shrinkage_volume_l");
  assert.ok(Math.abs(shrinkage - (post + lateVolume) * shrink) < 1e-9);
});

test("a zero share never invents row weights", async () => {
  const app = await sharedTestApp();
  app.engine.setCollection("batch.sugars", [{ ...ROW, parts: 0 }]);
  app.setRoot("batch.late_addition_intent", "share");
  app.setRoot("batch.sugar_extract_share", 0);
  app.compute();

  assert.equal(app.seedSugarShareParts(), false);
  assert.equal(app.engine.get("batch.sugars")[0].parts, 0);
});
