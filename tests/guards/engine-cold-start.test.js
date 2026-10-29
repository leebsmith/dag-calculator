import test from "node:test";
import assert from "node:assert/strict";

import { buildGraph, createCalculator, loadArtifact } from "../../frontend/src/engine/index.js";
import { STUB_BOUNDARIES } from "../../frontend/src/adapters/stubBoundaries.js";
import { artifact } from "./util.js";
import { identityFixture } from "../frontend/helpers.js";

function counted(doc) {
  const reads = { count: 0 };
  const tracked = new Proxy(doc, {
    get(target, key, receiver) {
      reads.count += 1;
      return Reflect.get(target, key, receiver);
    },
  });
  return { tracked, reads };
}

test("validation runs once per artifact identity", () => {
  const { tracked, reads } = counted(artifact());

  assert.equal(loadArtifact(tracked), tracked);
  const afterFirstLoad = reads.count;
  assert.ok(afterFirstLoad > 0, "the first load reads the artifact");

  assert.equal(loadArtifact(tracked), tracked);
  assert.equal(reads.count, afterFirstLoad, "the second load does not read it again");
});

test("a modified clone is validated again", () => {
  const doc = artifact();
  assert.equal(loadArtifact(doc), doc);

  const modified = structuredClone(doc);
  modified.schema_version = 99;
  assert.throws(() => loadArtifact(modified), /Unsupported schema_version 99/);

  const dangling = structuredClone(doc);
  const rootId = Object.keys(dangling.nodes).find((id) => dangling.nodes[id].kind === "root");
  dangling.nodes[rootId].default = { ref: "no.such.node" };
  assert.throws(() => loadArtifact(dangling), /references unknown node\/field/);

  assert.equal(loadArtifact(doc), doc, "a rejected clone does not poison the original");
});

test("the graph is built once per artifact identity", () => {
  const doc = artifact();
  const graph = buildGraph(doc);
  assert.equal(buildGraph(doc), graph);
  assert.equal(graph.topoOrder.length, Object.keys(doc.nodes).length);

  const clone = structuredClone(doc);
  assert.notEqual(buildGraph(clone), graph, "a clone is a different artifact");
  assert.deepEqual(buildGraph(clone).adjacency, graph.adjacency);
});

test("engine builds reuse the validated artifact's graph", () => {
  const doc = artifact();
  const options = { identity: identityFixture(), boundaries: STUB_BOUNDARIES };
  const first = createCalculator(doc, options);
  const second = createCalculator(doc, options);

  assert.equal(first.adjacency, second.adjacency);
  assert.equal(first.dependents, second.dependents);
  assert.equal(first.adjacency, buildGraph(doc).adjacency);
});
