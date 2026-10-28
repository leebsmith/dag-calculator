import test from "node:test";
import assert from "node:assert/strict";

import { decorateConformance } from "../../frontend/src/views/producer/conformance.js";

function hint({ boundary, high, status }) {
  return decorateConformance(
    {},
    { id: "batch.realized_abv" },
    { conformance: { dimensions: { abv: { violatedBoundary: boundary, high, status } } } }
  ).conformanceHint;
}

test("a conformance hint prints the boundary trimmed to three decimals", () => {
  assert.equal(
    hint({ boundary: 8, high: 8, status: "drift" }),
    "Above style limit 8 (out of style)"
  );
  assert.equal(
    hint({ boundary: 7.5384, high: 7.5384, status: "severe" }),
    "Above style limit 7.538 (far out of style)"
  );
  assert.equal(
    hint({ boundary: 4.05, high: 7.5, status: "near" }),
    "Below style limit 4.05 (near style limit)"
  );
});

test("a field outside the conformance map carries no hint", () => {
  const out = decorateConformance(
    {},
    { id: "batch.v_ferm" },
    { conformance: { dimensions: { abv: { violatedBoundary: 8, high: 7.5 } } } }
  );
  assert.equal(out.conformanceHint, undefined);
});
