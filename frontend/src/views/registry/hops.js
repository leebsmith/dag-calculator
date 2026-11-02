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

export const HOP_FORM_LABELS = {
  whole_cone: "Whole cone",
  t90_pellet: "T-90 pellet",
  flowable_extract: "Extract",
  lupulin_pellet: "Lupulin concentrate",
};

