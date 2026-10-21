import test from "node:test";
import assert from "node:assert/strict";

import { derivationsFor, seedDerivations } from "../../frontend/src/views/seedDerivations.js";

test("seedDerivations maps copy-in targets to their selection + derive", () => {
  // apparent attenuation has both yeast and style sources
  const atten = seedDerivations("batch.apparent_attenuation");
  assert.equal(atten.length, 2);
  assert.equal(atten[0].selection, "batch.yeast");
  assert.equal(atten[1].selection, "batch.style");
});

test("derivationsFor returns the roots seeded from a selection", () => {
  const yeast = derivationsFor("batch.yeast");
  assert.deepEqual(yeast.map((d) => d.rootId), ["batch.apparent_attenuation"]);
});
