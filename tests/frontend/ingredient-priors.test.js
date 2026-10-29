// Ingredient rows are resolved on ingest: a captured figure keeps its
// citation, and a missing one takes the artifact's category prior, stamped so a
// batch can tell measured from assumed.

import test from "node:test";
import assert from "node:assert/strict";

import { resolveIngredientRows } from "../../frontend/src/engine/ingredientPriors.js";
import { artifact as artifactFixture } from "../guards/util.js";
import { sharedTestApp } from "./appHelpers.js";

const artifact = artifactFixture();
const resolve = (nodeId, rows) => resolveIngredientRows(artifact, nodeId, rows);

test("a missing fermentability takes the category prior and is stamped", () => {
  const [row] = resolve("grist.major_malts", [
    { catalog_id: "x", name: "Crystal", category: "CRYSTAL", yield_fraction: 0.74 },
  ]);

  assert.equal(row.fermentability_fraction, 0.398);
  assert.deepEqual(row.fermentability_provenance, {
    bound: "point",
    kind: "prior",
    note: "resolved from fermentability_prior_crystal",
  });
  assert.equal(row.yield_provenance, undefined, "a captured yield needs no citation");
});

test("a captured figure and its citation are untouched", () => {
  const citation = {
    bound: "min",
    kind: "vendor",
    vendor: "Bairds",
    url: "https://example.invalid/distilling-malt/",
    retrieved_at: "2026-01-01T00:00:00Z",
    sha256: "0".repeat(64),
  };
  const [row] = resolve("grist.major_malts", [
    {
      catalog_id: "x",
      name: "Distilling",
      category: "BASE",
      yield_fraction: 0.815,
      fermentability_fraction: 0.87,
      fermentability_provenance: citation,
    },
  ]);

  assert.equal(row.fermentability_fraction, 0.87);
  assert.deepEqual(row.fermentability_provenance, citation);
});

test("uncategorized sugars take the extract and sugar priors", () => {
  const [row] = resolve("batch.sugars", [{ sugar_id: "cane", name: "Cane", mass_kg: 0.5 }]);

  assert.equal(row.yield_fraction, 0.95);
  assert.equal(row.fermentability_fraction, 1);
  assert.equal(row.yield_provenance.note, "resolved from yield_prior_extract");
  assert.equal(
    row.fermentability_provenance.note,
    "resolved from fermentability_prior_sugar"
  );
});

test("non-ingredient collections pass through untouched", () => {
  const input = [{ rest_id: "beta", use_temp_c: 67, duration_min: 60, enabled: true }];
  assert.equal(resolve("mash.rests", input), input);
});

test("rows are resolved when they enter the engine", async () => {
  const app = await sharedTestApp();

  app.engine.setCollection("grist.major_malts", [
    {
      catalog_id: "x",
      name: "Roasted",
      category: "ROASTED",
      parts: 100,
      pct: 1,
      yield_fraction: 0.6,
      color_lovibond: 500,
    },
  ]);

  const [row] = app.engine.get("grist.major_malts");
  assert.equal(row.fermentability_fraction, 0.121);
  assert.equal(row.fermentability_provenance.kind, "prior");
});
