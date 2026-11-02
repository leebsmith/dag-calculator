// Presentation metadata for the hops slice (boil + whirlpool additions).
export const WHIRLPOOL_ROW_DEFAULTS = {
  knockoutMin: 30,
  startTempC: 99,
  additionAtMin: 0,
  initialTempC: 95,
  lupulinAdditionAtMin: 5,
  lupulinInitialTempC: 76,
};

export const HOP_NODES = {
  collection: "batch.boil_hops",
  boilRows: "solver.hops.boil_rows",
  whirlpoolRows: "solver.hops.whirlpool_rows",
  boilMass: "solver.hops.boil_mass_kg",
  boilAlphaMass: "solver.hops.boil_alpha_mass_kg",
  whirlpoolAlphaMass: "solver.hops.whirlpool_alpha_mass_kg",
  whirlpoolMass: "solver.hops.whirlpool_mass_kg",
  totalMass: "solver.hops.total_mass_kg",
  whirlpoolHotIbu: "solver.hops.whirlpool_hot_ibu",
  whirlpoolCoolIbu: "solver.hops.whirlpool_cool_ibu",
  whirlpoolTimeline: "solver.hops.whirlpool_timeline",
  whirlpoolChills: "solver.hops.whirlpool_chills",
  whirlpoolCollection: "batch.whirlpool_hops",
  boilIbu: "batch.boil_target_ibu",
  whirlpoolIbu: "batch.whirlpool_target_ibu",
  totalIbu: "batch.target_ibu",
  whirlpoolAmbient: "batch.whirlpool_ambient_temp_c",
  whirlpoolCoolingTimeConstant: "batch.whirlpool_cooling_time_constant_min",
  whirlpoolKnockout: "batch.whirlpool_knockout_min",
  whirlpoolStartTemp: "batch.whirlpool_start_temp_c",
  coolingCurveId: "batch.cooling_curve_id",
  boilTime: "batch.boil_time_min",
  postBoilVolume: "solver.batch.cascade.v_post_boil",
  slice: "hops",
};

const HOP_FORM_LABELS = {
  whole_cone: "Whole cone",
  t90_pellet: "T-90 pellet",
  flowable_extract: "Extract",
  lupulin_pellet: "Lupulin concentrate",
};

export const hopsRegistry = {
  "batch.boil_hops": { label: "Boil hops" },
  "batch.boil_hops.hop_id": { label: "Hop ID" },
  "batch.boil_hops.name": { label: "Hop" },
  "batch.boil_hops.alpha_acid_pct": { label: "Alpha" },
  "batch.boil_hops.boil_time_fraction": { label: "Portion of boil" },
  "batch.boil_hops.parts": { label: "Parts" },
  "batch.boil_hops.product_form": { label: "Form", optionLabels: HOP_FORM_LABELS },
  "batch.boil_hops.pct": { label: "IBU share" },
  "batch.whirlpool_hops": { label: "Whirlpool hops" },
  "batch.whirlpool_hops.hop_id": { label: "Hop ID" },
  "batch.whirlpool_hops.name": { label: "Hop" },
  "batch.whirlpool_hops.product_form": { label: "Form", optionLabels: HOP_FORM_LABELS },
  "batch.whirlpool_hops.alpha_acid_pct": { label: "Alpha" },
  "batch.whirlpool_hops.addition_at_min": { label: "After flameout" },
  "batch.whirlpool_hops.initial_temp_c": { label: "Temp" },
  "batch.whirlpool_hops.parts": { label: "Parts" },
  "batch.whirlpool_hops.pct": { label: "IBU share" },
  "solver.hops.boil_mass_kg": { label: "Boil hop mass", displayUnit: "g" },
  "solver.hops.whirlpool_mass_kg": { label: "Whirlpool hop mass", displayUnit: "g" },
  "solver.hops.total_mass_kg": { label: "Total hop mass", displayUnit: "g" },
  "batch.whirlpool_ambient_temp_c": {
    label: "Whirlpool ambient",
    hint: "Room/air temperature used by the cooling curve.",
  },
  "batch.whirlpool_cooling_time_constant_min": {
    label: "Cooling time constant",
    hint: "1/k. 108.7 min = k 0.0092/min; lower means faster cooling.",
  },
  "batch.cooling_curve_id": {
    label: "Cooling curve",
    hint: "The authored curve that supplied the time constant.",
  },
};
