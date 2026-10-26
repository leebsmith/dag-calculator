// Presentation metadata for the yeast slice (selection picker + readouts).
export const YEAST_NODES = {
  selection: "batch.yeast_id",
  selectionNode: "batch.yeast",
  derate: "batch.attenuation_derate_points",
  cap: "batch.yeast_cap",
  slice: "yeast",
};

export const yeastRegistry = {
  "batch.yeast_id": { label: "Yeast" },
  "batch.yeast.attenuation_pct": { label: "Typical attenuation" },
  "batch.attenuation_derate_points": {
    label: "Batch derate (points)",
    displayUnit: "pct",
    hint: "Percentage points subtracted from the strain's published attenuation. 0 = no derate.",
  },
  "batch.yeast_cap": {
    label: "Malt attenuation cap",
    displayUnit: "pct",
    hint: "Strain attenuation × batch derate, apparent. The solver converts it to real attenuation at each candidate OE and clamps malt fermentability only; sugar is never capped.",
  },
  "batch.yeast.flocculation": { label: "Flocculation" },
  "batch.yeast.alcohol_tolerance": { label: "Alcohol tolerance" },
};
