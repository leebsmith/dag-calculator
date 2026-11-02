// Presentation metadata for the late-additions slice (sugar collection + readout).
export const LATE_ADDITION_NODES = {
  collection: "batch.sugars",
  intent: "batch.late_addition_intent",
  share: "batch.sugar_extract_share",
  mass: "grist.sugars_mass",
  color: "grist.sugar_weighted_lovibond",
  extract: "batch.sugar_extract_total",
  dose: "batch.s_late_add",
  preview: "solver.batch.previews",
  // Sugar-effect operands (read-only; the panel never writes a root).
  effect: {
    extractTotal: "solver.batch.s_post_boil_target",
    sgPostBoil: "solver.batch.sg_post_boil",
    apparentAttenuation: "solver.batch.apparent_attenuation",
    gristYield: "grist.weighted_yield_fraction",
    grainMoisture: "batch.grain_moisture_fraction",
  },
  slice: "fermentables",
};

