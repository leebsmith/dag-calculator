// Presentation-only field overrides. Node ids here describe how the host shows
// artifact values; they never feed back into the artifact, engine, or solvers.

import { reportError } from "../../observability.js";

export const CONFORMANCE_FIELD_MAP = {
  "solver.batch.sg_post_boil": "og",
  "batch.realized_fg": "fg",
  "batch.realized_abv": "abv",
  "batch.target_ibu": "ibu",
  "grist.finished_beer_srm": "srm",
};

const TARGET_ABV = {
  hint: {
    path: "solver.batch.max_feasible_abv",
    detail: "solver.batch.binding_constraint",
    extra: "solver.batch.max_achievable_abv",
    format: (max, binding, attenuation) => {
      const ceiling =
        typeof attenuation === "number"
          ? `; attenuation ceiling ${attenuation.toFixed(1)}%`
          : "";
      return `Max feasible: ${max.toFixed(1)}% (${binding})${ceiling}.`;
    },
  },
};

const FIELD_OVERRIDES = {
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

export function applyPresentation(out, rule, readers) {
  if (rule.hint) {
    let value;
    let detail;
    let extra;
    try {
      value = readers.resolve(rule.hint.path);
      detail = rule.hint.detail ? readers.resolve(rule.hint.detail) : undefined;
      extra = rule.hint.extra ? readers.resolve(rule.hint.extra) : undefined;
    } catch (err) {
      reportError("presentation.hint", err);
      value = null;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      out.hint = rule.hint.format(value, detail, extra);
    }
  }
}

// AI AGENT HOOKS: Use this lookup for host-side editable-value clamp envelopes.
// Do not duplicated this logic elsewhere.
export function clampBoundsFor(id) {
  return CLAMP_BOUNDS[id] ?? null;
}
