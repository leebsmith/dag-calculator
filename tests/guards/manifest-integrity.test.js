import test from "node:test";
import assert from "node:assert/strict";
import { resolveReference } from "../../frontend/src/engine/paths.js";
import { steps } from "../../frontend/src/views/steps.js";
import { artifact } from "./util.js";

// A6: every manifest reference must resolve to a declared node/field.
test("A6: manifest integrity", () => {
  const a = artifact();
  const offenders = [];
  const check = (ref) => {
    if (!resolveReference(a, ref)) offenders.push(ref);
  };
  for (const step of steps) {
    for (const entry of step.fields) {
      if (typeof entry === "object" && entry.collection) continue; // collection entries resolved by kind
      if (typeof entry === "object" && entry.table) {
        // Readout-table cells and notes are refs too: verify each resolves.
        for (const col of entry.columns) {
          if (col.kind === "text") continue;
          for (const row of entry.rows) {
            if (row[col.id]) check(row[col.id]);
          }
        }
        for (const row of entry.rows) {
          if (row.note?.ref) check(row.note.ref);
        }
        continue;
      }
      const id = typeof entry === "string" ? entry : entry.id;
      check(id);
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
    for (const entry of step.fields) {
      if (typeof entry === "string") shown.add(entry);
      else if (entry.id) shown.add(entry.id);
    }
  }
  const offenders = [];
  for (const [id, node] of Object.entries(a.nodes)) {
    if (node.kind === "selection" && !shown.has(node.ref)) offenders.push(`${id} -> ${node.ref}`);
  }
  assert.deepEqual(offenders, [], `Selections whose picker is not shown:\n${offenders.join("\n")}`);
});

// A6c: root defaults that seed from a selection field are a deliberate,
// documented "copy-forward" set (see docs/engine.md).
// Every root/choice that inherits from a selection, however deeply the ref is
// nested inside its default expression. Roots NOT listed here must not read a
// selection: seeds are pulled by defaults, never pushed by host code.
const SELECTION_DERIVED = [
  "batch.boil_off_rate_l_per_hr",
  "batch.conversion_efficiency",
  "batch.hlt_starting_volume_l",
  "batch.style_abv_max",
  "batch.style_abv_min",
  "batch.style_fg_max",
  "batch.style_fg_min",
  "batch.style_ibu_max",
  "batch.style_ibu_min",
  "batch.style_og_max",
  "batch.style_og_min",
  "batch.style_srm_max",
  "batch.style_srm_min",
  "batch.target_ibu",
  "batch.target_srm",
  "water.calcium_floor_ppm",
  "water.strategy",
  "water.target.alkalinity_as_caco3",
  "water.target.calcium_ca",
  "water.target.chloride_cl",
  "water.target.magnesium_mg",
  "water.target.sodium_na",
  "water.target.sulfate_so4",
];

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

test("A6: selection-seeded root defaults are the documented set", () => {
  const a = artifact();
  const seeded = [];
  for (const [id, node] of Object.entries(a.nodes)) {
    if (node.kind !== "root" && node.kind !== "choice") continue;
    const readsSelection = collectRefs(node.default).some((path) => {
      const r = resolveReference(a, path);
      return r && a.nodes[r.nodeId]?.kind === "selection";
    });
    if (readsSelection) seeded.push(id);
  }
  assert.deepEqual(seeded.sort(), SELECTION_DERIVED);
});
