// Presentation metadata for the yeast slice (selection picker + readouts).
export const YEAST_NODES = {
  selection: "batch.yeast_id",
  selectionNode: "batch.yeast",
  derate: "batch.attenuation_derate",
  cap: "batch.yeast_cap",
  slice: "yeast",
};

export const yeastRegistry = {
  "batch.yeast_id": { label: "Yeast" },
  "batch.yeast.attenuation_pct": { label: "Typical attenuation" },
  "batch.attenuation_derate": {
    label: "Batch derate",
    displayUnit: "pct",
    hint: "Per-batch factor applied to the strain's attenuation cap. 95% means 95% of the strain limit.",
  },
  "batch.yeast_cap": {
    label: "Yeast attenuation cap",
    displayUnit: "pct",
    hint: "Strain attenuation × batch derate; the solver clamps the wort AA to this.",
  },
  "batch.yeast.flocculation": { label: "Flocculation" },
  "batch.yeast.alcohol_tolerance": { label: "Alcohol tolerance" },
};
