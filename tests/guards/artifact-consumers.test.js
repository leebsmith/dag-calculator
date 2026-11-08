// Artifact surface must earn its place: every constant and every derived node
// has a consumer, or it is listed below with the reason it exists. An entry
// with no consumer is either a missing contract (pin it with a test) or dead
// weight (delete it).

import test from "node:test";
import assert from "node:assert/strict";

import { compileExpression } from "../../frontend/src/engine/expression.js";
import { steps } from "../../frontend/src/views/steps.js";
import { artifact } from "./util.js";

// Read by frontend/src/adapters/fieldActions.js when the constraint topology
// changes; never referenced by an expression.
const HOST_CONSTANTS = new Set([
  "default_runoff_ratio",
  "default_equipment_profile_id",
  // Ingredient priors, resolved copy-forward when a catalog record enters a
  // batch; no artifact expression reads them.
  "fermentability_prior_base",
  "fermentability_prior_crystal",
  "fermentability_prior_roasted",
  "fermentability_prior_acid",
  "fermentability_prior_sugar",
  "fermentability_prior_default",
  "yield_prior_base",
  "yield_prior_crystal",
  "yield_prior_roasted",
  "yield_prior_acid",
  "yield_prior_extract",
  "yield_prior_default",
]);

// Restated by the Python solvers and pinned to this file by
// tests/backend/conformance/test_artifact_constants.py.
const PARITY_CONSTANTS = new Set([
  "sucrose_yield_ldk",
  "v_bar",
  "k_abs_true",
  "rho_water",
  "default_shrinkage_fraction",
  "bicarbonate_eq_weight",
  "mash_ph_optimal_low",
  "mash_ph_optimal_high",
  "default_target_mash_ph",
]);

// Read by host presentation only — the water card through WATER_NODES, the
// above-cap readout through the report catalog's formatted pass. No artifact
// expression consumes them.
const HOST_NODES = new Set([
  "batch.attenuation_above_cap",
  // IBU split shares: printed by the report's formatted pass, which needs a
  // catalog path, so they are nodes rather than a view-side ratio.
  "batch.boil_ibu_share",
  "batch.whirlpool_ibu_share",
  "batch.whirlpool_hot_ibu_share",
  "batch.whirlpool_cool_ibu_share",
  "water.kettle_blend.calcium_ca",
  "water.kettle_blend.magnesium_mg",
  "water.kettle_blend.sodium_na",
  "water.kettle_blend.sulfate_so4",
  "water.kettle_blend.chloride_cl",
  "water.kettle_blend.alkalinity_as_caco3",
  "water.kettle_blend.sulfate_chloride_ratio",
  "water.target.sulfate_chloride_ratio",
  // Net source-to-treated-mash ion change, printed by the report's
  // water-chemistry table. The UI keeps its own display delta.
  "water.mash_adjustment.calcium_ca",
  "water.mash_adjustment.magnesium_mg",
  "water.mash_adjustment.sodium_na",
  "water.mash_adjustment.sulfate_so4",
  "water.mash_adjustment.chloride_cl",
  "water.mash_adjustment.alkalinity_as_caco3",
]);

function expressionStrings(a) {
  const expressions = [];
  for (const node of Object.values(a.nodes)) {
    if (typeof node.expr === "string") expressions.push(node.expr);
    if (typeof node.default === "string") expressions.push(node.default);
    if (typeof node.domain === "string") expressions.push(node.domain);
    for (const spec of Object.values(node.fields ?? {})) {
      if (typeof spec.expr === "string") expressions.push(spec.expr);
    }
  }
  for (const fn of Object.values(a.functions ?? {})) expressions.push(fn.body);
  for (const relation of a.relations ?? []) expressions.push(relation.predicate);
  for (const schema of Object.values(a.primitive_schemas ?? {})) {
    for (const spec of Object.values(schema)) {
      if (typeof spec.domain === "string") expressions.push(spec.domain);
    }
  }
  return expressions;
}

function expressionPaths(a) {
  return expressionStrings(a).flatMap((expression) => compileExpression(expression).paths);
}

function collectConstants(a, out) {
  for (const path of expressionPaths(a)) {
    if (path.startsWith("constants.")) out.add(path.slice("constants.".length));
  }
  return out;
}

function collectRefs(a, out) {
  for (const path of expressionPaths(a)) {
    if (path === "$value" || path === "$context" || path === "null" || path === "row") continue;
    if (path.startsWith("row.") || path.startsWith("constants.")) continue;
    out.add(path);
  }
  return out;
}

function collectStrings(value, out) {
  if (typeof value === "string") {
    out.add(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectStrings(v, out);
  }
  return out;
}

test("every constant is evaluated, host-read, or a pinned parity mirror", () => {
  const a = artifact();
  const referenced = collectConstants(a, new Set());
  for (const id of Object.keys(a.constants)) {
    assert.ok(
      referenced.has(id) || HOST_CONSTANTS.has(id) || PARITY_CONSTANTS.has(id),
      `constant "${id}" has no consumer`
    );
  }
  for (const id of [...HOST_CONSTANTS, ...PARITY_CONSTANTS]) {
    assert.ok(id in a.constants, `allowlisted constant "${id}" no longer exists`);
  }
});

test("every derived node is reachable from the graph or the manifest", () => {
  const a = artifact();
  const refs = collectRefs(a, new Set());
  for (const node of Object.values(a.nodes)) {
    for (const input of Object.values(node.inputs ?? {})) {
      if (typeof input === "string") refs.add(input);
    }
  }
  const manifest = collectStrings(steps, new Set());
  for (const [id, node] of Object.entries(a.nodes)) {
    if (node.kind !== "derived") continue;
    assert.ok(
      refs.has(id) || manifest.has(id) || HOST_NODES.has(id),
      `derived node "${id}" is unreachable`
    );
  }
  for (const id of [...HOST_NODES]) {
    assert.equal(a.nodes[id]?.kind, "derived", `allowlisted node "${id}" is not derived`);
  }
});
