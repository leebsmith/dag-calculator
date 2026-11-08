import test from "node:test";
import assert from "node:assert/strict";

import { inferExprDimension } from "../../frontend/src/engine/index.js";
import { loadArtifact as readArtifact } from "./helpers.js";

const artifact = readArtifact();

test("dotted refs resolve boundary-output, selection and collection field dimensions", () => {
  assert.equal(inferExprDimension(artifact, "solver.batch.cascade.v_strike", {}), "volume");
  assert.equal(inferExprDimension(artifact, "equipment.mash_tun_mass_kg", {}), "mass");
  assert.equal(
    inferExprDimension(artifact, "grist.major_malts.color_lovibond", {}),
    "grain_color"
  );
});

test("reduction bodies infer through the element alias", () => {
  const node = artifact.nodes["grist.weighted_lovibond"];
  const inferred = inferExprDimension(artifact, node.expr, { rows: null }, {
    collSchemas: { rows: "grist_row" },
  });
  assert.equal(inferred, "grain_color");

  const rests = artifact.nodes["mash.dough_in_target_temp_c"];
  const t = inferExprDimension(artifact, rests.expr, { rests: null }, {
    collSchemas: { rests: "mash_rest" },
  });
  assert.equal(t, "temperature");
});

test("dimensionless scalars are absorbed by * and /", () => {
  const dims = { m: "mass", p: "percentage", v: "volume" };
  assert.equal(inferExprDimension(artifact, "m * p", dims), "mass");
  assert.equal(inferExprDimension(artifact, "m / p", dims), "mass");
  assert.equal(inferExprDimension(artifact, "v * -1", dims), "volume");
  assert.equal(inferExprDimension(artifact, "m * v", dims), null);
});
