import test from "node:test";
import assert from "node:assert/strict";

import {
  someFieldHasGate,
  someRowMatches,
  someRowMissing,
  someValidationFails,
} from "../../frontend/src/utils/rows.js";

test("someRowMissing reports a null, undefined or absent field", () => {
  assert.equal(someRowMissing([{ mass_kg: 1 }, { mass_kg: null }], "mass_kg"), true);
  assert.equal(someRowMissing([{ mass_kg: 1 }, {}], "mass_kg"), true);
  assert.equal(someRowMissing([{ mass_kg: 1 }, { mass_kg: 2 }], "mass_kg"), false);
  assert.equal(someRowMissing([], "mass_kg"), false);
  assert.equal(someRowMissing(null, "mass_kg"), false);
  assert.equal(someRowMissing([null], "mass_kg"), true);
});

test("someRowMatches compares strictly by field", () => {
  assert.equal(someRowMatches([{ form: "pellet" }], "form", "pellet"), true);
  assert.equal(someRowMatches([{ form: "pellet" }], "form", "extract"), false);
  assert.equal(someRowMatches([{ form: 1 }], "form", "1"), false);
  assert.equal(someRowMatches(undefined, "form", "pellet"), false);
});

test("someValidationFails needs an explicit holds === false", () => {
  assert.equal(someValidationFails([{ a: { holds: false } }]), true);
  assert.equal(someValidationFails([{ a: { holds: true } }]), false);
  assert.equal(someValidationFails([{ a: {} }]), false);
  assert.equal(someValidationFails([{ a: null }]), false);
  assert.equal(someValidationFails([]), false);
  assert.equal(someValidationFails(null), false);
});

test("someFieldHasGate looks for a matching field id", () => {
  assert.equal(someFieldHasGate([{ id: "yeast" }, { id: "style" }], "style"), true);
  assert.equal(someFieldHasGate([{ id: "yeast" }], "style"), false);
  assert.equal(someFieldHasGate([], "style"), false);
  assert.equal(someFieldHasGate(null, "style"), false);
  assert.equal(someFieldHasGate([null], "style"), false);
});
