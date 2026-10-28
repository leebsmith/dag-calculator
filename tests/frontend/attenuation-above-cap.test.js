// The attenuation blend may pass the malt cap: sugar extract is never capped,
// and a diastaticus strain consumes the malt's dextrin residue. The delta is an
// artifact value so the report never subtracts.

import test from "node:test";
import assert from "node:assert/strict";

import { createCalculator } from "../../frontend/src/engine/index.js";
import { batchOutputs, loadArtifact, makeFixturesWithYeast } from "./helpers.js";

const artifact = loadArtifact();

function engineWith(apparentAttenuation, { derate } = {}) {
  const fixtures = makeFixturesWithYeast();
  if (derate != null) fixtures.roots["batch.attenuation_derate_points"] = derate;
  fixtures.boundaries.batch_sparge_solver = () => ({
    ...batchOutputs(),
    apparent_attenuation: apparentAttenuation,
  });
  return createCalculator(artifact, fixtures);
}

test("above-cap is absent while the malt cap holds", () => {
  // The fixture yeast's cap is 75% apparent, with no derate.
  assert.equal(engineWith(0.70).resolve("batch.attenuation_above_cap"), null);
  assert.equal(engineWith(0.75).resolve("batch.attenuation_above_cap"), null);
});

test("above-cap is the apparent delta past the malt cap", () => {
  const above = engineWith(0.80).resolve("batch.attenuation_above_cap");
  assert.ok(Math.abs(above - 0.05) < 1e-9);

  // The derate lowers the cap, so the same blend sits further above it.
  const derated = engineWith(0.75, { derate: 0.05 }).resolve("batch.attenuation_above_cap");
  assert.ok(Math.abs(derated - 0.05) < 1e-9);
});

test("above-cap is absent without a selected strain", () => {
  const fixtures = makeFixturesWithYeast();
  delete fixtures.roots["batch.yeast_id"];
  fixtures.boundaries.batch_sparge_solver = () => ({
    ...batchOutputs(),
    apparent_attenuation: 0.80,
  });

  const e = createCalculator(artifact, fixtures);
  assert.equal(e.resolve("batch.yeast_cap"), null);
  assert.equal(e.resolve("batch.attenuation_above_cap"), null);
});
