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

export const WATER_NODES = {

  slice: "water",
  saltDistribution: "water.salt_distribution",
  gypsumForm: "water.gypsum_form",
  cacl2Form: "water.cacl2_form",
  acidMedium: "water.acid_medium",
  alkalineAgent: "water.preferred_alkaline_agent",
  vMashTreat: "water.v_mash_treat_l",
  vHltTreat: "water.v_hlt_treat_l",
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
  postDoseIons: "solver.water.post_dose_mash_ions",
  resolvedStrategy: "solver.water.strategy",
  strategy: "water.strategy",
  target: "water.target",
  targetProfileId: "water.target_profile_id",
  sourceReportId: "water.source_report_id",
  targetMashPh: "water.target_mash_ph",
  predictedPh: "solver.water.prescription.predicted_mash_ph",
  phStatus: "solver.water.prescription.mash_ph_status",
  waterBoundary: "solver.water",
  calciumFloor: "water.calcium_floor_ppm",
  sourceReport: "water.source_report",
  pinnedIons: "water.pinned_ions",
  targetProfile: "water.target_profile",
};

export const waterRegistry = {
  "water.source_report_id": {
    label: "Source report",
    optionLabel: (report) => report?.laboratory || report?.source_name || report?.report_id,
  },
  "water.target_profile_id": {
    label: "Targets",
    control: "water-target-selector",
    hint: "Pick a constraint set: presets fill their ions, Freeform starts empty.",
  },

  "water.target_profile.calcium_ca": { label: "Calcium", unit: "ppm" },
  "water.target_profile.magnesium_mg": { label: "Magnesium", unit: "ppm" },
  "water.target_profile.sodium_na": { label: "Sodium", unit: "ppm" },
  "water.target_profile.sulfate_so4": { label: "Sulfate", unit: "ppm" },
  "water.target_profile.chloride_cl": { label: "Chloride", unit: "ppm" },
  "water.target_profile.alkalinity_as_caco3": { label: "Alkalinity (as CaCO3)", unit: "ppm" },
  "water.target_profile.calcium_floor_ppm": { label: "Calcium floor", unit: "ppm" },

  "water.calcium_floor_ppm": { label: "Calcium floor", unit: "ppm" },

  "water.salt_distribution": {
    label: "Salt distribution",
    optionLabels: {
      PROPORTIONAL: "Split — grist and HLT",
      MASH_ONLY: "Mash only salts",
    },
  },
  "water.acid_medium": {
    label: "Acid medium",
    optionLabels: {
      LACTIC_88: "88% lactic acid",
      PHOSPHORIC_10: "10% phosphoric acid",
      PHOSPHORIC_85: "85% phosphoric acid",
    },
  },
  "water.gypsum_form": {
    label: "Gypsum form",
    optionLabels: {
      GYPSUM_DIHYDRATE: "Dihydrate (CaSO₄·2H₂O)",
      GYPSUM_ANHYDROUS: "Anhydrous (CaSO₄)",
    },
  },
  "water.cacl2_form": {
    label: "CaCl2 form",
    optionLabels: {
      CACL2_DIHYDRATE: "Dihydrate (CaCl₂·2H₂O)",
      CACL2_ANHYDROUS: "Anhydrous (CaCl₂)",
    },
  },
  "water.preferred_alkaline_agent": {
    label: "Alkaline agent",
    optionLabels: {
      BAKING_SODA: "Baking soda (NaHCO₃)",
      CHALK: "Chalk (CaCO₃)",
      PICKLING_LIME: "Pickling lime (Ca(OH)₂)",
    },
  },
  "water.target_mash_ph": { label: "Target mash pH", unit: "pH" },
  "water.v_hlt_treat_l": { label: "Sparge salt dosing volume", unit: "L" },

  "solver.water.prescription.predicted_mash_ph": { label: "Predicted mash pH", unit: "pH", decimals: 2 },
  "solver.water.prescription.mash_ph_status": { label: "Mash pH status" },
  "solver.water.prescription.residual_hlt_water_l": { label: "Residual HLT water", unit: "L" },

  "solver.water.mash_additions.gypsum_kg": { label: "Mash gypsum", displayUnit: "g", decimals: 1 },
  "solver.water.mash_additions.cacl2_kg": { label: "Mash calcium chloride", displayUnit: "g", decimals: 1 },
  "solver.water.mash_additions.epsom_kg": { label: "Mash Epsom salt", displayUnit: "g", decimals: 1 },
  "solver.water.mash_additions.nacl_kg": { label: "Mash table salt", displayUnit: "g", decimals: 1 },
  "solver.water.mash_additions.acid_l": { label: "Mash acid", displayUnit: "ml", decimals: 1 },
  "solver.water.mash_additions.baking_soda_kg": { label: "Mash baking soda", displayUnit: "g", decimals: 1 },
  "solver.water.mash_additions.chalk_kg": { label: "Mash chalk", displayUnit: "g", decimals: 1 },
  "solver.water.mash_additions.pickling_lime_kg": { label: "Mash pickling lime", displayUnit: "g", decimals: 1 },

  "solver.water.sparge_additions.gypsum_kg": { label: "Sparge gypsum", displayUnit: "g", decimals: 1 },
  "solver.water.sparge_additions.cacl2_kg": { label: "Sparge calcium chloride", displayUnit: "g", decimals: 1 },
  "solver.water.sparge_additions.epsom_kg": { label: "Sparge Epsom salt", displayUnit: "g", decimals: 1 },
  "solver.water.sparge_additions.nacl_kg": { label: "Sparge table salt", displayUnit: "g", decimals: 1 },
  "solver.water.sparge_additions.acid_l": { label: "Sparge acid", displayUnit: "ml", decimals: 1 },
  "solver.water.sparge_additions.baking_soda_kg": { label: "Sparge baking soda", displayUnit: "g", decimals: 1 },
  "solver.water.sparge_additions.chalk_kg": { label: "Sparge chalk", displayUnit: "g", decimals: 1 },
  "solver.water.sparge_additions.pickling_lime_kg": { label: "Sparge pickling lime", displayUnit: "g", decimals: 1 },
};
