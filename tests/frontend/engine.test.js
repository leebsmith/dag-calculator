import test from "node:test";
import assert from "node:assert/strict";

import { createCalculator, loadArtifact } from "../../frontend/src/engine/index.js";
import { loadArtifact as readArtifact, makeFixtures } from "./helpers.js";

const artifact = readArtifact();
const fixtures = makeFixtures();

function engine() {
  return createCalculator(artifact, fixtures);
}

test("end-to-end: strike-water chain resolves through the batch boundary", () => {
  const e = engine();
  assert.ok(Math.abs(e.get("mash.strike_water_temp_base_c") - 73.42333333333333) < 1e-6);
  assert.ok(Math.abs(e.get("mash.strike_water_tun_offset_c") - 3.0214285714285714) < 1e-6);
  assert.ok(Math.abs(e.get("mash.strike_water_temp_c") - 76.4447619047619) < 1e-6);
});

test("end-to-end: selection overlay overrides the referenced component", () => {
  const e = engine();
  const profile = e.get("equipment.profile");
  assert.equal(profile.mash_tun_mass_kg, 7.5); // overlay wins
  assert.equal(profile.mash_tun_specific_heat, 0.12); // inherited from seed
  assert.equal(profile.max_hlt_volume_l, 30); // inherited from seed
});

test("end-to-end: collection reductions compute weighted values", () => {
  const e = engine();
  assert.ok(Math.abs(e.get("grist.weighted_lovibond") - 9.2) < 1e-9);
  assert.ok(Math.abs(e.get("grist.beer_srm") - (1.3546 * 9.2 - 0.76)) < 1e-9);
});

test("end-to-end: boundary output feeds an interpretation (taxonomy)", () => {
  const e = engine();
  assert.equal(e.get("water.mash_ph_status"), "OPTIMAL");
});

test("resolve() handles dotted sub-refs (boundary output + selection field)", () => {
  const e = engine();
  assert.equal(e.resolve("solver.batch.mash_thickness_l_per_kg"), 3.0);
  assert.equal(e.resolve("solver.batch.v_strike"), 14.0);
  assert.equal(e.resolve("equipment.mash_tun_specific_heat"), 0.12);
  assert.equal(e.resolve("equipment.mash_tun_mass_kg"), 7.5); // overlay wins
});

test("end-to-end: root defaults are evaluated when unset", () => {
  const e = engine();
  assert.equal(e.get("mash.grain_temp_c"), 20.0); // default_grain_temp_c
  assert.equal(e.get("batch.target_abv"), 5.5); // default_target_abv
});

test("loadArtifact rejects a dangling reference", () => {
  const bad = structuredClone(artifact);
  bad.nodes["mash.strike_water_temp_base_c"].inputs.thickness = "does.not.exist";
  assert.throws(() => loadArtifact(bad), /unknown node\/field/);
});
