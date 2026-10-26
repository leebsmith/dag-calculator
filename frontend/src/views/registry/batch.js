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
  "batch.mash_thickness_l_per_kg": {
    label: "Liquor-to-Grist Ratio",
    hint: "Strike water per grist mass; follows the Mash Thickness unit preference.",
  },
  "batch.runoff_ratio": {
    label: "Runoff Ratio r",
    hint: "V_run1 / V_run2; 1.0 is equal runnings.",
  },
  "batch.hlt_starting_volume_l": { label: "HLT starting volume", unit: "L" },
  "batch.boil_time_min": { label: "Boil time", unit: "min" },
  "batch.boil_off_rate_l_per_hr": { label: "Boil-off rate", unit: "L/hr" },
  "batch.conversion_efficiency": { label: "Conversion efficiency", displayUnit: "pct" },
  "solver.batch.apparent_attenuation": {
    label: "Apparent attenuation",
    displayUnit: "pct",
    hint: "Solver output: the batch's apparent attenuation. Sugar is uncapped, so it can exceed the yeast's malt attenuation cap.",
  },
  "solver.batch.real_attenuation": {
    label: "Real attenuation",
    displayUnit: "pct",
    hint: "Solver output: the share of extract actually fermented (RDF), after the yeast cap and any dextrin consumption.",
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
