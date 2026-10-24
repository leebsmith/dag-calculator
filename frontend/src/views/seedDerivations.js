// Seed-derivation registry: the roots that HOST code still copies from a
// selection because the expression language cannot express the derivation.
// Everything else is declared in the artifact as a `default` over the selection
// (pull), so an unset root inherits and a set root overrides.
//
// Residual list (2 roots):
//   - batch.target_abv           — style centroid (polygon geometry)
//   - batch.fermentation         — style tag set-membership (no `in` operator)
//
// Consumers:
//   - selectYeast / copyInCascade (push the residual values);
//   - stepAdapter.seedIdentityResiduals (identity namespaces at creation/load);
//   - the producer's "seeded" provenance flag for those residuals;
//   - "reset to source" (fieldActions.resetField).
// Adding an entry here is a last resort: prefer an artifact `default`.

import { styleCentroid, styleFermentation } from "../engine/fermentation.js";

// root id -> [ { selection, derive } ]. A root may have several possible sources
// (e.g. batch.target_abv from the style centroid).
export const SEED_DERIVATIONS = {};

SEED_DERIVATIONS["batch.fermentation"] = [
  { identity: "style", derive: (s) => styleFermentation(s) },
];

SEED_DERIVATIONS["batch.target_abv"] = [
  { identity: "style", derive: (s) => styleCentroid(s)?.abv },
];

export function seedDerivations(rootId) {
  return SEED_DERIVATIONS[rootId] ?? [];
}

// All residual roots seeded from a selection node, as { rootId, derive }.
export function derivationsFor(selectionNodeId) {
  const out = [];
  for (const [rootId, sources] of Object.entries(SEED_DERIVATIONS)) {
    for (const src of sources) {
      if (src.selection === selectionNodeId) out.push({ rootId, derive: src.derive });
    }
  }
  return out;
}

// All residual roots seeded from an identity namespace.
export function identityDerivations(namespace) {
  const out = [];
  for (const [rootId, sources] of Object.entries(SEED_DERIVATIONS)) {
    for (const src of sources) {
      if (src.identity === namespace) out.push({ rootId, derive: src.derive });
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
