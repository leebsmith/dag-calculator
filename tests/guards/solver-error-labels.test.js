// Solver error labels: every code a boundary can raise has a human label, and
// the map carries no stale entries. The editor alert prints the label, so an
// unlabelled code reaches the reader as a generic "Solver error".

import test from "node:test";
import assert from "node:assert/strict";

import { SOLVER_ERROR_LABELS } from "../../frontend/src/utils.js";
import { artifact } from "./util.js";

// Client-side codes that never reach the error taxonomy but can still surface.
const CLIENT_CODES = ["VALIDATION", "HTTP_ERROR"];

function declaredCodes() {
  const codes = new Set(CLIENT_CODES);
  for (const node of Object.values(artifact().nodes)) {
    if (node.kind !== "boundary") continue;
    for (const code of node.domain?.codes ?? []) codes.add(code);
  }
  return codes;
}

test("every declared solver code has a label", () => {
  const missing = [...declaredCodes()].filter((code) => !(code in SOLVER_ERROR_LABELS));
  assert.deepEqual(missing, [], `unlabelled solver codes:\n${missing.join("\n")}`);
});

test("labels are prose, not restated codes", () => {
  for (const [code, label] of Object.entries(SOLVER_ERROR_LABELS)) {
    assert.equal(typeof label, "string", code);
    assert.notEqual(label.trim(), "", code);
    assert.notEqual(label, code, code);
  }
});

test("the label map has no stale entries", () => {
  const declared = declaredCodes();
  const stale = Object.keys(SOLVER_ERROR_LABELS).filter((code) => !declared.has(code));
  assert.deepEqual(stale, [], `labels for unknown codes:\n${stale.join("\n")}`);
});
