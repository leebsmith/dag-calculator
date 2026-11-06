// The cross-cutting node ids the adapter field/draft actions bind to. Every
// value is an engine path: either a node, or one output of a boundary node.

import test from "node:test";
import assert from "node:assert/strict";

import { SYSTEM_NODES } from "../../frontend/src/views/registry/system.js";
import { artifact } from "./util.js";

const A = artifact();

function validPaths() {
  const paths = new Set(Object.keys(A.nodes));
  for (const [id, node] of Object.entries(A.nodes)) {
    if (node.kind !== "boundary") continue;
    for (const output of Object.keys(node.outputs ?? {})) paths.add(`${id}.${output}`);
  }
  return paths;
}

test("every system node resolves to a node or a boundary output", () => {
  const paths = validPaths();
  const missing = Object.entries(SYSTEM_NODES).filter(([, path]) => !paths.has(path));

  assert.deepEqual(
    missing.map(([key, path]) => `${key}: ${path}`),
    [],
    "system node paths must exist in the artifact"
  );
});

test("system node values are unique non-empty strings", () => {
  const values = Object.values(SYSTEM_NODES);

  for (const value of values) {
    assert.equal(typeof value, "string");
    assert.notEqual(value, "");
  }
  assert.equal(new Set(values).size, values.length, "a path is declared twice");
});
