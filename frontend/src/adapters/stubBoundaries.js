// Offline boundary stubs (default when no API base is configured). Full flattened
// output sets matching the artifact's boundary output keys.
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
    "cascade.s_run1": 2.0,
    "cascade.s_run2": 0.6,
    "cascade.sg_pre_boil": 1.048,
    "cascade.v_post_boil": 21.0,
    "cascade.mash_thickness_l_per_kg": 3.0,
    max_achievable_abv: 10.0,
    "hlt.v_hlt_debt": 1.0,
    "hlt.v_hlt_after_strike": 16.0,
    "hlt.v_hlt_top_up": 0.0,
    "hlt.v_sparge_deliverable": 15.0,
    mash_thickness_l_per_kg: 3.0,
  }),
  water_chemistry_solver: () => ({
    strategy: "CALCIUM_FLOOR",
    "prescription.predicted_mash_ph": 5.4,
    "prescription.mash_ph_status": "OPTIMAL",
    "prescription.residual_hlt_water_l": 0.0,
    "prescription.sparge_tannin_warning": false,
  }),
};
