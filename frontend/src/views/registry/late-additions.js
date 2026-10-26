// Presentation metadata for the late-additions slice (sugar collection + readout).
export const LATE_ADDITION_NODES = {
  collection: "batch.sugars",
  mass: "grist.sugars_mass",
  color: "grist.sugar_weighted_lovibond",
  extract: "batch.s_late_add",
  // Sugar-effect operands (read-only; the panel never writes a root).
  effect: {
    extractTotal: "solver.batch.s_post_boil_target",
    sgPostBoil: "solver.batch.sg_post_boil",
    apparentAttenuation: "solver.batch.apparent_attenuation",
    gristYield: "grist.weighted_yield_fraction",
    grainMoisture: "batch.grain_moisture_fraction",
  },
  slice: "late-additions",
};

export const lateAdditionsRegistry = {
  "batch.sugars": { label: "Late additions" },
  "batch.sugars.sugar_id": { label: "Sugar ID" },
  "batch.sugars.name": { label: "Sugar" },
  "batch.sugars.mass_kg": { label: "Mass", unit: "kg" },
  "batch.sugars.yield_fraction": { label: "Yield", displayUnit: "pct", decimals: 1 },
  "batch.sugars.fermentability_fraction": { label: "Fermentable", displayUnit: "pct", decimals: 1 },
  "batch.sugars.color_lovibond": { label: "Color" },
  "batch.s_late_add": { label: "Total extract", unit: "kg", decimals: 1 },
  "grist.sugars_mass": { label: "Total sugar mass" },
  "grist.sugar_weighted_lovibond": { label: "Weighted sugar color" },
};
