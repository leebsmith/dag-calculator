// Seed-derivation registry: which batch roots are seeded from a selection's
// component, and how to derive the source value. Pure and engine-free — `derive`
// takes the already-resolved component. Consumers:
//   - the copy-in cascade (stepAdapter.copyInCascade, selectYeast, selectStyle);
//   - the producer's "seeded" provenance flag (views/producer.js);
//   - "reset to source" (stepAdapter.resetField).
// Keeping this as a single declarative table is what lets the copy-in and the
// indicator never disagree, and makes field-level provenance reusable later
// (freeze/drift, reporting).

import { styleCentroid, styleFermentation } from "../engine/fermentation.js";

const mid = (lo, hi) =>
  typeof lo === "number" && typeof hi === "number" ? (lo + hi) / 2 : undefined;

const STYLE_ENVELOPE = {
  og_min: (s) => s?.og_min,
  og_max: (s) => s?.og_max,
  fg_min: (s) => s?.fg_min,
  fg_max: (s) => s?.fg_max,
  ibu_min: (s) => s?.ibu_min,
  ibu_max: (s) => s?.ibu_max,
  srm_min: (s) => s?.srm_min,
  srm_max: (s) => s?.srm_max,
  abv_min: (s) => s?.abv_min,
  abv_max: (s) => s?.abv_max,
};

// root id -> [ { selection, derive } ]. A root may have several possible sources
// (e.g. batch.apparent_attenuation from yeast OR the style centroid).
export const SEED_DERIVATIONS = {};

SEED_DERIVATIONS["batch.apparent_attenuation"] = [
  { selection: "batch.yeast", derive: (y) => y?.attenuation_pct },
  { selection: "batch.style", derive: (s) => styleCentroid(s)?.aa },
];

for (const [field, derive] of Object.entries(STYLE_ENVELOPE)) {
  SEED_DERIVATIONS[`batch.style_${field}`] = [{ selection: "batch.style", derive }];
}
SEED_DERIVATIONS["batch.fermentation"] = [{ selection: "batch.style", derive: (s) => styleFermentation(s) }];
SEED_DERIVATIONS["batch.target_abv"] = [{ selection: "batch.style", derive: (s) => styleCentroid(s)?.abv }];
SEED_DERIVATIONS["batch.target_srm"] = [{ selection: "batch.style", derive: (s) => mid(s?.srm_min, s?.srm_max) }];
SEED_DERIVATIONS["batch.target_ibu"] = [{ selection: "batch.style", derive: (s) => mid(s?.ibu_min, s?.ibu_max) }];

export function seedDerivations(rootId) {
  return SEED_DERIVATIONS[rootId] ?? [];
}

// All roots seeded from a selection node, as { rootId, derive }.
export function derivationsFor(selectionNodeId) {
  const out = [];
  for (const [rootId, sources] of Object.entries(SEED_DERIVATIONS)) {
    for (const src of sources) {
      if (src.selection === selectionNodeId) out.push({ rootId, derive: src.derive });
    }
  }
  return out;
}

export function approxEqual(a, b) {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-9;
  return false;
}

// Human label for a resolved component (water reports key on `laboratory`).
export function sourceLabel(component) {
  return component?.name ?? component?.laboratory ?? component?.report_id ?? "";
}

// The matching source (and its derived value) for a root's current value, if any.
export function matchingDerivation(rootId, value, resolveComponent) {
  for (const src of SEED_DERIVATIONS[rootId] ?? []) {
    const component = resolveComponent(src.selection);
    const derived = src.derive(component);
    if (derived !== undefined && approxEqual(derived, value)) {
      return { ...src, value: derived };
    }
  }
  return null;
}
