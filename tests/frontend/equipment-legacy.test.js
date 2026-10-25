import test from "node:test";
import assert from "node:assert/strict";

import { createCalculator } from "../../frontend/src/engine/index.js";
import { loadArtifact, makeFixturesWithYeast } from "./helpers.js";

test("legacy equipment snapshots fall back for ramp rate and minimum LGR", () => {
  const fixtures = makeFixturesWithYeast();
  delete fixtures.identity.equipment.mash_heating_rate_c_per_min;
  delete fixtures.identity.equipment.min_lgr_l_per_kg;
  fixtures.collections["mash.rests"] = [
    { rest_id: "beta_alpha_amylase", enabled: true, use_temp_c: 67.0, duration_min: 60 },
    { rest_id: "mash_out", enabled: true, use_temp_c: 76.0, duration_min: 10 },
  ];

  const engine = createCalculator(loadArtifact(), fixtures);

  assert.equal(engine.get("mash.heating_rate_c_per_min"), 1);
  assert.equal(engine.get("mash.ramp_time_min"), 9);
  assert.equal(engine.get("mash.total_time_min"), 79);

  const relations = Object.fromEntries(
    engine.relationStates().map((state) => [state.id, state.holds])
  );
  assert.equal(relations.mash_thickness_above_equipment_floor, true);
});
