// Cross-runtime hop parity: the offline stub and the backend solver must agree
// with the shared fixture. The JS implementation is production only when no API
// is configured; drift here means offline and online recipes disagree.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { STUB_BOUNDARIES } from "../../frontend/src/adapters/stubBoundaries.js";

const FIXTURE = JSON.parse(
  readFileSync(new URL("../conformance/fixtures/hop-parity.json", import.meta.url), "utf8")
);

const EPS = 1e-9;

function close(actual, expected, label) {
  assert.equal(typeof actual, "number", `${label} must be numeric`);
  assert.ok(Math.abs(actual - expected) <= EPS, `${label}: ${actual} != ${expected}`);
}

function compareRows(actual, expected, label) {
  assert.equal(actual.length, expected.length, `${label} length`);
  for (const [index, want] of expected.entries()) {
    const got = actual[index];
    assert.deepEqual(
      Object.keys(got).sort(),
      Object.keys(want).sort(),
      `${label}[${index}] keys`
    );
    for (const [key, value] of Object.entries(want)) {
      close(got[key], value, `${label}[${index}].${key}`);
    }
  }
}

test("the offline hop stub matches the shared parity fixture", () => {
  for (const testCase of FIXTURE.cases) {
    const result = STUB_BOUNDARIES.hop_bitterness_solver(testCase.input);
    const expected = testCase.expected;
    compareRows(result.boil_rows, expected.boil_rows, `${testCase.name}.boil_rows`);
    compareRows(
      result.whirlpool_rows,
      expected.whirlpool_rows,
      `${testCase.name}.whirlpool_rows`
    );
    for (const key of ["boil_mass_kg", "whirlpool_mass_kg", "total_mass_kg"]) {
      close(result[key], expected[key], `${testCase.name}.${key}`);
    }
  }
});
