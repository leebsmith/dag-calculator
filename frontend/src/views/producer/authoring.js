// Field and collection authoring helpers: the input-draft key, the
// parts -> pct share normalization (grist and boil-hop rows), and the
// type-appropriate defaults a blank row is seeded with. Pure; the installer
// owns the reactive writes, the engine reads, and the envelope lookup.

import { hamiltonPct } from "../hamilton.js";

export function fieldInputKey(prefix, ...parts) {
  return [prefix, ...parts].join(":");
}

// `parts` is the authoring column and `pct` the normalized allocation that sums
// to exactly 100% at 0.1% resolution; both collection kinds use the same rule.
export function normalizedRowShares(rows) {
  if (!rows.length) return rows;
  const pcts = hamiltonPct(rows.map((row) => row.parts));
  return rows.map((row, i) => ({ ...row, pct: pcts[i] }));
}

// Seed a row with type-appropriate defaults (numbers, first taxonomy member,
// schema default) rather than empty strings, so a new row is well-formed and
// does not POST a request that fails validation.
export function rowDefaults(schema, taxonomies = {}) {
  const defaults = {};
  for (const [key, spec] of Object.entries(schema)) {
    if (spec.default !== undefined) defaults[key] = spec.default;
    else if (spec.type === "boolean") defaults[key] = false;
    else if (spec.taxonomy) defaults[key] = taxonomies[spec.taxonomy]?.[0] ?? "";
    else if (spec.dimension) defaults[key] = 0;
    else defaults[key] = "";
  }
  return defaults;
}
