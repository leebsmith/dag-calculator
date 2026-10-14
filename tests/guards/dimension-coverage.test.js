import test from "node:test";
import assert from "node:assert/strict";

import { inferExprDimension, resolveReference } from "../../frontend/src/engine/index.js";
import { artifact } from "./util.js";

// Derived nodes whose dimension cannot be inferred are a deliberate, documented
// set. A new one must be reviewed (add here), not silently skipped.
const INTENTIONAL_UNCHECKED = ["batch.delta_v_evap", "grist.mcu"];

function uncheckedDerived(a) {
  const unchecked = [];
  for (const [id, node] of Object.entries(a.nodes)) {
    if (node.kind !== "derived" || !node.output.dimension) continue;
    const inputDims = {};
    const collSchemas = {};
    for (const [alias, path] of Object.entries(node.inputs)) {
      inputDims[alias] = inferExprDimension(a, { ref: path }, {});
      const r = resolveReference(a, path);
      const cn = r && r.suffix.length === 0 ? a.nodes[r.nodeId] : null;
      if (cn?.kind === "collection") collSchemas[alias] = cn.item_schema;
    }
    if (inferExprDimension(a, node.expr, inputDims, { collSchemas }) === null) unchecked.push(id);
  }
  return unchecked.sort();
}

test("derived-dimension coverage: unchecked nodes are the documented set", () => {
  assert.deepEqual(uncheckedDerived(artifact()), [...INTENTIONAL_UNCHECKED].sort());
});
