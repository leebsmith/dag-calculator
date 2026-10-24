// Presentation metadata for the mash slice (labels/units only — never domain
// values, and never fed back into the artifact).
export const MASH_NODES = {
  rests: "mash.rests",
  presetId: "mash.preset_id",
  strikeTemp: "mash.strike_water_temp_c",
  doughInTarget: "mash.dough_in_target_temp_c",
  restCount: "mash.rest_count",
  shape: "mash.shape",
  heatingRate: "equipment.mash_heating_rate_c_per_min",
  batchAttenuation: "batch.apparent_attenuation",
  yeastAttenuation: "batch.yeast.attenuation_pct",
  slice: "mash",
};

export const mashRegistry = {
  "mash.grain_temp_c": { label: "Grain temperature", unit: "°C" },
  "mash.tun_initial_temp_c": { label: "Tun initial temperature", unit: "°C" },
  "mash.dough_in_target_temp_c": { label: "Dough-in target", unit: "°C" },
  "mash.strike_water_temp_base_c": { label: "Strike base temp", unit: "°C" },
  "mash.strike_water_tun_offset_c": { label: "Tun thermal offset" },
  "mash.strike_water_temp_c": { label: "Strike water temp", unit: "°C" },
  "mash.rest_count": { label: "Mash steps", decimals: 0 },
  "mash.shape": { label: "Mash type" },
};
