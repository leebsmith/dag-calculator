import test from "node:test";
import assert from "node:assert/strict";

import { assertNoCollisions, BASE_KEYS, installerSurfaceGaps } from "../../frontend/src/adapters/contract.js";
import { INSTALLERS } from "../../frontend/src/adapters/installers.js";
import { createStepApp } from "../../frontend/src/adapters/stepAdapter.js";

test("every installer declares a non-empty key set", () => {
  for (const { name, keys } of INSTALLERS) {
    assert.ok(Array.isArray(keys) && keys.length > 0, `${name} KEYS is empty`);
  }
});

test("no two installers assign the same app member", () => {
  assertNoCollisions(INSTALLERS);
});

test("assertNoCollisions catches a synthetic collision", () => {
  assert.throws(() =>
    assertNoCollisions([
      { name: "a", keys: ["x", "y"] },
      { name: "b", keys: ["y"] },
    ])
  );
});

test("the assembled app matches the declared installer surface exactly", () => {
  const app = createStepApp();
  assert.deepEqual(installerSurfaceGaps(app, INSTALLERS), { undeclared: [], missing: [] });
});

test("installerSurfaceGaps reports both drift directions", () => {
  const app = { common: 1, declared: 1, strayed: 1 };
  Object.defineProperty(app, BASE_KEYS, { value: ["common"], enumerable: false });
  const gaps = installerSurfaceGaps(app, [{ name: "a", keys: ["declared", "absent"] }]);
  assert.deepEqual(gaps.undeclared, ["strayed"]);
  assert.deepEqual(gaps.missing, ["absent"]);
});
