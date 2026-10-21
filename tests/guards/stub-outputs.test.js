// Offline stub completeness: every artifact-declared boundary output must be
// produced by the offline stub, or the dev/tests path silently blanks a readout.

import test from "node:test";
import assert from "node:assert/strict";

import { STUB_BOUNDARIES } from "../../frontend/src/adapters/stubBoundaries.js";
import { artifact } from "./util.js";

test("offline stubs cover every declared boundary output", () => {
  const a = artifact();
  for (const [id, node] of Object.entries(a.nodes)) {
    if (node.kind !== "boundary") continue;
    const stub = STUB_BOUNDARIES[node.binding];
    assert.ok(stub, `${id} has no offline stub for binding "${node.binding}"`);
    const declared = Object.keys(node.outputs);
    const actual = new Set(Object.keys(stub()));
    const missing = declared.filter((key) => !actual.has(key));
    assert.deepEqual(missing, [], `${id} stub is missing outputs: ${missing.join(", ")}`);
  }
});
