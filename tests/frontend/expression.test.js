import test from "node:test";
import assert from "node:assert/strict";

import { normalizeExpression } from "../../frontend/src/engine/expression.js";
import { runtimeFor } from "../../frontend/src/engine/index.js";
import { loadArtifact } from "./helpers.js";

const artifact = loadArtifact();
const runtime = runtimeFor(artifact);

function scope(resolve = () => undefined, explicit = {}) {
  return runtime.scope(resolve, explicit);
}

test("literals, aliases, constants and dotted references evaluate", () => {
  const s = scope((path) => ({ "batch.target_abv": 6.5 })[path] ?? undefined, {
    a: 2,
    row: { pct: 0.5 },
  });
  assert.equal(runtime.evaluate("a + 1", s), 3);
  assert.equal(runtime.evaluate("batch.target_abv * 2", s), 13);
  assert.equal(runtime.evaluate('"HIGH"', s), "HIGH");
  assert.equal(runtime.evaluate("null", s), null);
  assert.equal(
    runtime.evaluate("constants.sucrose_yield_ldk", s),
    artifact.constants.sucrose_yield_ldk.value
  );
});

test("flat and namespaced artifact function calls resolve", () => {
  const expected = runtime.callFunction("extract_yield_ldk", [0.8]);
  assert.equal(runtime.evaluate("extract_yield_ldk(0.8)", scope()), expected);
  assert.equal(runtime.evaluate("functions.extract_yield_ldk(0.8)", scope()), expected);
});

test("normalizeExpression only rewrites function calls outside string literals", () => {
  assert.equal(
    normalizeExpression("functions.extract_yield_ldk(0.8)"),
    "extract_yield_ldk(0.8)"
  );
  assert.equal(
    normalizeExpression('"functions.extract_yield_ldk("'),
    '"functions.extract_yield_ldk("'
  );
  assert.equal(
    normalizeExpression("'functions.extract_yield_ldk('"),
    "'functions.extract_yield_ldk('"
  );
  assert.equal(
    normalizeExpression('"functions.foo(" + functions.extract_yield_ldk(0.8)'),
    '"functions.foo(" + extract_yield_ldk(0.8)'
  );
});

test("$context exposes aliases and an opaque evaluate handle", () => {
  const s = scope(() => undefined, { x: 1 });
  assert.equal(runtime.evaluate("$context.x", s), 1);
  assert.equal(runtime.evaluate("$context.runtime", s), undefined);
  assert.equal(runtime.evaluate("$context.explicit", s), undefined);
  assert.equal(runtime.evaluate("$context.artifact", s), undefined);
  assert.equal(typeof runtime.evaluate("$context.evaluate", s), "function");
});

test("and/or/ternary short-circuit the untaken branch", () => {
  let reads = 0;
  const s = scope((path) => {
    reads += 1;
    if (path === "missing.value") throw new Error("should not be read");
    return ({ "missing.value": undefined })[path];
  });
  assert.equal(runtime.evaluate("false && missing.value > 0", s), false);
  assert.equal(runtime.evaluate("true || missing.value > 0", s), true);
  assert.equal(runtime.evaluate("true ? 1 : missing.value", s), 1);
  assert.equal(reads, 0);
});

test("field transforms preserve filter-then-reduce semantics", () => {
  const rows = [
    { color_lovibond: 10, pct: 0.5, enabled: true },
    { color_lovibond: 20, pct: 0.3, enabled: false },
    { color_lovibond: 30, pct: 0.2, enabled: true },
  ];
  const s = scope(() => undefined, { rows });
  assert.equal(runtime.evaluate('rows | sum("pct")', s), 1);
  assert.equal(runtime.evaluate('rows | sum("pct", "row.enabled")', s), 0.7);
  assert.equal(runtime.evaluate('rows | weighted_avg("color_lovibond", "pct")', s), 17);
  assert.equal(runtime.evaluate('rows | min("color_lovibond")', s), 10);
  assert.equal(runtime.evaluate('rows | max("color_lovibond", "row.enabled")', s), 30);
  assert.equal(runtime.evaluate('rows | min("color_lovibond", "false")', s), undefined);
});

test("expression transforms read row fields and the surrounding context", () => {
  const rows = [
    { color_lovibond: 10, pct: 0.5, mass_kg: 1 },
    { color_lovibond: 20, pct: 0.3, mass_kg: 2 },
  ];
  const s = scope(() => undefined, { rows, budget: 2 });
  assert.equal(
    runtime.evaluate('rows | sum_expr("(row.pct * budget)", null, $context)', s),
    1.6
  );
  assert.equal(
    runtime.evaluate(
      'rows | weighted_avg_expr("row.color_lovibond", "row.pct", null, $context)',
      s
    ),
    13.75
  );
  assert.equal(
    runtime.evaluate(
      'rows | sum_expr("(row.mass_kg * 2)", "row.pct > 0.4", $context)',
      s
    ),
    2
  );
});

test("weighted_avg returns 0 when the total weight is zero", () => {
  const s = scope(() => undefined, { rows: [{ color_lovibond: 10, pct: 0 }] });
  assert.equal(runtime.evaluate('rows | weighted_avg("color_lovibond", "pct")', s), 0);
});

test("domain evaluation binds $value", () => {
  const s = scope();
  assert.equal(runtime.evaluate("$value >= 0 && $value <= 1", s.withValue(0.5)), true);
  assert.equal(runtime.evaluate("$value >= 0 && $value <= 1", s.withValue(2)), false);
});
