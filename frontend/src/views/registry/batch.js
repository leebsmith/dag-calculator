// Presentation metadata for the batch-sparge slice (inputs; solver readouts are
// declared as readout tables on the step manifest, not as scalar fields).
export const batchRegistry = {
  "batch.target_abv": {
    label: "Target ABV",
    unit: "%",
    hint: "Set on the Style step; read-only here. Consumed by the batch-sparge solver.",
  },
  "batch.v_ferm": {
    label: "Fermenter volume",
    unit: "L",
    hint: "Cold packaged volume into the fermenter. The solver reverses kettle losses and boil-off to derive V_pre_boil.",
  },
  "batch.topology": {
    label: "Constraint Topology",
    hint: "Selects which intensive constraint the root-finder consumes.",
    optionLabels: {
      r_l_to_g: "Liquor-to-grist ratio",
      runoff_ratio: "Runnings ratio (r)",
    },
  },
  "batch.intensive_value": { label: "Intensive value" },
  "batch.hlt_starting_volume_l": { label: "HLT starting volume", unit: "L" },
  "batch.boil_time_min": { label: "Boil time", unit: "min" },
  "batch.boil_off_rate_l_per_hr": { label: "Boil-off rate", unit: "L/hr" },
  "batch.conversion_efficiency": { label: "Conversion efficiency", displayUnit: "pct" },
  "batch.apparent_attenuation": {
    label: "Batch attenuation",
    displayUnit: "pct",
    hint: "Solver output: extract-weighted wort AA clamped by the yeast cap.",
  },
  "batch.wort_aa": {
    label: "Wort attenuation",
    displayUnit: "pct",
    hint: "Extract-weighted malt and sugar fermentability before the yeast cap.",
  },
  "batch.grain_moisture_fraction": {
    label: "Fallback grain moisture (when a malt has none)",
    displayUnit: "pct",
    hint: "As-is moisture used for malts that publish none; feeds the solver's mass balance.",
  },
  "batch.target_ibu": {
    label: "Target IBU",
    unit: "IBU",
    hint: "Recipe bitterness target; split between the boil and the whirlpool.",
  },
  "batch.target_srm": {
    label: "Target SRM",
    hint: "Desired finished-beer color (a recorded target; actual color is derived from the grist).",
  },
  "batch.whirlpool_ibu_fraction": { label: "Whirlpool IBU share", displayUnit: "pct" },
  "batch.boil_target_ibu": { label: "Boil IBU", unit: "IBU" },
  "batch.whirlpool_target_ibu": { label: "Whirlpool IBU", unit: "IBU" },
  "solver.batch.sg_post_boil": { label: "Post-boil gravity" },
  "batch.realized_fg": { label: "Final gravity" },
  "batch.realized_abv": { label: "ABV", unit: "%" },
  "grist.finished_beer_srm": { label: "Beer color" },
};
