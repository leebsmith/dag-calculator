import test from "node:test";
import assert from "node:assert/strict";

import { checkExpressions } from "../../scripts/check-expressions.mjs";
import { artifact } from "./util.js";

test("every committed artifact expression compiles", () => {
  const result = checkExpressions(artifact());
  assert.deepEqual(result.failures, []);
  assert.ok(result.compiled > 0, "no expressions were checked");
  assert.ok(result.nested > 0, "no transform arguments were checked");
});

test("a malformed expression is rejected", () => {
  const doc = structuredClone(artifact());
  doc.nodes["grist.weighted_lovibond"].expr = "row.pct +";
  const result = checkExpressions(doc);
  assert.ok(
    result.failures.some((failure) => failure.label === "nodes.grist.weighted_lovibond.expr"),
    JSON.stringify(result.failures)
  );
});

test("a malformed transform argument is rejected", () => {
  const doc = structuredClone(artifact());
  doc.nodes["mash.total_time_min"].expr = '(rests | sum("duration_min", "(row.enabled &&", $context))';
  const result = checkExpressions(doc);
  assert.ok(
    result.failures.some((failure) => failure.label.includes('transform "sum"')),
    JSON.stringify(result.failures)
  );
});

test("a leftover AST object is rejected", () => {
  const doc = structuredClone(artifact());
  doc.nodes["grist.weighted_lovibond"].expr = { ref: "rows" };
  const result = checkExpressions(doc);
  assert.ok(
    result.failures.some((failure) => failure.label === "nodes.grist.weighted_lovibond.expr"),
    JSON.stringify(result.failures)
  );
});
