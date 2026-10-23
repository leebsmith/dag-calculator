// Wire-level gate for the water solver: a target below the source is not a soft
// warning — salts only add, so the request is unsatisfiable. Checked against the
// adapted request body, where the pinned set and both ion vectors are known.

const ION_LABELS = {
  ca: "calcium",
  mg: "magnesium",
  na: "sodium",
  so4: "sulfate",
  cl: "chloride",
  alk: "alkalinity",
};

// The request body keys ions by field name; the pinned set uses short keys.
const PIN_FIELD = {
  ca: "calcium_ca",
  mg: "magnesium_mg",
  na: "sodium_na",
  so4: "sulfate_so4",
  cl: "chloride_cl",
  alk: "alkalinity_as_caco3",
};

export function waterTargetGate(inputs) {
  const pinned = inputs?.custom_pinned_ions ?? [];
  const target = inputs?.target ?? {};
  const source = inputs?.source ?? {};
  const short = [];
  for (const ion of pinned) {
    const field = PIN_FIELD[ion];
    if (!field) continue;
    const t = target[field];
    const s = source[field];
    if (typeof t !== "number" || typeof s !== "number") continue;
    if (t < s - 1e-9) short.push(ion);
  }
  if (short.length === 0) return null;
  const names = short.map((ion) => ION_LABELS[ion] ?? ion).join(", ");
  return `Target below source for ${names}. Salts only add ions — raise the target or uncheck it.`;
}

export function bindGate(gate) {
  return (binding, inputs) =>
    binding === "water_chemistry_solver" ? gate(inputs) : null;
}
