import test from "node:test";
import assert from "node:assert/strict";

import { formatDateTime } from "../../frontend/src/utils/format/time.js";
import {
  fractionFromPercent,
  percentPoints,
} from "../../frontend/src/utils/format/percent.js";
import { isPositiveNumber } from "../../frontend/src/utils/model.js";

test("percentPoints rounds a fraction to whole points and tolerates gaps", () => {
  assert.equal(percentPoints(0.554), 55);
  assert.equal(percentPoints(1), 100);
  assert.equal(percentPoints(0), 0);
  assert.equal(percentPoints(null), null);
  assert.equal(percentPoints(""), null);
  assert.equal(percentPoints("nope"), null);
});

test("fractionFromPercent parses an input value and tolerates gaps", () => {
  assert.equal(fractionFromPercent("55"), 0.55);
  assert.equal(fractionFromPercent(0), 0);
  assert.equal(fractionFromPercent(""), null);
  assert.equal(fractionFromPercent(null), null);
});

test("isPositiveNumber is strict about numbers above zero", () => {
  assert.equal(isPositiveNumber(1), true);
  assert.equal(isPositiveNumber("2.5"), true);
  assert.equal(isPositiveNumber(0), false);
  assert.equal(isPositiveNumber(-1), false);
  assert.equal(isPositiveNumber(""), false);
  assert.equal(isPositiveNumber(null), false);
  assert.equal(isPositiveNumber("x"), false);
});

test("formatDateTime renders a date and time; invalid input gets the dash", () => {
  const rendered = formatDateTime(1_700_000_000);
  assert.match(rendered, /2023/);
  assert.equal(formatDateTime(null), "—");
  assert.equal(formatDateTime("nope"), "—");
});
