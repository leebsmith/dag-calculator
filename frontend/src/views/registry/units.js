// Unit presentation: the dimensions the global switcher exposes, their display
// names, and the id -> symbol map the producer uses for readout labels. Pure
// presentation — never feeds back into the artifact.
//
// `group` clusters the master menu into columns: "Base" = single-reference
// quantities, "Derived" = compound/rate dimensions. Every dimension with
// alternate units must appear here (see tests/guards/unit-menu-coverage.test.js).

export const UNIT_DIMENSIONS = [
  { id: "temperature", group: "Base", label: "Temperature", units: [["degC", "°C"], ["degF", "°F"]] },
  { id: "temperature_delta", group: "Base", label: "Temperature Δ", units: [["dC", "Δ°C"], ["dF", "Δ°F"]] },
  { id: "time", group: "Base", label: "Time", units: [["min", "min"], ["hr", "hr"], ["day", "day"]] },
  { id: "volume", group: "Base", label: "Volume", units: [["L", "L"], ["gal", "gal"], ["qt", "qt"], ["ml", "mL"]] },
  { id: "mass", group: "Base", label: "Mass", units: [["kg", "kg"], ["lb", "lb"], ["oz", "oz"], ["g", "g"]] },
  { id: "gravity", group: "Base", label: "Gravity", units: [["SG", "SG"], ["Plato", "°P"]] },
  { id: "grain_color", group: "Base", label: "Grain Color", units: [["Lovibond", "°L"], ["EBC", "EBC"]] },
  { id: "beer_color", group: "Base", label: "Beer Color", units: [["SRM", "SRM"], ["EBC", "EBC"]] },
  { id: "percentage", group: "Base", label: "Percentage", units: [["fraction", "×1"], ["pct", "%"]] },
  { id: "volume_per_time", group: "Derived", label: "Boil-off rate", units: [["L_per_hr", "L/hr"], ["gal_per_hr", "gal/hr"]] },
  { id: "specific_heat", group: "Derived", label: "Specific Heat", units: [["kcal_per_kg_degC", "kcal/(kg·°C)"], ["btu_per_lb_degF", "BTU/(lb·°F)"]] },
  { id: "mash_thickness", group: "Derived", label: "Mash Thickness", units: [["L_per_kg", "L/kg"], ["qt_per_lb", "qt/lb"]] },
  { id: "extract_yield", group: "Derived", label: "Extract Yield", units: [["L_deg_per_kg", "L·°/kg"], ["gal_deg_per_lb", "gal·°/lb"]] },
  { id: "total_extract", group: "Derived", label: "Total Extract", units: [["L_deg", "L·°"], ["gal_pts", "gal·pts"]] },
];

export const UNIT_SYMBOLS = Object.fromEntries(
  UNIT_DIMENSIONS.map((d) => [d.id, Object.fromEntries(d.units)])
);

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
