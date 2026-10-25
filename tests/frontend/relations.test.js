import test from "node:test";
import assert from "node:assert/strict";

import { createCalculator } from "../../frontend/src/engine/index.js";
import { loadArtifact as readArtifact, makeFixturesWithYeast } from "./helpers.js";

const artifact = readArtifact();

function engine(fixtures = makeFixturesWithYeast()) {
  return createCalculator(artifact, fixtures);
}

test("relationStates() evaluates every declared relation", () => {
  const states = engine().relationStates();
  assert.equal(states.length, artifact.relations.length);
  for (const s of states) assert.equal(typeof s.holds, "boolean");
  assert.deepEqual(
    states.map((s) => s.id).sort(),
    [
      "hlt_above_coil_floor",
      "hlt_demand_not_overfilled",
      "hlt_not_overfilled",
      "kettle_not_overfilled",
      "mash_thickness_above_equipment_floor",
      "mash_thickness_below_ceiling",
      "mash_tun_not_overfilled",
    ]
  );
});

test("relations hold under the default fixtures", () => {
  const states = Object.fromEntries(engine().relationStates().map((s) => [s.id, s.holds]));
  assert.equal(states.hlt_not_overfilled, true); // 30 <= 30
  assert.equal(states.hlt_demand_not_overfilled, true); // 0 <= 30
  assert.equal(states.kettle_not_overfilled, true); // 24 <= 40 (boundary output)
  assert.equal(states.mash_thickness_above_equipment_floor, true); // 3.0 >= 2.295
  assert.equal(states.mash_thickness_below_ceiling, true); // 3.0 <= 4.1727
  assert.equal(states.mash_tun_not_overfilled, true); // 17.1 <= 40 (phase volumes)
});

test("a violated relation reports holds:false", () => {
  const e = engine();
  e.setRoot("batch.hlt_starting_volume_l", 50.0); // > max_hlt_volume_l (30)
  const states = Object.fromEntries(e.relationStates().map((s) => [s.id, s.holds]));
  assert.equal(states.hlt_not_overfilled, false);
  assert.equal(states.kettle_not_overfilled, true);
});

test("hlt_above_coil_floor bounds the HLT fill from below", () => {
  const e = engine();
  assert.equal(
    Object.fromEntries(e.relationStates().map((s) => [s.id, s.holds])).hlt_above_coil_floor,
    true
  ); // default fill 30 >= coil floor 4
  e.setRoot("batch.hlt_starting_volume_l", 3.0);
  assert.equal(
    Object.fromEntries(e.relationStates().map((s) => [s.id, s.holds])).hlt_above_coil_floor,
    false
  );
});


test("the equipment LGR floor is report-only and tolerates a missing field", () => {
  const legacy = makeFixturesWithYeast();
  delete legacy.identity.equipment.min_lgr_l_per_kg;
  const e = createCalculator(artifact, legacy);
  const states = Object.fromEntries(e.relationStates().map((s) => [s.id, s.holds]));
  assert.equal(states.mash_thickness_above_equipment_floor, true);
});
