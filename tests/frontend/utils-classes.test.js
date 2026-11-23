import test from "node:test";
import assert from "node:assert/strict";

import { cellClass, classNames, classWhen } from "../../frontend/src/utils/classes.js";

test("classWhen returns the name only for a truthy condition", () => {
  assert.equal(classWhen(true, "is-active"), "is-active");
  assert.equal(classWhen(1, "is-active"), "is-active");
  assert.equal(classWhen(false, "is-active"), "");
  assert.equal(classWhen(null, "is-active"), "");
  assert.equal(classWhen(undefined, "is-active"), "");
  assert.equal(classWhen(true, undefined), "");
});

test("cellClass renders alignment and bold independently", () => {
  assert.equal(cellClass("right", true), "text-right tabular-nums font-bold");
  assert.equal(cellClass("right", false), "text-right tabular-nums");
  assert.equal(cellClass("center", false), "text-center");
  assert.equal(cellClass("left", false), "");
  assert.equal(cellClass(undefined, true), "font-bold");
  assert.equal(cellClass(null, null), "");
});

test("classNames composes condition/name pairs in order", () => {
  assert.equal(classNames(true, "a", false, "b", 1, "c"), "a c");
  assert.equal(classNames(false, "a"), "");
  assert.equal(classNames(), "");
  assert.equal(classNames(true, undefined), "");
});
