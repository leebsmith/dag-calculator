// Genuinely cross-cutting node ids used by the adapter's field and draft
// actions. Card-specific ids live with their card registries.

export const SYSTEM_NODES = {
  topology: "batch.topology",
  mashThickness: "batch.mash_thickness_l_per_kg",
  runoffRatio: "batch.runoff_ratio",
  apparentAttenuation: "solver.batch.apparent_attenuation",
  majorMalts: "grist.major_malts",
  boilHops: "batch.boil_hops",
  whirlpoolHops: "batch.whirlpool_hops",
};
