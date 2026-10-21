// Presentation metadata for the hops slice (boil additions collection + readouts).
export const HOP_NODES = {
  collection: "batch.boil_hops",
  boilIbu: "batch.boil_target_ibu",
  whirlpoolIbu: "batch.whirlpool_target_ibu",
  boilTime: "batch.boil_time_min",
  preBoilGravity: "solver.batch.cascade.sg_pre_boil",
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
  "batch.boil_target_ibu": { label: "Boil IBU", unit: "IBU" },
  "batch.whirlpool_target_ibu": { label: "Whirlpool IBU", unit: "IBU" },
};
