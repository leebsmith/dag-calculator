// Offline boundary stubs (default when no API base is configured). Full flattened
// output sets matching the artifact's boundary output keys. The hop stub uses the
// host Tinseth/whirlpool implementations; production reads the backend solver.

import { massFromIbu } from "../views/hops.js";
import { effectiveWhirlpoolMinutes, whirlpoolMassKg } from "../views/whirlpool.js";

function hopOutputs(inputs = {}) {
  const boilRows = (inputs.boil_hops ?? []).map((row) => {
    const minutes = (row.boil_time_fraction ?? 0) * (inputs.boil_time_min ?? 0);
    const ibu = (row.pct ?? 0) * (inputs.boil_target_ibu ?? 0);
    return {
      minutes,
      ibu,
      mass_kg: massFromIbu(
        ibu,
        row.alpha_acid_pct ?? 0,
        minutes,
        inputs.pre_boil_gravity,
        inputs.post_boil_volume_l
      ),
    };
  });
  const kPerMin =
    inputs.whirlpool_cooling_time_constant_min > 0
      ? 1 / inputs.whirlpool_cooling_time_constant_min
      : 0;
  const whirlpoolRows = (inputs.whirlpool_hops ?? []).map((row) => {
    const minutes = row.duration_min ?? 0;
    const ibu = (row.pct ?? 0) * (inputs.whirlpool_target_ibu ?? 0);
    const effectiveMinutes = effectiveWhirlpoolMinutes({
      durationMin: minutes,
      initialTempC: row.initial_temp_c,
      ambientTempC: inputs.whirlpool_ambient_temp_c,
      kPerMin,
    });
    return {
      minutes,
      ibu,
      mass_kg: whirlpoolMassKg({
        ibu,
        alphaFraction: row.alpha_acid_pct ?? 0,
        volumeL: inputs.post_boil_volume_l,
        gravity: inputs.post_boil_gravity,
        durationMin: minutes,
        initialTempC: row.initial_temp_c,
        ambientTempC: inputs.whirlpool_ambient_temp_c,
        kPerMin,
        productForm: row.product_form ?? "t90_pellet",
      }),
      effective_minutes: effectiveMinutes,
    };
  });
  const boilMass = boilRows.reduce(
    (sum, row) => (typeof row.mass_kg === "number" ? sum + row.mass_kg : sum),
    0
  );
  const whirlpoolMass = whirlpoolRows.reduce(
    (sum, row) => (typeof row.mass_kg === "number" ? sum + row.mass_kg : sum),
    0
  );
  return {
    boil_rows: boilRows,
    whirlpool_rows: whirlpoolRows,
    boil_mass_kg: boilMass,
    whirlpool_mass_kg: whirlpoolMass,
    total_mass_kg: boilMass + whirlpoolMass,
  };
}

export const STUB_BOUNDARIES = {
  batch_sparge_solver: () => ({
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
    mash_thickness_l_per_kg: 3.0,
    previews: [
      { pin: "abv", og: 1.055, fg: 1.012, abv: 5.5, ok: true, reason: "" },
      { pin: "og", og: 1.052, fg: 1.011, abv: 5.3, ok: true, reason: "" },
      { pin: "fg", og: 1.058, fg: 1.012, abv: 5.9, ok: true, reason: "" },
    ],
  }),
  hop_bitterness_solver: hopOutputs,
  water_chemistry_solver: () => ({
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
  }),
};
