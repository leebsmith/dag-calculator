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
  slice: "late-additions",
};

export const lateAdditionsRegistry = {
  "batch.late_addition_intent": {
    label: "Late addition mode",
    hint: "Dose by mass, or author the sugar share of total post-boil extract.",
    optionLabels: {
      dose: "Dose by mass",
      share: "Share of extract",
    },
  },
  "batch.sugar_extract_share": {
    label: "Sugar share",
    displayUnit: "pct",
    decimals: 1,
    hint: "Sugar extract as a share of total post-boil extract; the solver evaluates it per candidate gravity.",
  },
  "batch.sugars": { label: "Late additions" },
  "batch.sugars.sugar_id": { label: "Sugar ID" },
  "batch.sugars.name": { label: "Sugar" },
  "batch.sugars.mass_kg": { label: "Mass", unit: "kg" },
  "batch.sugars.parts": { label: "Parts", decimals: 2 },
  "batch.sugars.resolved_mass_kg": { label: "Resolved mass", unit: "kg", decimals: 2 },
  "batch.sugars.yield_fraction": { label: "Yield", displayUnit: "pct", decimals: 1 },
  "batch.sugars.fermentability_fraction": { label: "Fermentable", displayUnit: "pct", decimals: 1 },
  "batch.sugars.color_lovibond": { label: "Color" },
  "batch.s_late_add": { label: "Dose extract", unit: "kg", decimals: 1 },
  "batch.sugar_extract_total": { label: "Late extract", unit: "kg", decimals: 2 },
  "grist.sugars_mass": { label: "Total sugar mass" },
  "grist.sugar_weighted_lovibond": { label: "Weighted sugar color" },
};
