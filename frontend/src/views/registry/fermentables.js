// Presentation metadata for the fermentables slice (grist collection table).
export const FERMENTABLE_NODES = {
  majorMalts: "grist.major_malts",
  traceMalts: "grist.trace_malts",
  weightedLovibond: "grist.weighted_lovibond",
  weightedYield: "grist.weighted_yield_fraction",
  traceMass: "grist.trace_malts_mass",
  traceColor: "grist.trace_weighted_lovibond",
  slice: "fermentables",
};

export const fermentablesRegistry = {
  "grist.major_malts": { label: "Grain bill" },
  "grist.major_malts.name": { label: "Malt" },
  "grist.major_malts.category": { label: "Type" },
  "grist.major_malts.pct": { label: "Pct", displayUnit: "pct" },
  "grist.major_malts.parts": { label: "Parts" },
  "grist.major_malts.yield_fraction": { label: "Yield", displayUnit: "pct" },
  "grist.major_malts.color_lovibond": { label: "Color" },
  "grist.trace_malts": { label: "Trace malts" },
  "grist.trace_malts.name": { label: "Malt" },
  "grist.trace_malts.category": { label: "Type" },
  "grist.trace_malts.mass_kg": { label: "Mass", displayUnit: "oz" },
  "grist.trace_malts.yield_fraction": { label: "Yield", displayUnit: "pct" },
  "grist.trace_malts.color_lovibond": { label: "Color" },
  "grist.weighted_lovibond": {
    label: "Weighted grist color",
    hint: "Mass-weighted malt color (grain, not finished beer).",
  },
  "grist.weighted_yield_fraction": { label: "Weighted extract yield", displayUnit: "pct" },
  "grist.trace_malts_mass": { label: "Trace malt mass", displayUnit: "oz" },
  "grist.trace_weighted_lovibond": { label: "Weighted trace color" },
};
