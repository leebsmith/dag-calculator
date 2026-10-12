// Step manifest: the authored workflow order. Each step declares its partial and
// the artifact nodes it binds (scalar fields). No domain logic here.
import { registry } from "./registry/index.js";

export const steps = [
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
