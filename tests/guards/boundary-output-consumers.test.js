// Every declared boundary output must have a consumer: a downstream boundary
// input, a step-manifest readout, a registry node id, or an explicit allowlist.
// Unused outputs are dead contract surface.

import test from "node:test";
import assert from "node:assert/strict";

import { registry } from "../../frontend/src/views/registry/index.js";
import { steps } from "../../frontend/src/views/steps.js";
import { artifact, read, rel, walk } from "./util.js";

// Solver diagnostics that are part of the response contract but intentionally
// not surfaced yet. Add a reason here; do not silently leave an output unused.
const ALLOW = new Map([
  ["solver.water.grist_buckets_kg.", "grist-bucket diagnostic for future reporting"],
  ["solver.water.total_added_salt_mass_g", "mineral-mass diagnostic for future reporting"],
  ["solver.water.added_mineral_tds_ppm", "TDS diagnostic for future reporting"],
  ["solver.batch.hlt.v_hlt_required", "names the sparge demand behind the top-up target; equal to it unless the coil floor binds"],
]);

function collectStrings(value, out = new Set()) {
  if (typeof value === "string") {
    out.add(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, out);
  }
  return out;
}

function registrySourceStrings() {
  const out = new Set();
  for (const file of walk("frontend/src/views/registry", [".js"]).map(rel)) {
    for (const match of read(file).matchAll(/"([^"]*)"/g)) { if (match[1]) out.add(match[1]); }
  }
  return out;
}

// The report sections address boundary outputs as dotted string literals, so a
// value printed only by Typst still has a consumer.
function templateSourceStrings() {
  const out = new Set();
  for (const file of walk("backend/app/templates", [".typ"]).map(rel)) {
    for (const match of read(file).matchAll(/"([^"]*)"/g)) { if (match[1]) out.add(match[1]); }
  }
  return out;
}

function consumedReferences() {
  const consumed = new Set();
  for (const node of Object.values(artifact().nodes)) {
    for (const path of Object.values(node.inputs ?? {})) {
      if (typeof path === "string") consumed.add(path);
    }
  }
  collectStrings(steps, consumed);
  collectStrings(registry, consumed);
  for (const path of registrySourceStrings()) consumed.add(path);
  for (const path of templateSourceStrings()) consumed.add(path);
  // A reference to the boundary node itself is not a consumer of its outputs.
  for (const [id, node] of Object.entries(artifact().nodes)) {
    if (node.kind === "boundary") consumed.delete(id);
  }
  return consumed;
}

function isConsumed(path, consumed) {
  for (const ref of consumed) {
    if (ref === path) return true;
    if (path.startsWith(ref + ".")) return true;
    if (ref.startsWith(path + ".")) return true;
  }
  return false;
}

test("every boundary output has a consumer or an explicit allowlist reason", () => {
  const a = artifact();
  const consumed = consumedReferences();
  const offenders = [];
  const usedAllow = new Set();

  for (const [id, node] of Object.entries(a.nodes)) {
    if (node.kind !== "boundary") continue;
    for (const name of Object.keys(node.outputs)) {
      const path = `${id}.${name}`;
      if (isConsumed(path, consumed)) continue;
      const allowed = [...ALLOW.keys()].some(
        (prefix) => path === prefix || path.startsWith(prefix)
      );
      if (allowed) {
        for (const prefix of ALLOW.keys()) {
          if (path === prefix || path.startsWith(prefix)) usedAllow.add(prefix);
        }
        continue;
      }
      offenders.push(path);
    }
  }

  assert.deepEqual(offenders, [], `unconsumed boundary outputs:\n${offenders.join("\n")}`);
  for (const prefix of ALLOW.keys()) {
    assert.ok(usedAllow.has(prefix), `stale boundary-output allowlist entry: ${prefix}`);
  }
});
