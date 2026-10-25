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
    label: "Yeast attenuation cap",
    displayUnit: "pct",
    hint: "Strain attenuation × batch derate; the solver clamps the wort AA to this.",
  },
  "batch.yeast.flocculation": { label: "Flocculation" },
  "batch.yeast.alcohol_tolerance": { label: "Alcohol tolerance" },
};
