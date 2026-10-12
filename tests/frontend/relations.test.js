import test from "node:test";
import assert from "node:assert/strict";

import { createCalculator } from "../../frontend/src/engine/index.js";
import { loadArtifact as readArtifact, makeFixtures } from "./helpers.js";

const artifact = readArtifact();

function engine(fixtures = makeFixtures()) {
  return createCalculator(artifact, fixtures);
}

test("relationStates() evaluates every declared relation", () => {
  const states = engine().relationStates();
  assert.equal(states.length, artifact.relations.length);
  for (const s of states) assert.equal(typeof s.holds, "boolean");
  assert.deepEqual(
    states.map((s) => s.id).sort(),
    ["hlt_not_overfilled", "kettle_not_overfilled", "mash_thickness_above_husk_floor", "target_abv_reachable"]
  );
});

test("relations hold under the default fixtures", () => {
  const states = Object.fromEntries(engine().relationStates().map((s) => [s.id, s.holds]));
  assert.equal(states.hlt_not_overfilled, true); // 30 <= 30
  assert.equal(states.kettle_not_overfilled, true); // 24 <= 40 (boundary output)
  assert.equal(states.mash_thickness_above_husk_floor, true); // 3.0 >= 1.67 (const)
  assert.equal(states.target_abv_reachable, true); // 5.5 <= 10.0 (boundary output)
});

test("a violated relation reports holds:false", () => {
  const e = engine();
  e.setRoot("batch.hlt_starting_volume_l", 50.0); // > max_hlt_volume_l (30)
  const states = Object.fromEntries(e.relationStates().map((s) => [s.id, s.holds]));
  assert.equal(states.hlt_not_overfilled, false);
  assert.equal(states.kettle_not_overfilled, true);
});
