// Unit presentation: the dimensions the global switcher exposes, their display
// names, and the id -> symbol map the producer uses for readout labels. Pure
// presentation — never feeds back into the artifact.
//
// `group` clusters the master menu into columns: "Base" = single-reference
// quantities, "Derived" = compound/rate dimensions. Every dimension with
// alternate units must appear here (see tests/guards/unit-menu-coverage.test.js).
//
// Unit entries are `[id, symbol, decimals?]`. `decimals` is the per-UNIT display
// precision (e.g. SG needs 3, °P needs 1) — precision is a property of the unit,
// not the dimension, because switching units on the same field changes how many
// digits are meaningful. A dimension-level `decimals` remains a fallback for
// dimensions whose units share one precision (e.g. color).

export const UNIT_DIMENSIONS = [
  { id: "temperature", group: "Base", label: "Temperature", units: [["degC", "°C", 1], ["degF", "°F", 1]] },
  { id: "temperature_delta", group: "Base", label: "Temperature Δ", units: [["dC", "Δ°C", 1], ["dF", "Δ°F", 1]] },
  { id: "time", group: "Base", label: "Time", units: [["min", "min"], ["hr", "hr"], ["day", "day"]] },
  { id: "volume", group: "Base", label: "Volume", units: [["L", "L", 1], ["gal", "gal", 1], ["qt", "qt", 1], ["ml", "mL", 1]] },
  { id: "mass", group: "Base", label: "Mass", units: [["kg", "kg"], ["lb", "lb"], ["oz", "oz"], ["g", "g"]] },
  { id: "gravity", group: "Base", label: "Gravity", default: "Plato", units: [["SG", "SG", 3], ["Plato", "°P", 1]] },
  { id: "grain_color", group: "Base", label: "Grain Color", default: "EBC", decimals: 1, units: [["Lovibond", "°L"], ["EBC", "EBC"]] },
  { id: "beer_color", group: "Base", label: "Beer Color", default: "EBC", decimals: 1, units: [["SRM", "SRM"], ["EBC", "EBC"]] },
  { id: "percentage", group: "Base", label: "Percentage", default: "pct", units: [["fraction", "×1"], ["pct", "%"]] },
  { id: "volume_per_time", group: "Derived", label: "Boil-off rate", units: [["L_per_hr", "L/hr"], ["gal_per_hr", "gal/hr"]] },
  { id: "specific_heat", group: "Derived", label: "Specific Heat", units: [["kcal_per_kg_degC", "kcal/(kg·°C)"], ["btu_per_lb_degF", "BTU/(lb·°F)"]] },
  { id: "mash_thickness", group: "Derived", label: "Mash Thickness", units: [["L_per_kg", "L/kg"], ["qt_per_lb", "qt/lb"]] },
  { id: "extract_yield", group: "Derived", label: "Extract Yield", units: [["L_deg_per_kg", "L·°/kg"], ["gal_deg_per_lb", "gal·°/lb"]] },
  { id: "total_extract", group: "Derived", label: "Total Extract", units: [["L_deg", "L·°"], ["gal_pts", "gal·pts"]] },
];

export const UNIT_SYMBOLS = Object.fromEntries(
  UNIT_DIMENSIONS.map((d) => [d.id, Object.fromEntries(d.units.map(([id, sym]) => [id, sym]))])
);

// Per-unit display precision: the unit's own `decimals`, else the dimension's
// fallback, else null (the caller trims trailing zeros via `formatValue`).
export function unitDecimals(dimensionId, unitId) {
  const dim = UNIT_DIMENSIONS.find((d) => d.id === dimensionId);
  if (!dim) return null;
  const unit = dim.units.find(([id]) => id === unitId);
  return unit?.[2] ?? dim.decimals ?? null;
}

// UNIT_DIMENSIONS grouped for the master menu's columns, preserving order.
export const UNIT_GROUPS = (() => {
  const groups = new Map();
  for (const dim of UNIT_DIMENSIONS) {
    const key = dim.group ?? "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(dim);
  }
  return [...groups].map(([label, dims]) => ({ label, dims }));
})();
