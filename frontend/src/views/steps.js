// Step manifest: the authored workflow order. Each step declares its partial and
// the artifact nodes / reference paths it binds. No domain logic here.
import { registry } from "./registry/index.js";

export const steps = [
  {
    id: "equipment",
    slice: "equipment",
    title: "Equipment Profile",
    partial: "./src/partials/step-equipment-profile.html",
    fields: [
      "equipment.mash_tun_specific_heat",
      "equipment.mash_tun_mass_kg",
      "equipment.max_hlt_volume_l",
      "equipment.boil_off_rate_l_per_hr",
      "equipment.conversion_efficiency",
      "equipment.shrinkage_pct",
    ],
  },
  {
    id: "batch",
    slice: "batch",
    title: "Batch Sparge",
    partial: "./src/partials/step-batch-solver.html",
    fields: [
      "batch.target_abv",
      "batch.v_ferm",
      "batch.topology",
      "batch.intensive_value",
      "batch.hlt_starting_volume_l",
      "batch.boil_time_min",
      "batch.apparent_attenuation",
      "solver.batch.sg_post_boil",
      "solver.batch.v_pre_boil",
      "solver.batch.m_grist",
      "solver.batch.mash_thickness_l_per_kg",
      "solver.batch.cascade.v_strike",
      "solver.batch.cascade.v_sparge",
      "solver.batch.hlt.v_hlt_top_up",
    ],
  },
  {
    id: "mash",
    slice: "mash",
    title: "Mash",
    partial: "./src/partials/step-mash.html",
    fields: [
      "mash.grain_temp_c",
      "mash.tun_initial_temp_c",
      "mash.dough_in_target_temp_c",
      "mash.strike_water_temp_base_c",
      "mash.strike_water_tun_offset_c",
      "mash.strike_water_temp_c",
    ],
  },
];

export { registry };
