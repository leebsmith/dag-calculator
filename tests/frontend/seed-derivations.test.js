import test from "node:test";
import assert from "node:assert/strict";

import {
  derivationsFor,
  identityDerivations,
  seedDerivations,
} from "../../frontend/src/views/seedDerivations.js";

// The residual host-seeded set. Everything else a selection supplies is declared
// in the artifact as a `default` (pull), so this table must stay tiny.
test("only the residuals are host-seeded", () => {
  const style = identityDerivations("style");
  assert.deepEqual(style.map((d) => d.rootId).sort(), [
    "batch.fermentation",
  ]);
  assert.deepEqual(derivationsFor("batch.yeast"), []);
  assert.deepEqual(derivationsFor("water.target_profile"), []);
  assert.deepEqual(identityDerivations("equipment"), []);
});

test("apparent attenuation and target ABV are not host-seeded roots", () => {
  assert.deepEqual(seedDerivations("batch.apparent_attenuation"), []);
  assert.deepEqual(seedDerivations("batch.target_abv"), []);
});
