import test from "node:test";
import assert from "node:assert/strict";
import { resolveReference } from "../../frontend/src/engine/paths.js";
import { steps } from "../../frontend/src/views/steps.js";
import { artifact } from "./util.js";

// A6: every manifest reference must resolve to a declared node/field.
test("A6: manifest integrity", () => {
  const a = artifact();
  const offenders = [];
  for (const step of steps) {
    for (const entry of step.fields) {
      if (typeof entry === "object" && entry.collection) continue; // collection entries resolved by kind
      const id = typeof entry === "string" ? entry : entry.id;
      if (!resolveReference(a, id)) offenders.push(id);
    }
  }
  assert.deepEqual(offenders, [], `Unresolved manifest refs:\n${offenders.join("\n")}`);
});

// A6b: every selection's picker root is displayed by some step, so validation
// of that selection's fields can be attributed to a card (no orphaned states).
test("A6: selection pickers are displayed by a step", () => {
  const a = artifact();
  const shown = new Set();
  for (const step of steps) {
    for (const entry of step.fields) shown.add(typeof entry === "string" ? entry : entry.id);
  }
  const offenders = [];
  for (const [id, node] of Object.entries(a.nodes)) {
    if (node.kind === "selection" && !shown.has(node.ref)) offenders.push(`${id} -> ${node.ref}`);
  }
  assert.deepEqual(offenders, [], `Selections whose picker is not shown:\n${offenders.join("\n")}`);
});

// A6c: root defaults that seed from a selection field are a deliberate,
// documented "copy-forward" set (see docs/engine.md).
test("A6: selection-seeded root defaults are the documented set", () => {
  const a = artifact();
  const seeded = [];
  for (const [id, node] of Object.entries(a.nodes)) {
    const d = node.default;
    if (node.kind !== "root" || !d || typeof d !== "object" || !d.ref) continue;
    const r = resolveReference(a, d.ref);
    if (r && a.nodes[r.nodeId]?.kind === "selection") seeded.push(id);
  }
  assert.deepEqual(seeded.sort(), ["batch.hlt_starting_volume_l"]);
});
