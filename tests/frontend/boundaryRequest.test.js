import test from "node:test";
import assert from "node:assert/strict";

import { buildBatchRequest } from "../../frontend/src/adapters/boundaryRequest.js";
import { createCalculator } from "../../frontend/src/engine/index.js";
import { UNIT_DIMENSIONS } from "../../frontend/src/views/registry/units.js";
import { loadArtifact, makeFixturesWithYeast } from "./helpers.js";

function stubEngine(rows, fallback, values = {}) {
  return {
    resolve(path) {
      if (path in values) return values[path];
      return path === "batch.grain_moisture_fraction" ? fallback : 0;
    },
    get(id) {
      return id === "grist.major_malts" ? rows : [];
    },
  };
}

test("buildBatchRequest sends per-row moisture with the batch fallback", () => {
  const rows = [
    { pct: 0.6, yield_fraction: 0.8, moisture_fraction: 0.05 },
    { pct: 0.4, yield_fraction: 0.75 },
  ];
  const request = buildBatchRequest(stubEngine(rows, 0.04));

  assert.equal(request.grain_bill[0].mc_i, 0.05, "row moisture wins where present");
  assert.equal(request.grain_bill[1].mc_i, 0.04, "absent moisture falls back to batch value");
});

test("buildBatchRequest carries a real fermentable fraction on the wire", () => {
  const rows = [
    {
      pct: 0.5,
      yield_fraction: 0.8,
      fermentability_fraction: 0.643,
      fermentability_basis: "real",
    },
    {
      pct: 0.5,
      yield_fraction: 0.8,
      fermentability_fraction: 0.5,
      fermentability_basis: "apparent",
    },
  ];
  const request = buildBatchRequest(stubEngine(rows, 0.04));

  assert.equal(request.grain_bill[0].fermentability_i, 0.643, "real passes through");
  assert.ok(
    Math.abs(request.grain_bill[1].fermentability_i - 0.398) < 5e-4,
    "apparent converts at the 12 °P reference"
  );
});

test("buildBatchRequest treats an unspecified basis as real", () => {
  const rows = [
    { pct: 0.5, yield_fraction: 0.8, fermentability_fraction: 0.87 },
    { pct: 0.5, yield_fraction: 0.8, fermentability_fraction: 0.398 },
  ];
  const request = buildBatchRequest(stubEngine(rows, 0.04));
  assert.equal(request.grain_bill[0].fermentability_i, 0.87);
});

test("buildBatchRequest selects the intensive root by topology", () => {
  const lgr = buildBatchRequest(
    stubEngine([], 0.04, {
      "batch.topology": "r_l_to_g",
      "batch.mash_thickness_l_per_kg": 2.6079,
      "batch.runoff_ratio": 1.0,
    })
  );
  assert.equal(lgr.intensive_value, 2.6079);
  assert.ok(!("runoff_ratio" in lgr), "the host-side root is not a wire key");

  const runoff = buildBatchRequest(
    stubEngine([], 0.04, {
      "batch.topology": "runoff_ratio",
      "batch.mash_thickness_l_per_kg": 2.6079,
      "batch.runoff_ratio": 1.25,
    })
  );
  assert.equal(runoff.intensive_value, 1.25);
  assert.ok(!("runoff_ratio" in runoff), "the host-side root is not a wire key");
});

test("buildBatchRequest uses the mode-correct artifact default", () => {
  const engine = createCalculator(loadArtifact(), makeFixturesWithYeast());
  assert.equal(buildBatchRequest(engine).intensive_value, 2.6079);

  engine.setRoot("batch.topology", "runoff_ratio");
  assert.equal(buildBatchRequest(engine).intensive_value, 1);
});

test("the runoff ratio is dimensionless and never unit-toggleable", () => {
  const artifact = loadArtifact();
  assert.equal(artifact.nodes["batch.mash_thickness_l_per_kg"].dimension, "mash_thickness");
  assert.equal(artifact.nodes["batch.runoff_ratio"].dimension, "dimensionless");
  assert.equal(UNIT_DIMENSIONS.some((dimension) => dimension.id === "dimensionless"), false);
});
