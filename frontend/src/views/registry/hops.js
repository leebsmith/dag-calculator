// Presentation metadata for the hops slice (boil + whirlpool additions).
export const HOP_NODES = {
  collection: "batch.boil_hops",
  whirlpoolCollection: "batch.whirlpool_hops",
  boilIbu: "batch.boil_target_ibu",
  whirlpoolIbu: "batch.whirlpool_target_ibu",
  whirlpoolAmbient: "batch.whirlpool_ambient_temp_c",
  whirlpoolCoolingTimeConstant: "batch.whirlpool_cooling_time_constant_min",
  boilTime: "batch.boil_time_min",
  preBoilGravity: "solver.batch.cascade.sg_pre_boil",
  postBoilGravity: "solver.batch.sg_post_boil",
  postBoilVolume: "solver.batch.cascade.v_post_boil",
  slice: "hops",
};

export const hopsRegistry = {
  "batch.boil_hops": { label: "Boil hops" },
  "batch.boil_hops.hop_id": { label: "Hop ID" },
  "batch.boil_hops.name": { label: "Hop" },
  "batch.boil_hops.alpha_acid_pct": { label: "Alpha", displayUnit: "pct" },
  "batch.boil_hops.boil_time_fraction": { label: "Boil remaining", displayUnit: "pct" },
  "batch.boil_hops.parts": { label: "Parts" },
  "batch.boil_hops.pct": { label: "IBU share", displayUnit: "pct" },
  "batch.whirlpool_hops": { label: "Whirlpool hops" },
  "batch.whirlpool_hops.hop_id": { label: "Hop ID" },
  "batch.whirlpool_hops.name": { label: "Hop" },
  "batch.whirlpool_hops.alpha_acid_pct": { label: "Alpha", displayUnit: "pct" },
  "batch.whirlpool_hops.duration_min": { label: "Rest", unit: "min" },
  "batch.whirlpool_hops.initial_temp_c": { label: "Initial temp", unit: "°C" },
  "batch.whirlpool_hops.parts": { label: "Parts" },
  "batch.whirlpool_hops.pct": { label: "IBU share", displayUnit: "pct" },
  "batch.boil_target_ibu": { label: "Boil IBU", unit: "IBU" },
  "batch.whirlpool_target_ibu": { label: "Whirlpool IBU", unit: "IBU" },
  "batch.whirlpool_ambient_temp_c": {
    label: "Whirlpool ambient",
    unit: "°C",
    hint: "Room/air temperature used by the cooling curve.",
  },
  "batch.whirlpool_cooling_time_constant_min": {
    label: "Cooling time constant",
    unit: "min",
    hint: "1/k. 108.7 min = k 0.0092/min; lower means faster cooling.",
  },
};
