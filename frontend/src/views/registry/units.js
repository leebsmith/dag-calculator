// Unit presentation: the dimensions the global switcher exposes, their display
// names, and the id -> symbol map the producer uses for readout labels. Pure
// presentation — never feeds back into the artifact.

export const UNIT_DIMENSIONS = [
  { id: "temperature", label: "Temperature", units: [["degC", "°C"], ["degF", "°F"]] },
  { id: "temperature_delta", label: "Temperature Δ", units: [["dC", "Δ°C"], ["dF", "Δ°F"]] },
  { id: "volume", label: "Volume", units: [["L", "L"], ["gal", "gal"], ["qt", "qt"], ["ml", "mL"]] },
  { id: "mass", label: "Mass", units: [["kg", "kg"], ["lb", "lb"], ["oz", "oz"], ["g", "g"]] },
  { id: "gravity", label: "Gravity", units: [["SG", "SG"], ["Plato", "°P"]] },
  { id: "grain_color", label: "Grain Color", units: [["Lovibond", "°L"], ["EBC", "EBC"]] },
  { id: "beer_color", label: "Beer Color", units: [["SRM", "SRM"], ["EBC", "EBC"]] },
  { id: "specific_heat", label: "Specific Heat", units: [["kcal_per_kg_degC", "kcal/(kg·°C)"], ["btu_per_lb_degF", "BTU/(lb·°F)"]] },
  { id: "mash_thickness", label: "Mash Thickness", units: [["L_per_kg", "L/kg"], ["qt_per_lb", "qt/lb"]] },
  { id: "extract_yield", label: "Extract Yield", units: [["L_deg_per_kg", "L·°/kg"], ["gal_deg_per_lb", "gal·°/lb"]] },
  { id: "total_extract", label: "Total Extract", units: [["L_deg", "L·°"], ["gal_pts", "gal·pts"]] },
  { id: "percentage", label: "Percentage", units: [["fraction", "×1"], ["pct", "%"]] },
];

export const UNIT_SYMBOLS = Object.fromEntries(
  UNIT_DIMENSIONS.map((d) => [d.id, Object.fromEntries(d.units)])
);
