// Unit presentation: the dimensions the global switcher exposes, their display
// names, and the id -> symbol map the producer uses for readout labels. Pure
// presentation — never feeds back into the artifact.

export const UNIT_DIMENSIONS = [
  { id: "temperature", label: "Temperature", units: [["degC", "°C"], ["degF", "°F"]] },
  { id: "volume", label: "Volume", units: [["L", "L"], ["gal", "gal"], ["qt", "qt"], ["ml", "mL"]] },
  { id: "mass", label: "Mass", units: [["kg", "kg"], ["lb", "lb"], ["g", "g"]] },
  { id: "gravity", label: "Gravity", units: [["SG", "SG"], ["Plato", "°P"]] },
  { id: "grain_color", label: "Grain Color", units: [["Lovibond", "°L"], ["EBC", "EBC"]] },
  { id: "beer_color", label: "Beer Color", units: [["SRM", "SRM"], ["EBC", "EBC"]] },
  { id: "percentage", label: "Percentage", units: [["fraction", "×1"], ["pct", "%"]] },
];

export const UNIT_SYMBOLS = Object.fromEntries(
  UNIT_DIMENSIONS.map((d) => [d.id, Object.fromEntries(d.units)])
);
