import test from "node:test";
import assert from "node:assert/strict";

import { derivationsFor, seedDerivations } from "../../frontend/src/views/seedDerivations.js";

// The residual host-seeded set. Everything else a selection supplies is declared
// in the artifact as a `default` (pull), so this table must stay tiny.
test("only the residuals are host-seeded", () => {
  const style = derivationsFor("batch.style");
  assert.deepEqual(style.map((d) => d.rootId).sort(), [
    "batch.apparent_attenuation",
    "batch.fermentation",
    "batch.target_abv",
  ]);
  assert.deepEqual(
    derivationsFor("batch.yeast").map((d) => d.rootId),
    ["batch.apparent_attenuation"]
  );
  assert.deepEqual(derivationsFor("water.target_profile"), []);
});

test("apparent attenuation has both yeast and style sources", () => {
  const atten = seedDerivations("batch.apparent_attenuation");
  assert.equal(atten.length, 2);
  assert.equal(atten[0].selection, "batch.yeast");
  assert.equal(atten[1].selection, "batch.style");
});
