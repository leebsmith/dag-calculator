// Test double for the three boundary bindings: one function per binding returning
// every artifact-declared output key. Values are fixtures, not physics — the
// solvers live in `backend/app/core/` and their numeric contract is pinned by the
// Python suites and the conformance fixtures. Tests that need a specific served
// value inject their own binding instead of changing this one.

function boilRow(row, inputs) {
  return {
    minutes: (row.boil_time_fraction ?? 0) * (inputs.boil_time_min ?? 0),
    ibu: (row.pct ?? 0) * (inputs.boil_target_ibu ?? 0),
    mass_kg: 0.012,
    alpha_mass_kg: 0.0012,
  };
}

function whirlpoolRow(row, inputs) {
  return {
    minutes: Math.max(0, (inputs.whirlpool_knockout_min ?? 30) - (row.addition_at_min ?? 0)),
    ibu: (row.pct ?? 0) * (inputs.whirlpool_target_ibu ?? 0),
    mass_kg: 0.012,
    effective_minutes: 15,
    alpha_mass_kg: 0.0012,
  };
}

function sumOf(rows, key) {
  return rows.reduce((sum, row) => sum + row[key], 0);
}

function hopOutputs(inputs = {}) {
  const boilRows = (inputs.boil_hops ?? []).map((row) => boilRow(row, inputs));
  const whirlpoolRows = (inputs.whirlpool_hops ?? []).map((row) => whirlpoolRow(row, inputs));
  const boiler = sumOf(boilRows, "mass_kg");
  const whirlpool = sumOf(whirlpoolRows, "mass_kg");
  return {
    boil_rows: boilRows,
    whirlpool_rows: whirlpoolRows,
    whirlpool_timeline: [
      {
        start_min: 0,
        end_min: inputs.whirlpool_knockout_min ?? 30,
        temp_c: inputs.whirlpool_start_temp_c ?? 99,
      },
    ],
    whirlpool_chills: [],
    boil_mass_kg: boiler,
    whirlpool_mass_kg: whirlpool,
    total_mass_kg: boiler + whirlpool,
    boil_alpha_mass_kg: sumOf(boilRows, "alpha_mass_kg"),
    whirlpool_alpha_mass_kg: sumOf(whirlpoolRows, "alpha_mass_kg"),
    whirlpool_hot_ibu: 0,
    whirlpool_cool_ibu: 0,
  };
}

function batchOutputs(inputs = {}) {
  const hasSugar = (inputs.s_late_add ?? 0) > 0 || (inputs.sugar_extract_share ?? 0) > 0;
  return {
    sg_post_boil: 1.055,
    v_pre_boil: 24.0,
    s_post_boil_target: 2.6,
    m_grist: 4.7,
    "cascade.v_strike": 14.0,
    "cascade.v_run1": 10.0,
    "cascade.v_run2": 14.0,
    "cascade.v_sparge": 14.0,
    "cascade.v_absorption": 7.85,
    "cascade.v_mc": 0.2,
    "cascade.v_sol": 1.75,
    "cascade.s_run1": 2.0,
    "cascade.s_run2": 0.6,
    "cascade.sg_pre_boil": 1.048,
    "cascade.v_post_boil": 21.0,
    max_achievable_abv: 10.0,
    max_feasible_abv: 10.0,
    binding_constraint: "fermentation",
    real_attenuation: 0.76,
    apparent_attenuation: 0.75,
    "hlt.v_hlt_debt": 1.0,
    "hlt.v_hlt_after_strike": 16.0,
    "hlt.v_hlt_top_up": 0.0,
    "hlt.v_sparge_deliverable": 15.0,
    "hlt.v_hlt_required": 15.0,
    "hlt.v_hlt_target": 15.0,
    brewhouse_efficiency: 0.72,
    grist_attenuation: 0.72,
    "extract.s_potential": 3.6,
    "extract.s_converted": 3.0,
    "extract.s_tun": 2.7,
    "extract.s_kettle": 2.6,
    "extract.s_fermenter": 2.5,
    mash_thickness_l_per_kg: 3.0,
    previews: hasSugar
      ? [
          {
            pin: "abv",
            og: 1.055,
            fg: 1.012,
            abv: 5.5,
            sugar_extract_share: 0.083,
            ok: true,
            reason: "",
          },
          {
            pin: "og",
            og: 1.052,
            fg: 1.011,
            abv: 5.3,
            sugar_extract_share: 0.087,
            ok: true,
            reason: "",
          },
          {
            pin: "fg",
            og: 1.058,
            fg: 1.012,
            abv: 5.9,
            sugar_extract_share: 0.081,
            ok: true,
            reason: "",
          },
        ]
      : [],
  };
}

function waterOutputs() {
  return {
    strategy: "CALCIUM_FLOOR",
    "prescription.predicted_mash_ph": 5.4,
    "prescription.mash_ph_status": "OPTIMAL",
    "prescription.residual_hlt_water_l": 0.0,
    "mash_additions.gypsum_kg": 0.002,
    "mash_additions.cacl2_kg": 0.001,
    "mash_additions.epsom_kg": 0.0,
    "mash_additions.nacl_kg": 0.0,
    "mash_additions.acid_l": 0.0005,
    "mash_additions.baking_soda_kg": 0.0,
    "mash_additions.chalk_kg": 0.0,
    "mash_additions.pickling_lime_kg": 0.0,
    "sparge_additions.gypsum_kg": 0.001,
    "sparge_additions.cacl2_kg": 0.0,
    "sparge_additions.epsom_kg": 0.0,
    "sparge_additions.nacl_kg": 0.0,
    "sparge_additions.acid_l": 0.0,
    "sparge_additions.baking_soda_kg": 0.0,
    "sparge_additions.chalk_kg": 0.0,
    "sparge_additions.pickling_lime_kg": 0.0,
    "post_salt_mash_ions.calcium_ca": 60.0,
    "post_salt_mash_ions.magnesium_mg": 5.0,
    "post_salt_mash_ions.sodium_na": 10.0,
    "post_salt_mash_ions.sulfate_so4": 100.0,
    "post_salt_mash_ions.chloride_cl": 50.0,
    "post_salt_mash_ions.alkalinity_as_caco3": 40.0,
    "post_salt_hlt_ions.calcium_ca": 60.0,
    "post_salt_hlt_ions.magnesium_mg": 5.0,
    "post_salt_hlt_ions.sodium_na": 10.0,
    "post_salt_hlt_ions.sulfate_so4": 100.0,
    "post_salt_hlt_ions.chloride_cl": 50.0,
    "post_salt_hlt_ions.alkalinity_as_caco3": 40.0,
    "grist_buckets_kg.BASE": 4.0,
    "grist_buckets_kg.CRYSTAL": 0.7,
    "grist_buckets_kg.ROASTED": 0.0,
    "grist_buckets_kg.ACID": 0.0,
    "post_dose_mash_ions.calcium_ca": 60.0,
    "post_dose_mash_ions.magnesium_mg": 5.0,
    "post_dose_mash_ions.sodium_na": 10.0,
    "post_dose_mash_ions.sulfate_so4": 100.0,
    "post_dose_mash_ions.chloride_cl": 50.0,
    "post_dose_mash_ions.alkalinity_as_caco3": 40.0,
    "total_added_salt_mass_g": 3.0,
    "added_mineral_tds_ppm": 150.0,
  };
}

export const BOUNDARY_DOUBLE = {
  batch_sparge_solver: batchOutputs,
  hop_bitterness_solver: hopOutputs,
  water_chemistry_solver: waterOutputs,
};
