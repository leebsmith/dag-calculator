// Presentation metadata for the water-chemistry slice (pickers, ion readouts,
// choices, and solver.water readouts).

// One row per working ion: the report key it is read from, the router's short
// pin key, and the label. The card derives its grid from this table so the row
// key space and the pin key space cannot drift apart.
export const WATER_IONS = [
  { ion: "calcium_ca", pin: "ca", label: "Calcium", source: "calcium_ca" },
  { ion: "magnesium_mg", pin: "mg", label: "Magnesium", source: "magnesium_mg" },
  { ion: "sodium_na", pin: "na", label: "Sodium", source: "sodium_na" },
  { ion: "sulfate_so4", pin: "so4", label: "Sulfate", source: "sulfate_so4" },
  { ion: "chloride_cl", pin: "cl", label: "Chloride", source: "chloride_cl" },
  { ion: "alkalinity_as_caco3", pin: "alk", label: "Alkalinity", source: "total_alkalinity_caco3" },
];

// Which ions a routed mode constrains. Short keys, matching the backend router.
// Retained for the status vocabulary only; the UI derives the mode from the
// checked target set instead of routing independently.
export function constraintStatusFor(mode, pin) {
  if (mode === "OPTIMIZE") return "Best fit";
  if (mode === "HYBRID" && pin === "alk") return "Buffer";
  return "Target";
}

export const WATER_ION_BY_PIN = Object.fromEntries(WATER_IONS.map((row) => [row.pin, row.ion]));

// Ions a profile targets: the ones it declares a number for (nulls float).
export function heldFromProfile(profile) {
  return WATER_IONS.filter(({ ion }) => typeof profile?.[ion] === "number").map((row) => row.pin);
}

// The router's canonical strategy for a checked-with-value set. Every other
// subset is the sparse linear engine with these ions as pins.
export function strategyForHeld(held) {
  const set = new Set(held);
  if (set.size === 0) return "BASELINE";
  if (set.size === 6) return "OPTIMIZE";
  if (set.size === 2 && set.has("so4") && set.has("cl")) return "CALCIUM_FLOOR";
  if (set.size === 3 && set.has("so4") && set.has("cl") && set.has("alk")) return "HYBRID";
  return "CUSTOM";
}

const ION_SHORT = { ca: "Ca", mg: "Mg", na: "Na", so4: "SO₄", cl: "Cl", alk: "Alk" };

export function constraintLabel(held) {
  const ordered = WATER_IONS.map((row) => row.pin).filter((pin) => held.includes(pin));
  if (ordered.length === 0) return "No targets";
  if (ordered.length === 6) return "All six";
  return ordered.map((pin) => ION_SHORT[pin]).join("/");
}

// One line under the grid: what the solver will actually do with this set.
export function routeSummary(held) {
  const count = held.length;
  if (count === 0) return "No targets — baseline (no salt dosing)";
  if (count === 6) return "Targets: all six — best fit, nothing held exactly";
  const suffix = count === 5 ? "exactly determined, may be infeasible" : "exact";
  return `Targets: ${constraintLabel(held)} (${count}) — ${suffix}`;
}

export function targetWarningFor(held) {
  if (held.length === 5) {
    return "5 targets — exactly determined. The solver may fail to find a feasible dose; unpin one to leave a degree of freedom.";
  }
  if (held.length === 6) {
    return "All six targets — best fit, not exact. The solver minimises error and guarantees no individual target.";
  }
  return "";
}

export const WATER_NODES = {

  slice: "water",
  saltDistribution: "water.salt_distribution",
  gypsumForm: "water.gypsum_form",
  cacl2Form: "water.cacl2_form",
  acidMedium: "water.acid_medium",
  alkalineAgent: "water.preferred_alkaline_agent",
  vMashTreat: "solver.batch.cascade.v_strike",
  vHltTreat: "batch.sparge_salted_volume",
  spargeSaltedVolume: "batch.sparge_salted_volume",
  vSpargeDeliverable: "solver.batch.hlt.v_sparge_deliverable",
  vRun1: "solver.batch.cascade.v_run1",
  vRun2: "solver.batch.cascade.v_run2",
  vSparge: "solver.batch.cascade.v_sparge",
  hltStart: "batch.hlt_starting_volume_l",
  surplusSpargeCapacity: "batch.surplus_sparge_capacity",
  residualHlt: "solver.water.prescription.residual_hlt_water_l",
  mashAdditions: "solver.water.mash_additions",
  spargeAdditions: "solver.water.sparge_additions",
  postMashIons: "solver.water.post_salt_mash_ions",
  postHltIons: "solver.water.post_salt_hlt_ions",
  kettleBlend: "water.kettle_blend",
  kettleRatio: "water.kettle_blend.sulfate_chloride_ratio",
  targetRatio: "water.target.sulfate_chloride_ratio",
  postDoseIons: "solver.water.post_dose_mash_ions",
  resolvedStrategy: "solver.water.strategy",
  strategy: "water.strategy",
  target: "water.target",
  targetProfileId: "water.target_profile_id",
  targetMashPh: "water.target_mash_ph",
  predictedPh: "solver.water.prescription.predicted_mash_ph",
  phStatus: "solver.water.prescription.mash_ph_status",
  waterBoundary: "solver.water",
  calciumFloor: "water.calcium_floor_ppm",
  sourceReport: "water.source",
  pinnedIons: "water.pinned_ions",
  targetProfile: "water.target_profile",
};

