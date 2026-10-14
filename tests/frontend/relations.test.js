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
    [
      "attenuation_within_yeast_envelope",
      "hlt_not_overfilled",
      "kettle_not_overfilled",
      "mash_thickness_above_husk_floor",
      "target_abv_reachable",
      "target_abv_within_yeast_tolerance",
    ]
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

const holds = (e, id) => Object.fromEntries(e.relationStates().map((s) => [s.id, s.holds]))[id];

test("guarded relations are not applicable when no yeast is selected", () => {
  const e = engine();
  assert.equal(holds(e, "attenuation_within_yeast_envelope"), true);
  assert.equal(holds(e, "target_abv_within_yeast_tolerance"), true);
});

test("guarded relation enforces the selected strain's envelope", () => {
  const fixtures = makeFixtures();
  fixtures.references.yeast = {
    "test-strain": {
      id: "test-strain",
      name: "Test",
      manufacturer: "Lab",
      attenuation_pct: 0.8,
      low_attenuation: 0.75,
      high_attenuation: 0.85,
      flocculation: "High",
      alcohol_tolerance_abv: 12,
      notes: "",
    },
  };
  const e = engine(fixtures);
  e.setRoot("batch.yeast_id", "test-strain");
  e.setRoot("batch.apparent_attenuation", 0.8);
  assert.equal(holds(e, "attenuation_within_yeast_envelope"), true);
  assert.equal(holds(e, "target_abv_within_yeast_tolerance"), true); // 5.5 <= 12

  e.setRoot("batch.apparent_attenuation", 0.5); // below envelope
  assert.equal(holds(e, "attenuation_within_yeast_envelope"), false);
});
