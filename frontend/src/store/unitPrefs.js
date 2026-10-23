// Unit-preference persistence (device-local localStorage). Preferences are
// presentation state, keyed by dimension id OR field id -> unit id. Stored with
// a schema_version stamp; on a mismatch the load path silently drops stale
// entries via sanitization against the live artifact (semantics.md §6).

import { resolveReference } from "../engine/paths.js";
import { nodeDimension } from "../engine/units.js";

const STORAGE_KEY = "brew_unit_preferences";

// The dimension of a field id (node id or dotted reference path). Mirrors the
// producer's `describe` dimension resolution.
function fieldDimension(artifact, id) {
  if (artifact.nodes && id in artifact.nodes) return nodeDimension(artifact, id);
  const ref = resolveReference(artifact, id);
  if (!ref) return null;
  const owner = artifact.nodes?.[ref.nodeId];
  if (!owner) return null;
  if (owner.kind === "boundary") {
    return owner.outputs?.[ref.suffix.join(".")]?.dimension ?? null;
  }
  if (owner.kind === "selection") {
    return artifact.primitive_schemas?.[owner.output?.schema]?.[ref.suffix[0]]?.dimension ?? null;
  }
  return null;
}

// Drop any key/unit no longer valid against the artifact.
export function sanitizeUnitMode(artifact, raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  const dimensions = artifact.dimensions ?? {};
  for (const [key, unitId] of Object.entries(raw)) {
    if (typeof unitId !== "string") continue;
    const dim = key in dimensions ? key : fieldDimension(artifact, key);
    if (!dim) continue;
    const def = dimensions[dim];
    if (!def) continue;
    if (unitId === def.base_unit || (def.units && unitId in def.units)) out[key] = unitId;
  }
  return out;
}

export function loadUnitMode(artifact) {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    // Drop preferences written against a different artifact version, so stale
    // units (including invisible per-field overrides) can't linger across bumps.
    if (!raw || raw.schema_version !== (artifact.schema_version ?? 2)) return {};
    return sanitizeUnitMode(artifact, raw.unitMode);
  } catch {
    return {};
  }
}

export function saveUnitMode(unitMode, schemaVersion) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schema_version: schemaVersion, unitMode }));
  } catch {
    /* storage unavailable (private mode / quota) — prefs just won't persist */
  }
}

// Clear all stored unit preferences (master picks and per-field overrides).
export function clearUnitMode() {
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  return {};
}
