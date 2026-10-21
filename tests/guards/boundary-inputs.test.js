// Boundary seam guard: each request builder must read EXACTLY the nodes declared
// in its boundary's `inputs` — no undeclared read (a hidden dependency that can
// go stale) and no declared input left unmapped. The engine derives
// adjacency/topo/invalidation from those declared inputs, so drift is a contract
// break, not a detail.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  BATCH_FIELDS,
  WATER_FIELDS,
  buildBatchRequest,
  buildWaterRequest,
} from "../../frontend/src/adapters/boundaryRequest.js";
import { loadArtifact } from "../frontend/helpers.js";

const artifact = loadArtifact();
const WIRE_KEYS = JSON.parse(
  readFileSync(new URL("../conformance/fixtures/boundary-wire-keys.json", import.meta.url), "utf8")
);

function wireKeys(fields) {
  return Object.entries(fields)
    .filter(([, rule]) => rule.wire !== null)
    .map(([alias, rule]) => rule.wire ?? alias)
    .sort();
}

function declaredPaths(boundaryId) {
  return new Set(Object.values(artifact.nodes[boundaryId].inputs ?? {}));
}

// A recording engine that returns a single well-formed grist row (no moisture,
// so the batch builder exercises the fallback read) and 0 for every scalar.
function recordEngine() {
  const reads = [];
  const ROW = {
    pct: 0.5,
    yield_fraction: 0.8,
    mass_kg: 1,
    color_lovibond: 3,
    category: "BASE",
  };
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

function assertExactDeclared(builder, fieldMap, boundaryId) {
  const { engine, reads } = recordEngine();
  builder(engine);

  assert.deepEqual(
    [...new Set(reads)].sort(),
    [...declaredPaths(boundaryId)].sort(),
    `${boundaryId} builder must read every declared input exactly (and nothing else)`
  );
  assert.deepEqual(
    Object.keys(fieldMap).sort(),
    Object.keys(artifact.nodes[boundaryId].inputs ?? {}).sort(),
    `${boundaryId} field map must mirror the artifact's declared input aliases`
  );
}

test("batch request builder reads exactly the declared solver.batch inputs", () => {
  assertExactDeclared(buildBatchRequest, BATCH_FIELDS, "solver.batch");
});

test("water request builder reads exactly the declared solver.water inputs", () => {
  assertExactDeclared(buildWaterRequest, WATER_FIELDS, "solver.water");
});

test("wire keys match the shared backend contract fixture", () => {
  assert.deepEqual(wireKeys(BATCH_FIELDS), WIRE_KEYS.batch);
  assert.deepEqual(wireKeys(WATER_FIELDS), WIRE_KEYS.water);
});
