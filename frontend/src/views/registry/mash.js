// Presentation metadata for the mash slice (labels/units only — never domain
// values, and never fed back into the artifact).
import restDefinitions from "../../../../data/seeds/mash-rests.json" with { type: "json" };

const MASH_REST_LABELS = Object.fromEntries(
  Object.values(restDefinitions).map((rest) => [rest.rest_id, rest.name])
);

export const MASH_NODES = {
  rests: "mash.rests",
  presetId: "mash.preset_id",
  strikeTemp: "mash.strike_water_temp_c",
  doughInTarget: "mash.dough_in_target_temp_c",
  totalTime: "mash.total_time_min",
  rampTime: "mash.ramp_time_min",
  mashThickness: "solver.batch.mash_thickness_l_per_kg",
  slice: "mash",
};

export const mashRegistry = {
  "mash.grain_temp_c": { label: "Grain temperature" },
  "mash.tun_initial_temp_c": { label: "Tun initial temperature" },
  "mash.dough_in_target_temp_c": { label: "Dough-in target" },
  "mash.total_time_min": { label: "Total mash time" },
  "mash.strike_water_temp_base_c": { label: "Strike base temp" },
  "mash.strike_water_tun_offset_c": { label: "Tun thermal offset" },
  "mash.strike_water_temp_c": { label: "Strike water temp" },
  "mash.mash_phase_volume_l": {
    label: "Mash volume",
    hint: "Grist displacement + strike water (tun occupancy; excludes dead space).",
  },
  "mash.rests": { label: "Mash rests" },
  "mash.rests.rest_id": { label: "Step", optionLabels: MASH_REST_LABELS },
  "mash.rests.use_temp_c": { label: "Temp" },
  "mash.rests.duration_min": { label: "Time" },
  "mash.rests.enabled": { label: "Enabled" },
};
