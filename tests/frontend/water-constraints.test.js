import test from "node:test";
import assert from "node:assert/strict";

import {
  checkedPins,
  nextPinned,
  pinnedRows,
  presetPins,
  seedTargetValue,
  valuedPins,
} from "../../frontend/src/views/waterLogic.js";

test("the checked set is read from the pinned-ion rows", () => {
  assert.deepEqual(checkedPins([{ ion: "ca" }, { ion: "so4" }]), ["ca", "so4"]);
  assert.deepEqual(checkedPins([]), []);
  assert.deepEqual(checkedPins(null), []);
  assert.deepEqual(checkedPins(undefined), []);
});

test("the valued set is the checked set by contract", () => {
  const rows = [{ ion: "cl" }];
  assert.deepEqual(valuedPins(rows), checkedPins(rows));
});

test("pinnedRows turns the declaration into collection rows", () => {
  assert.deepEqual(pinnedRows(["ca", "alk"]), [{ ion: "ca" }, { ion: "alk" }]);
  assert.deepEqual(pinnedRows([]), []);
});

test("a profile holds the ions it declares a number for", () => {
  const profile = { calcium_ca: 60, sulfate_so4: 0, chloride_cl: null, sodium_na: 10 };
  assert.deepEqual(presetPins(profile), ["ca", "na", "so4"]);
  assert.deepEqual(presetPins(null), []);
  assert.deepEqual(presetPins({}), []);
});

test("toggling a pin adds or removes it without mutating the input", () => {
  const rows = [{ ion: "ca" }];

  assert.deepEqual(nextPinned(rows, "so4"), [{ ion: "ca" }, { ion: "so4" }]);
  assert.deepEqual(rows, [{ ion: "ca" }], "the input rows stay untouched");
  assert.deepEqual(nextPinned(rows, "ca"), []);
  assert.deepEqual(nextPinned(null, "ca"), [{ ion: "ca" }]);
});

test("a checked ion seeds from the source concentration, else zero", () => {
  assert.equal(seedTargetValue({ calcium_ca: 42 }, "ca"), 42);
  assert.equal(seedTargetValue({ calcium_ca: "42" }, "ca"), 42);
  assert.equal(seedTargetValue({ calcium_ca: null }, "ca"), 0);
  assert.equal(seedTargetValue({}, "ca"), 0);
  assert.equal(seedTargetValue(null, "ca"), 0);
});

