// Boundary seam guard: each request builder may only read nodes declared in its
// boundary's `inputs`. The engine derives adjacency/topo/invalidation from those
// declared inputs, so an undeclared read is a hidden dependency that can go
// stale. This catches it at the contract.

import test from "node:test";
import assert from "node:assert/strict";

import { resolveReference } from "../../frontend/src/engine/index.js";
import { buildBatchRequest, buildWaterRequest } from "../../frontend/src/adapters/boundaryRequest.js";
import { loadArtifact } from "../frontend/helpers.js";

const artifact = loadArtifact();

function declaredNodeIds(boundaryId) {
  const node = artifact.nodes[boundaryId];
  const ids = new Set();
  for (const path of Object.values(node.inputs ?? {})) {
    const r = resolveReference(artifact, path);
    ids.add(r ? r.nodeId : path);
  }
  return ids;
}

// A recording engine that returns a single well-formed grist row (no moisture,
// so the batch builder exercises the fallback read) and 0 for every scalar.
function recordEngine() {
  const reads = [];
  const ROW = { pct: 0.5, yield_fraction: 0.8, mass_kg: 1, color_lovibond: 3, category: "BASE" };
  const engine = {
    resolve(path) {
      reads.push(path);
      return 0;
    },
    get(id) {
      reads.push(id);
      return [ROW];
    },
  };
  return { engine, reads };
}

function assertOnlyDeclared(builder, boundaryId) {
  const { engine, reads } = recordEngine();
  builder(engine);
  const declared = declaredNodeIds(boundaryId);
  for (const path of reads) {
    const r = resolveReference(artifact, path);
    const nodeId = r ? r.nodeId : path;
    assert.ok(
      declared.has(nodeId),
      `${boundaryId} builder reads undeclared node "${nodeId}" (via "${path}")`
    );
  }
}

test("batch request builder reads only declared solver.batch inputs", () => {
  assertOnlyDeclared(buildBatchRequest, "solver.batch");
});

test("water request builder reads only declared solver.water inputs", () => {
  assertOnlyDeclared(buildWaterRequest, "solver.water");
});
