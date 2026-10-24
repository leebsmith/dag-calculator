// Artifact surface must earn its place: every constant and every derived node
// has a consumer, or it is listed below with the reason it exists. An entry
// with no consumer is either a missing contract (pin it with a test) or dead
// weight (delete it).

import test from "node:test";
import assert from "node:assert/strict";

import { steps } from "../../frontend/src/views/steps.js";
import { artifact } from "./util.js";

// Read by frontend/src/adapters/fieldActions.js when the constraint topology
// changes; never referenced by an expression.
const HOST_CONSTANTS = new Set([
  "default_runoff_ratio",
  "default_equipment_profile_id",
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

// A deliberate interpretation of a boundary taxonomy, asserted by
// tests/frontend/engine.test.js; the water card reads the boundary path.
const INTERPRETATION_NODES = new Set(["water.mash_ph_status"]);

// Read by the water card through WATER_NODES; no artifact expression consumes
// them. They are the derived kettle-blend/ratio readouts.
const HOST_NODES = new Set([
  "water.kettle_blend.calcium_ca",
  "water.kettle_blend.magnesium_mg",
  "water.kettle_blend.sodium_na",
  "water.kettle_blend.sulfate_so4",
  "water.kettle_blend.chloride_cl",
  "water.kettle_blend.alkalinity_as_caco3",
  "water.kettle_blend.sulfate_chloride_ratio",
  "water.target.sulfate_chloride_ratio",
]);

function collectConstants(value, out) {
  if (Array.isArray(value)) {
    for (const v of value) collectConstants(v, out);
    return out;
  }
  if (value && typeof value === "object") {
    if (typeof value.const === "string") out.add(value.const);
    for (const v of Object.values(value)) collectConstants(v, out);
  }
  return out;
}

function collectRefs(value, out) {
  if (Array.isArray(value)) {
    for (const v of value) collectRefs(v, out);
    return out;
  }
  if (value && typeof value === "object") {
    if (typeof value.ref === "string") out.add(value.ref);
    for (const v of Object.values(value)) collectRefs(v, out);
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
      refs.has(id) || manifest.has(id) || INTERPRETATION_NODES.has(id) || HOST_NODES.has(id),
      `derived node "${id}" is unreachable`
    );
  }
  for (const id of [...INTERPRETATION_NODES, ...HOST_NODES]) {
    assert.equal(a.nodes[id]?.kind, "derived", `allowlisted node "${id}" is not derived`);
  }
});
