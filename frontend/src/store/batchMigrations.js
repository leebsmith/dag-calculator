// Batch upgrade rules: the authored state repairs a loaded draft needs before
// the first solve. Pure over the engine/cache/master they are handed; each
// returns true when it changed something, so `loadState` can notify once.

import { identityDerivations } from "../views/seedDerivations.js";
import { EQUAL_SUGAR_PARTS } from "../views/producer/sugarAllocation.js";

// A saved batch can author a positive sugar share while every row's parts are
// still zero (rows predate the catalog's equal-weight default). The solver
// honors the share, so a zero-weight table would show 0 lb of sugar beside a
// real extract budget. Give that unmigrated state equal weights.
export function seedSugarShareParts({ engine }) {
  if (engine.get("batch.late_addition_intent") !== "share") return false;
  const share = Number(engine.get("batch.sugar_extract_share")) || 0;
  if (!(share > 0)) return false;
  const rows = engine.getAuthored("batch.sugars");
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const total = rows.reduce((sum, row) => sum + (Number(row.parts) || 0), 0);
  if (total > 0) return false;
  engine.setCollection(
    "batch.sugars",
    rows.map((row) => ({ ...row, parts: EQUAL_SUGAR_PARTS }))
  );
  return true;
}

// Drafts saved before the derate became points stored a multiplier of the
// strain maximum. Convert it once, using the selected strain's published
// attenuation; the old root is dropped by the rebuild.
export function migrateAttenuationDerate({ engine, getRoot, setRoot }, legacy) {
  if (typeof legacy !== "number" || !Number.isFinite(legacy)) return false;
  if (getRoot("batch.attenuation_derate_points") !== undefined) return false;
  const aa = engine.resolve("batch.yeast.attenuation_cap_pct");
  if (typeof aa !== "number" || !Number.isFinite(aa)) return false;
  const points = Math.min(0.25, Math.max(0, (1 - legacy) * aa));
  setRoot("batch.attenuation_derate_points", points);
  return true;
}

// Selections saved before the cap was renamed stored `attenuation_pct`. Treat
// that value as the cap once, so old drafts and frozen forks keep their figure
// without rewriting the persisted batch.
export function migrateLegacyYeastCap({ session }) {
  const snapshots = session.selections();
  let changed = false;
  for (const [nodeId, component] of Object.entries(snapshots)) {
    if (!component || typeof component !== "object") continue;
    if (component.attenuation_cap_pct !== undefined) continue;
    if (typeof component.attenuation_pct !== "number") continue;
    session.setSelection(nodeId, {
      ...component,
      attenuation_cap_pct: component.attenuation_pct,
    });
    changed = true;
  }
  return changed;
}

// Seed the creation-time residuals from the batch's identity snapshot when the
// draft does not already carry them. Identity is read-only in the workspace, so
// this is the only place the residual roots are derived.
export function seedIdentityResiduals({ identity, getRoot, setRoot }) {
  let changed = false;
  for (const [namespace, component] of Object.entries(identity ?? {})) {
    if (!component || Object.keys(component).length === 0) continue;
    for (const { rootId, derive } of identityDerivations(namespace)) {
      if (getRoot(rootId) !== undefined) continue;
      const value = derive(component);
      if (typeof value === "number" || (typeof value === "string" && value !== "")) {
        setRoot(rootId, value);
        changed = true;
      }
    }
  }
  return changed;
}

// Copy every referenced component into the batch when it lacks a snapshot.
// Returns true when anything was materialised.
export function materializeSelections({
  engine,
  artifact,
  cache,
  session,
  reportError = () => {},
}) {
  const snapshots = session.selections();
  let changed = false;
  for (const [id, node] of Object.entries(artifact.nodes)) {
    if (node.kind !== "selection" || snapshots[id]) continue;
    let refValue;
    try {
      refValue = engine.get(node.ref);
    } catch (err) {
      reportError("batchMigrations.materializeSelections", err);
      continue;
    }
    if (!refValue) continue;
    const component = cache.references[node.output?.schema]?.[refValue];
    if (!component) continue;
    session.setSelection(id, component);
    changed = true;
  }
  return changed;
}
