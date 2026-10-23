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
  assert.ok(Math.abs(e.get("mash.strike_water_tun_offset_c") - 2.6185714285714288) < 1e-6);
  assert.ok(Math.abs(e.get("mash.strike_water_temp_c") - 76.04190476190476) < 1e-6);
});

test("end-to-end: identity resolves read-only to the supplied component", () => {
  const e = engine();
  assert.equal(e.resolve("equipment.mash_tun_mass_kg"), 6.5);
  assert.equal(e.resolve("equipment.mash_tun_specific_heat"), 0.12);
  assert.equal(e.resolve("equipment.max_hlt_volume_l"), 30);
  assert.equal(e.identity.style.og_min, 1.056);
});

test("end-to-end: collection reductions compute weighted values", () => {
  const e = engine();
  assert.ok(Math.abs(e.get("grist.weighted_lovibond") - 9.2) < 1e-9);
  // finished-beer color via the MCU -> Morey path (grain SRM bridge removed).
  assert.ok(Math.abs(e.get("grist.finished_beer_srm") - 10.49521689713994) < 1e-9);
});

test("MCU converts metric color density with the plain lb/kg x L/gal factor", () => {
  const k = artifact.constants.mcu_metric_to_imperial_factor.value;
  // kg*L/L -> lb*L/US gal. An EBC/Lovibond adjustment here would understate SRM.
  assert.ok(Math.abs(k - 2.2046226218487757 * 3.785411784) < 1e-4);

  const metric = (8.446 * 42.6) / 26.5;
  const srm = 1.4922 * Math.pow(metric * k, 0.6859);
  assert.ok(Math.abs(srm - 38.27) < 0.01);
});

test("end-to-end: boundary output feeds an interpretation (taxonomy)", () => {
  const e = engine();
  assert.equal(e.get("water.mash_ph_status"), "OPTIMAL");
});

test("resolve() handles dotted sub-refs (boundary output + selection field)", () => {
  const e = engine();
  assert.equal(e.resolve("solver.batch.mash_thickness_l_per_kg"), 3.0);
  assert.equal(e.resolve("solver.batch.cascade.v_strike"), 14.0);
  assert.equal(e.resolve("equipment.mash_tun_specific_heat"), 0.12);
  assert.equal(e.resolve("equipment.mash_tun_mass_kg"), 6.5); // inherited from seed
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

test("loadArtifact rejects a dangling default ref", () => {
  const bad = structuredClone(artifact);
  bad.nodes["batch.hlt_starting_volume_l"].default = { ref: "does.not.exist" };
  assert.throws(() => loadArtifact(bad), /unknown node\/field/);
});

test("loadArtifact rejects a relation with a dangling ref", () => {
  const bad = structuredClone(artifact);
  bad.relations = [
    ...bad.relations,
    { id: "bad_ref", predicate: { op: "le", lhs: { ref: "does.not.exist" }, rhs: 1 } },
  ];
  assert.throws(() => loadArtifact(bad), /unknown node\/field/);
});

test("choice inputs: default value and setRoot", () => {
  const e = engine();
  assert.equal(e.get("batch.topology"), "r_l_to_g");
  e.setRoot("batch.topology", "runoff_ratio");
  assert.equal(e.get("batch.topology"), "runoff_ratio");
});

test("mash.preset_id choice defaults to single_infusion and stores a preset", () => {
  const e = engine();
  assert.equal(e.get("mash.preset_id"), "single_infusion");
  e.setRoot("mash.preset_id", "german_pils");
  assert.equal(e.get("mash.preset_id"), "german_pils");
});

test("derived dough-in target honors the enabled-rest filter", () => {
  const e = engine();
  assert.equal(e.get("mash.dough_in_target_temp_c"), 67.0); // disabled 55 must be ignored
});

test("loadArtifact rejects a choice default outside its taxonomy", () => {
  const bad = structuredClone(artifact);
  bad.nodes["batch.topology"].default = "not_a_member";
  assert.throws(() => loadArtifact(bad), /not a member of taxonomy/);
});

test("loadArtifact accepts schema_version 4 and rejects unknown versions", () => {
  const bad = structuredClone(artifact);
  bad.schema_version = 99;
  assert.throws(() => loadArtifact(bad), /Unsupported schema_version/);
});

test("trace malts: definite-mass rows fold into color (and only color)", () => {
  // Fresh fixtures so setCollection doesn't leak into the shared fixture set.
  const e = createCalculator(artifact, makeFixtures());
  const baseMcu = e.get("grist.mcu");
  const baseSrm = e.get("grist.finished_beer_srm");

  e.setCollection("grist.trace_malts", [
    { catalog_id: "black", name: "Black Malt", category: "ROASTED", mass_kg: 0.17, yield_fraction: 0.55, color_lovibond: 500 },
    { catalog_id: "roast", name: "Roasted Barley", category: "ROASTED", mass_kg: 0.17, yield_fraction: 0.55, color_lovibond: 450 },
  ]);

  assert.ok(Math.abs(e.get("grist.trace_malts_mass") - 0.34) < 1e-9);
  assert.ok(Math.abs(e.get("grist.trace_weighted_lovibond") - 475) < 1e-9);

  // MCU = (grist_mass·lovibond + trace_mass·trace_lovibond) / v_post_boil · 8.3454
  // (no sugars in the fixture). Trace raises color but never touches m_grist.
  const expectedMcu = ((4.7 * 9.2 + 0.34 * 475) / 21.0) * 8.3454;
  assert.ok(Math.abs(e.get("grist.mcu") - expectedMcu) < 1e-9);
  assert.ok(e.get("grist.finished_beer_srm") > baseSrm);
  assert.ok(baseMcu < e.get("grist.mcu"));
  assert.equal(e.resolve("solver.batch.m_grist"), 4.7); // extract/mass untouched
});

test("target roots inherit the style midpoint or fall back", () => {
  const withStyle = createCalculator(artifact, makeFixtures());
  assert.equal(withStyle.get("batch.target_ibu"), 55);
  assert.equal(withStyle.get("batch.target_srm"), 10);
  assert.equal(withStyle.get("batch.whirlpool_ibu_fraction"), 0);

  const fixtures = makeFixtures();
  fixtures.identity.style = {};
  const noStyle = createCalculator(artifact, fixtures);
  assert.equal(noStyle.get("batch.target_ibu"), 30);
  assert.equal(noStyle.get("batch.target_srm"), null);
});

test("IBU split: boil/whirlpool targets track the whirlpool fraction", () => {
  const e = createCalculator(artifact, makeFixtures());
  e.setRoot("batch.target_ibu", 40);
  e.setRoot("batch.whirlpool_ibu_fraction", 0.25);
  assert.ok(Math.abs(e.get("batch.whirlpool_target_ibu") - 10) < 1e-9);
  assert.ok(Math.abs(e.get("batch.boil_target_ibu") - 30) < 1e-9);

  e.setRoot("batch.whirlpool_ibu_fraction", 1);
  assert.equal(e.get("batch.boil_target_ibu"), 0);
  assert.ok(Math.abs(e.get("batch.whirlpool_target_ibu") - 40) < 1e-9);
});
