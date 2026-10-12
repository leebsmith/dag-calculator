import test from "node:test";
import assert from "node:assert/strict";

import { evaluate } from "../../frontend/src/engine/ast.js";

function ctx(refs = {}, consts = {}) {
  return {
    resolveRef: (name) => {
      if (!(name in refs)) throw new Error(`unknown ref ${name}`);
      return refs[name];
    },
    resolveConst: (id) => {
      if (!(id in consts)) throw new Error(`unknown const ${id}`);
      return consts[id];
    },
    call: (id, args) => {
      throw new Error(`no function ${id}`);
    },
  };
}

test("evaluates bare literals", () => {
  assert.equal(evaluate(42, ctx()), 42);
  assert.equal(evaluate("HIGH", ctx()), "HIGH");
  assert.equal(evaluate(true, ctx()), true);
});

test("evaluates arithmetic operators", () => {
  assert.equal(evaluate({ op: "+", args: [2, 3] }, ctx()), 5);
  assert.equal(evaluate({ op: "-", args: [10, 4] }, ctx()), 6);
  assert.equal(evaluate({ op: "*", args: [3, 4] }, ctx()), 12);
  assert.equal(evaluate({ op: "/", args: [7, 2] }, ctx()), 3.5);
  assert.equal(evaluate({ op: "neg", args: [5] }, ctx()), -5);
  assert.equal(evaluate({ op: "pow", args: [2, 10] }, ctx()), 1024);
});

test("evaluates comparison and logic operators", () => {
  assert.equal(evaluate({ op: "gt", args: [3, 2] }, ctx()), true);
  assert.equal(evaluate({ op: "le", args: [2, 2] }, ctx()), true);
  assert.equal(evaluate({ op: "and", args: [true, true] }, ctx()), true);
  assert.equal(evaluate({ op: "or", args: [false, true] }, ctx()), true);
  assert.equal(evaluate({ op: "not", args: [false] }, ctx()), true);
});

test("evaluates if conditionals", () => {
  const expr = {
    op: "if",
    args: [{ op: "gt", args: [{ ref: "ph" }, 5.6] }, "HIGH", "OPTIMAL"],
  };
  assert.equal(evaluate(expr, ctx({ ph: 5.7 })), "HIGH");
  assert.equal(evaluate(expr, ctx({ ph: 5.4 })), "OPTIMAL");
});

test("evaluates reductions: sum and weighted_avg", () => {
  const coll = [
    { pct: 0.8, yield: 0.8 },
    { pct: 0.2, yield: 0.74 },
  ];
  const sumExpr = { op: "sum", coll: { ref: "rows" }, as: "row", body: { ref: "row.pct" } };
  assert.equal(evaluate(sumExpr, ctx({ rows: coll })), 1.0);

  const waExpr = {
    op: "weighted_avg",
    coll: { ref: "rows" },
    as: "row",
    value: { ref: "row.yield" },
    weight: { ref: "row.pct" },
  };
  assert.ok(Math.abs(evaluate(waExpr, ctx({ rows: coll })) - 0.788) < 1e-9);
});

test("evaluates map and filter", () => {
  const coll = [1, 2, 3, 4];
  const mapExpr = { op: "map", coll: { ref: "xs" }, as: "x", body: { op: "*", args: [{ ref: "x" }, 2] } };
  assert.deepEqual(evaluate(mapExpr, ctx({ xs: coll })), [2, 4, 6, 8]);

  const filterExpr = {
    op: "filter",
    coll: { ref: "xs" },
    as: "x",
    body: { op: "gt", args: [{ ref: "x" }, 2] },
  };
  assert.deepEqual(evaluate(filterExpr, ctx({ xs: coll })), [3, 4]);
});

test("evaluates min, and min with a where predicate", () => {
  const rests = [
    { use_temp_c: 62, enabled: true },
    { use_temp_c: 55, enabled: false },
    { use_temp_c: 70, enabled: false },
    { use_temp_c: 67, enabled: true },
  ];
  const all = { op: "min", coll: { ref: "rests" }, as: "rest", value: { ref: "rest.use_temp_c" } };
  assert.equal(evaluate(all, ctx({ rests })), 55);

  const enabled = {
    ...all,
    where: { ref: "rest.enabled" },
  };
  assert.equal(evaluate(enabled, ctx({ rests })), 62);

  // no items satisfy the predicate => undefined
  const none = { ...all, where: { op: "eq", args: [1, 2] } };
  assert.equal(evaluate(none, ctx({ rests })), undefined);
});

test("where filters sum/weighted_avg before reducing", () => {
  const rows = [
    { v: 2, w: 1, on: true },
    { v: 10, w: 1, on: false },
  ];
  const sum = { op: "sum", coll: { ref: "rows" }, as: "r", body: { ref: "r.v" }, where: { ref: "r.on" } };
  assert.equal(evaluate(sum, ctx({ rows })), 2);

  const avg = {
    op: "weighted_avg",
    coll: { ref: "rows" },
    as: "r",
    value: { ref: "r.v" },
    weight: { ref: "r.w" },
    where: { ref: "r.on" },
  };
  assert.equal(evaluate(avg, ctx({ rows })), 2);
});

