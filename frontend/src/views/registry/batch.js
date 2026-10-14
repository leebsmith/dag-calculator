// Presentation metadata for the batch-sparge slice (inputs + boundary readouts).
export const batchRegistry = {
  "batch.target_abv": { label: "Target ABV", unit: "%" },
  "batch.v_ferm": { label: "Fermenter volume", unit: "L" },
  "batch.topology": { label: "Topology" },
  "batch.intensive_value": { label: "Intensive value (L/kg or r)" },
  "batch.hlt_starting_volume_l": { label: "HLT starting volume", unit: "L" },
  "batch.boil_time_min": { label: "Boil time", unit: "min" },
  "batch.apparent_attenuation": { label: "Apparent attenuation", displayUnit: "pct" },

  "solver.batch.sg_post_boil": { label: "Post-boil SG" },
  "solver.batch.v_pre_boil": { label: "Pre-boil volume", unit: "L" },
  "solver.batch.m_grist": { label: "Grist mass", unit: "kg" },
  "solver.batch.mash_thickness_l_per_kg": { label: "Mash thickness", unit: "L/kg" },
  "solver.batch.cascade.v_strike": { label: "Strike volume", unit: "L" },
  "solver.batch.cascade.v_sparge": { label: "Sparge volume", unit: "L" },
  "solver.batch.hlt.v_hlt_top_up": { label: "HLT top-up", unit: "L" },
};
