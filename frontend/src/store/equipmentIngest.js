// Equipment-profile ingestion adapter (pure convenience): seeds may carry an
// optional `{ units, data }` wrapper where `units` is "metric" (data read
// verbatim) or "imperial" (data converted to metric on ingestion). The output is
// the flat metric `id -> component` map the engine's `equipment.profile`
// selection and the picker already expect, so no downstream code changes.
//
// Conversion reuses the artifact's dimension table via `toBase` (single source
// of truth for factors), so no hardcoded constants live here. This module is a
// leaf and imports only the pure units helper — never the engine runtime.

import { toBase } from "../engine/units.js";

// Metric field key -> imperial field key. Percentage fields
// (conversion_efficiency, shrinkage_pct) and identity fields (id/name/
// description) are unitless and intentionally absent: they pass through as-is.
const IMPERIAL_KEYS = {
  max_kettle_volume_l: "max_kettle_volume_gal",
  max_mash_tun_volume_l: "max_mash_tun_volume_gal",
  max_hlt_volume_l: "max_hlt_volume_gal",
  mash_dead_space_l: "mash_dead_space_gal",
  mash_transfer_loss_l: "mash_transfer_loss_gal",
  kettle_dead_space_l: "kettle_dead_space_gal",
  kettle_transfer_loss_l: "kettle_transfer_loss_gal",
  trub_loss_l: "trub_loss_gal",
  hlt_dead_space_l: "hlt_dead_space_gal",
  hlt_transfer_loss_l: "hlt_transfer_loss_gal",
  hlt_coil_floor_l: "hlt_coil_floor_gal",
  boil_off_rate_l_per_hr: "boil_off_rate_gal_per_hr",
  grain_absorption_factor_l_per_kg: "grain_absorption_factor_qt_per_lb",
  mash_tun_mass_kg: "mash_tun_mass_lb",
  mash_tun_specific_heat: "mash_tun_specific_heat_btu_per_lb_f",
};

// The imperial unit each dimension is authored in (matches artifact unit ids).
const IMPERIAL_UNIT = {
  volume: "gal",
  mass: "lb",
  volume_per_time: "gal_per_hr",
  specific_heat: "btu_per_lb_degF",
  mash_thickness: "qt_per_lb",
};

export function ingestEquipment(rawMap, artifact) {
  const schema = artifact.primitive_schemas.equipment;
  const out = {};
  for (const [id, profile] of Object.entries(rawMap)) {
    const data = profile?.data ?? profile;
    const units = profile?.units ?? "metric";
    const component = { ...data };
    if (units === "imperial") {
      for (const [metricKey, imperialKey] of Object.entries(IMPERIAL_KEYS)) {
        const value = component[imperialKey];
        if (value === undefined) continue;
        const dimension = schema[metricKey]?.dimension;
        component[metricKey] = toBase(artifact, dimension, IMPERIAL_UNIT[dimension], value);
        delete component[imperialKey];
      }
    }
    out[id] = component;
  }
  return out;
}
