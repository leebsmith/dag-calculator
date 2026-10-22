// Presentation-only field overrides. Node ids here describe how the host shows
// artifact values; they never feed back into the artifact, engine, or solvers.

export const CONFORMANCE_FIELD_MAP = {
  "solver.batch.sg_post_boil": "og",
  "batch.realized_fg": "fg",
  "batch.realized_abv": "abv",
  "batch.target_ibu": "ibu",
  "grist.finished_beer_srm": "srm",
};

const INTENSIVE_VALUE = {
  switch: {
    path: "batch.topology",
    cases: {
      runoff_ratio: {
        label: "Runoff Ratio r",
        dimension: null,
        unit: null,
        unitId: null,
        toggleable: false,
        customized: false,
        rawDisplay: true,
        hint: "V_run1 / V_run2; 1.0 is equal runnings.",
      },
    },
    fallback: {
      label: "Liquor-to-Grist Ratio",
      hint: "Strike water per grist mass; follows the Mash Thickness unit preference.",
    },
  },
};

const TARGET_ABV = {
  hint: {
    path: "solver.batch.max_achievable_abv",
    format: (max) => `Max at current attenuation: ${max.toFixed(1)}%.`,
  },
};

const FIELD_OVERRIDES = {
  "batch.intensive_value": INTENSIVE_VALUE,
  "batch.target_abv": TARGET_ABV,
};

export const CLAMP_BOUNDS = {
  "batch.hlt_starting_volume_l": {
    low: "equipment.hlt_coil_floor_l",
    high: "equipment.max_hlt_volume_l",
  },
};

// AI AGENT HOOKS: Use this lookup for presentation-only field overrides driven
// by another node's value. Do not duplicated this logic elsewhere.
export function presentationFor(id) {
  return FIELD_OVERRIDES[id] ?? null;
}

export function applyPresentation(out, rule, readers, formatValue) {
  if (rule.switch) {
    const variant = rule.switch.cases[readers.get(rule.switch.path)] ?? rule.switch.fallback;
    Object.assign(out, variant);
    if (variant.rawDisplay) out.display = formatValue(out.value);
  }
  if (rule.hint) {
    let value;
    try {
      value = readers.resolve(rule.hint.path);
    } catch {
      value = null;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      out.hint = rule.hint.format(value);
    }
  }
}

// AI AGENT HOOKS: Use this lookup for host-side editable-value clamp envelopes.
// Do not duplicated this logic elsewhere.
export function clampBoundsFor(id) {
  return CLAMP_BOUNDS[id] ?? null;
}
