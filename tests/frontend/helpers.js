// Shared test fixtures for the frontend engine suite.

import { readFileSync } from "node:fs";

export function loadArtifact() {
  const path = new URL("../../frontend/src/engine/artifact.json", import.meta.url);
  return JSON.parse(readFileSync(path, "utf8"));
}

export function makeFixtures() {
  const references = {
    "herms-30l": {
      id: "herms-30l",
      name: "HERMS 30L",
      max_hlt_volume_l: 30,
      boil_off_rate_l_per_hr: 3,
      mash_tun_specific_heat: 0.12,
      mash_tun_mass_kg: 6.5,
    },
  };

  const collections = {
    "grist.major_malts": [
      {
        catalog_id: "pils",
        name: "Pilsner",
        category: "BASE",
        parts: 80,
        pct: 0.8,
        yield_fraction: 0.8,
        color_lovibond: 1.5,
        moisture_pct: 0.04,
      },
      {
        catalog_id: "c40",
        name: "Crystal 40",
        category: "CRYSTAL",
        parts: 20,
        pct: 0.2,
        yield_fraction: 0.74,
        color_lovibond: 40,
        moisture_pct: 0.04,
      },
    ],
  };

  const boundaries = {
    batch_sparge_solver: () => ({
      mash_thickness_l_per_kg: 3.0,
      v_strike: 14.0,
      m_grist: 4.7,
    }),
    water_chemistry_solver: () => ({ predicted_mash_ph: 5.4 }),
  };

  const roots = {
    "mash.dough_in_target_temp_c": 67.0,
    "mash.grain_temp_c": 20.0,
    "mash.tun_initial_temp_c": 20.0,
  };

  return { references, collections, boundaries, roots };
}
