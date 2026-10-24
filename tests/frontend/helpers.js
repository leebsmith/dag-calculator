// Shared test fixtures for the frontend engine suite.

import { readFileSync } from "node:fs";

import { BOUNDARY_BUILDERS } from "../../frontend/src/adapters/boundaryRequest.js";

export function loadArtifact() {
  const path = new URL("../../frontend/src/engine/artifact.json", import.meta.url);
  return JSON.parse(readFileSync(path, "utf8"));
}

// Complete equipment profile (matches the `equipment` primitive schema and the
// fields the full `solver.batch` contract consumes).
export const EQUIPMENT = {
  id: "herms-30l",
  name: "HERMS 30L",
  description: "30 L HERMS rig (test fixture)",
  max_kettle_volume_l: 40,
  max_mash_tun_volume_l: 40,
  max_hlt_volume_l: 30,
  mash_dead_space_l: 1.0,
  mash_transfer_loss_l: 0.5,
  kettle_dead_space_l: 1.0,
  kettle_transfer_loss_l: 0.5,
  trub_loss_l: 0.5,
  hlt_dead_space_l: 0.5,
  hlt_transfer_loss_l: 0.5,
  nominal_boil_off_rate_l_per_hr: 3.0,
  grain_absorption_factor_l_per_kg: 0.96,
  nominal_conversion_efficiency: 0.9,
  shrinkage_pct: 0.04,
  hlt_coil_floor_l: 4.0,
  mash_tun_specific_heat: 0.12,
  mash_tun_mass_kg: 6.5,
};

export const STYLE = {
  id: "21A",
  name: "American IPA",
  og_min: 1.056,
  og_max: 1.07,
  fg_min: 1.008,
  fg_max: 1.014,
  ibu_min: 40,
  ibu_max: 70,
  srm_min: 6,
  srm_max: 14,
  abv_min: 5.5,
  abv_max: 7.5,
  tags: ["ale"],
};

export const WATER_SOURCE = {
  report_id: "ward-2024",
  laboratory: "Ward Labs",
  calcium_ca: 40,
  magnesium_mg: 8,
  sodium_na: 20,
  sulfate_so4: 30,
  chloride_cl: 25,
  total_alkalinity_caco3: 80,
};

export function identityFixture() {
  return { equipment: { ...EQUIPMENT }, "water.source": { ...WATER_SOURCE }, style: { ...STYLE } };
}

// Full flattened output sets (matching the artifact's boundary output keys).
export function batchOutputs() {
  return {
    sg_post_boil: 1.055,
    v_pre_boil: 24.0,
    s_post_boil_target: 2.6,
    m_grist: 4.7,
    "cascade.v_strike": 14.0,
    "cascade.v_run1": 10.0,
    "cascade.v_run2": 14.0,
    "cascade.v_sparge": 14.0,
    "cascade.s_run1": 2.0,
    "cascade.s_run2": 0.6,
    "cascade.sg_pre_boil": 1.048,
    "cascade.v_post_boil": 21.0,
    "cascade.mash_thickness_l_per_kg": 3.0,
    max_achievable_abv: 10.0,
    aa_wort: 0.76,
    aa_batch: 0.75,
    "hlt.v_hlt_debt": 1.0,
    "hlt.v_hlt_after_strike": 16.0,
    "hlt.v_hlt_top_up": 0.0,
    "hlt.v_sparge_deliverable": 15.0,
    mash_thickness_l_per_kg: 3.0,
  };
}

export function waterOutputs() {
  const salts = { gypsum_kg: 0.002, cacl2_kg: 0.001, epsom_kg: 0.0, nacl_kg: 0.0, acid_l: 0.0005, baking_soda_kg: 0.0, chalk_kg: 0.0, pickling_lime_kg: 0.0 };
  const additions = (prefix) =>
    Object.fromEntries(Object.entries(salts).map(([k, v]) => [`${prefix}.${k}`, v]));
  return {
    strategy: "CALCIUM_FLOOR",
    "prescription.predicted_mash_ph": 5.4,
    "prescription.mash_ph_status": "OPTIMAL",
    "prescription.residual_hlt_water_l": 0.0,
    ...additions("mash_additions"),
    ...additions("sparge_additions"),
    "post_salt_mash_ions.calcium_ca": 60.0,
    "post_salt_mash_ions.magnesium_mg": 5.0,
    "post_salt_mash_ions.sodium_na": 10.0,
    "post_salt_mash_ions.sulfate_so4": 100.0,
    "post_salt_mash_ions.chloride_cl": 50.0,
    "post_salt_mash_ions.alkalinity_as_caco3": 40.0,
    "post_salt_hlt_ions.calcium_ca": 20.0,
    "post_salt_hlt_ions.magnesium_mg": 5.0,
    "post_salt_hlt_ions.sodium_na": 10.0,
    "post_salt_hlt_ions.sulfate_so4": 30.0,
    "post_salt_hlt_ions.chloride_cl": 15.0,
    "post_salt_hlt_ions.alkalinity_as_caco3": 80.0,
    "grist_buckets_kg.BASE": 4.0,
    "grist_buckets_kg.CRYSTAL": 0.7,
    "grist_buckets_kg.ROASTED": 0.0,
    "grist_buckets_kg.ACID": 0.0,
  };
}

export const YEAST = {
  id: "test-yeast",
  name: "Test Yeast",
  manufacturer: "Test",
  attenuation_pct: 0.75,
  flocculation: "Medium",
  alcohol_tolerance: "10%",
  form: "Dry",
  temp_low_c: 18,
  temp_high_c: 22,
};

export function makeFixtures() {
  const references = { equipment: { "herms-30l": EQUIPMENT } };

  const collections = {
    "grist.major_malts": [
      {
        catalog_id: "pils",
        name: "Pilsner",
        category: "BASE",
        parts: 80,
        pct: 0.8,
        yield_fraction: 0.8,
        color_lovibond: 1.5,
      },
      {
        catalog_id: "c40",
        name: "Crystal 40",
        category: "CRYSTAL",
        parts: 20,
        pct: 0.2,
        yield_fraction: 0.74,
        color_lovibond: 40,
      },
    ],
    // `beta_alpha_amylase` enabled at 67; the disabled rest at 55 must be ignored
    // by the `where` predicate, so the derived dough-in target is 67 (not 55).
    "mash.rests": [
      { rest_id: "beta_alpha_amylase", enabled: true, use_temp_c: 67.0, duration_min: 60 },
      { rest_id: "protein", enabled: false, use_temp_c: 55.0, duration_min: 20 },
      { rest_id: "mash_out", enabled: false, use_temp_c: 76.0, duration_min: 10 },
    ],
  };

  const boundaries = {
    batch_sparge_solver: () => batchOutputs(),
    water_chemistry_solver: () => waterOutputs(),
  };

  const roots = {
    "mash.grain_temp_c": 20.0,
    "mash.tun_initial_temp_c": 20.0,
  };

  return {
    references,
    collections,
    boundaries,
    boundaryRequests: BOUNDARY_BUILDERS,
    identity: identityFixture(),
    roots,
  };
}

export function makeFixturesWithYeast() {
  const fixtures = makeFixtures();
  fixtures.references.yeast = { "test-yeast": YEAST };
  fixtures.roots["batch.yeast_id"] = "test-yeast";
  return fixtures;
}
