import test from "node:test";
import assert from "node:assert/strict";

import { hamiltonPct } from "../../frontend/src/views/hamilton.js";
import { createTestApp } from "./appHelpers.js";

test("hamilton: exact allocations pass through at 0.1% resolution", () => {
  assert.deepEqual(hamiltonPct([80, 20]), [0.8, 0.2]);
  assert.deepEqual(hamiltonPct([100]), [1]);
});

test("hamilton: allocations always sum to exactly 1", () => {
  for (const parts of [[1, 1, 1], [1, 2], [1, 1, 1, 1], [5, 3, 2], [7, 7, 7, 7, 7, 7]]) {
    const pct = hamiltonPct(parts);
    const sum = pct.reduce((a, b) => a + b, 0);
    assert.equal(sum, 1, `Σ pct must be 1 for ${JSON.stringify(parts)} (got ${sum})`);
    // Every allocation lands on the 0.1% grid.
    for (const p of pct) assert.equal(Math.round(p * 1000), p * 1000);
  }
});

test("hamilton: largest remainders win; ties by larger parts then index", () => {
  // equal parts -> the leftover seat goes to the first index
  assert.deepEqual(hamiltonPct([1, 1, 1]), [0.334, 0.333, 0.333]);
  // larger remainder wins
  assert.deepEqual(hamiltonPct([1, 2]), [0.333, 0.667]);
});

test("hamilton: degenerate input yields all zeros", () => {
  assert.deepEqual(hamiltonPct([0, 0]), [0, 0]);
  assert.deepEqual(hamiltonPct([-5, 0]), [0, 0]);
  assert.deepEqual(hamiltonPct([]), []);
});

test("hamilton: editing grist parts renormalizes pct across the bill", () => {
  const app = createTestApp();
  app.boot();
  const table = () => app.fieldsBySlice.fermentables.find((f) => f.control === "collection-table");

  // Seed bill: 80/20 -> pct 0.8/0.2. Re-author the first row's parts.
  app.editCell(table(), 0, "parts", "30");

  const rows = app.draftState().collections["grist.major_malts"];
  const sum = rows.reduce((a, r) => a + r.pct, 0);
  assert.equal(sum, 1, "pct sums to 1 after a parts edit");
  assert.ok(Math.abs(rows[0].pct - 0.6) < 1e-9, `30/(30+20) = 0.6 (got ${rows[0].pct})`);
  assert.ok(Math.abs(rows[1].pct - 0.4) < 1e-9, `20/(30+20) = 0.4 (got ${rows[1].pct})`);
  // Dimensioned cells store numbers, not input strings.
  assert.equal(typeof rows[0].parts, "number");
});
