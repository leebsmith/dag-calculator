// Provenance decoration: marks a root whose value comes from a selected
// component. Roots that inherit through an artifact `default` are seeded while
// unset and authored once set (hasRoot); residual host-seeded roots fall back to
// value comparison against their derivation.

import { seedDerivations, approxEqual, sourceLabel } from "../seedDerivations.js";
import { resolveReference } from "../../engine/paths.js";

function collectRefs(expr, out = []) {
  if (expr === null || typeof expr !== "object") return out;
  if (Array.isArray(expr)) {
    for (const item of expr) collectRefs(item, out);
    return out;
  }
  for (const [key, value] of Object.entries(expr)) {
    if (key === "ref" && typeof value === "string") out.push(value);
    else collectRefs(value, out);
  }
  return out;
}

// The component a root inherits from, when its default reads one. Returns null
// for roots with no component-derived default (literal/const/derived defaults).
export function inheritedSource(artifact, nodeId) {
  const node = artifact?.nodes?.[nodeId];
  if (!node || (node.kind !== "root" && node.kind !== "choice")) return null;
  for (const path of collectRefs(node.default)) {
    const resolved = resolveReference(artifact, path);
    if (!resolved) continue;
    if (resolved.kind === "identity") return { kind: "identity", id: resolved.namespace };
    if (artifact.nodes[resolved.nodeId]?.kind === "selection") {
      return { kind: "selection", id: resolved.nodeId };
    }
  }
  return null;
}

function componentLabel(engine, source) {
  try {
    const component =
      source.kind === "identity" ? engine.identity?.[source.id] : engine.get(source.id);
    return sourceLabel(component);
  } catch {
    return "";
  }
}

// AI AGENT HOOKS: Use this decorator for seed-derived provenance and reset
// affordances. Do not duplicated this logic elsewhere.
export function decorateProvenance(out, field, engine, artifact) {
  const inheritedFrom = inheritedSource(artifact, field.id);
  if (inheritedFrom) {
    const seeded = !engine.hasRoot(field.id) && out.value !== undefined;
    out.seeded = seeded;
    out.seededValue = out.value;
    out.seededSource = componentLabel(engine, inheritedFrom);
    out.seededReset = "unset";
    return out;
  }

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
