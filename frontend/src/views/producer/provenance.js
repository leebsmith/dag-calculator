// Provenance decoration: marks a root whose current value equals a seed-derived
// source (water report ion, yeast/style copy-in) and carries the reset affordance.

import { seedDerivations, approxEqual, sourceLabel } from "../seedDerivations.js";

// AI AGENT HOOKS: Use this decorator for seed-derived provenance and reset
// affordances. Do not duplicated this logic elsewhere.
export function decorateProvenance(out, field, engine) {
  const sources = seedDerivations(field.id);
  if (!sources.length) return out;

  let seeded = false;
  let seededValue;
  let seededSource = "";
  for (const src of sources) {
    let component;
    try {
      component = engine.get(src.selection);
    } catch {
      component = null;
    }
    const derived = src.derive(component);
    if (derived === undefined) continue;
    if (seededValue === undefined) {
      seededValue = derived;
      seededSource = sourceLabel(component);
    }
    if (out.value !== undefined && approxEqual(derived, out.value)) {
      seeded = true;
      seededValue = derived;
      seededSource = sourceLabel(component);
    }
  }
  out.seeded = seeded;
  out.seededValue = seededValue;
  out.seededSource = seededSource;
  return out;
}
