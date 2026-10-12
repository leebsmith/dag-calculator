import test from "node:test";
import assert from "node:assert/strict";
import { createCalculator } from "../../frontend/src/engine/index.js";
import { produce } from "../../frontend/src/views/producer.js";
import { registry, steps } from "../../frontend/src/views/steps.js";
import { createReferenceCache } from "../../frontend/src/store/referenceCache.js";
import { STUB_BOUNDARIES } from "../../frontend/src/adapters/stubBoundaries.js";
import { artifact } from "./util.js";

// A9: the producer is deterministic — identical roots => identical field models.
function engine() {
  const cache = createReferenceCache();
  return createCalculator(artifact(), {
    references: cache.references,
    collections: cache.collections,
    boundaries: STUB_BOUNDARIES,
    roots: {},
  });
}

test("A9: determinism", () => {
  const a = produce(artifact(), steps, registry, engine());
  const b = produce(artifact(), steps, registry, engine());
  assert.deepEqual(a, b);
});
