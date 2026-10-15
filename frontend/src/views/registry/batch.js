// Presentation metadata for the batch-sparge slice (inputs; solver readouts are
// declared as readout tables on the step manifest, not as scalar fields).
export const batchRegistry = {
  "batch.target_abv": {
    label: "Target ABV",
    unit: "%",
    hint: "Always expressed as a percentage (no unit toggle). Consumed by the batch-sparge solver.",
  },
  "batch.v_ferm": {
    label: "Fermenter volume",
    unit: "L",
    hint: "Cold packaged volume into the fermenter. The solver reverses kettle losses and boil-off to derive V_pre_boil.",
  },
  "batch.topology": {
    label: "Constraint Topology",
    hint: "Selects which intensive constraint the root-finder consumes.",
  },
  "batch.intensive_value": { label: "Intensive value (L/kg or r)" },
  "batch.hlt_starting_volume_l": { label: "HLT starting volume", unit: "L" },
  "batch.boil_time_min": { label: "Boil time", unit: "min" },
  "batch.boil_off_rate_l_per_hr": { label: "Boil-off rate", unit: "L/hr" },
  "batch.conversion_efficiency": { label: "Conversion efficiency", displayUnit: "pct" },
  "batch.apparent_attenuation": { label: "Apparent attenuation", displayUnit: "pct" },
};
