import test from "node:test";
import assert from "node:assert/strict";

import { evenGrid } from "../../frontend/src/views/grid.js";

test("evenGrid: factor pair nearest a square, landscape", () => {
  const cases = [
    [1, 1, 1],
    [2, 2, 1],
    [4, 2, 2],
    [6, 3, 2],
    [8, 4, 2],
    [9, 3, 3],
    [10, 5, 2],
    [12, 4, 3],
    [14, 7, 2],
    [15, 5, 3],
    [16, 4, 4],
  ];
  for (const [n, cols, rows] of cases) {
    assert.deepEqual(evenGrid(n), { cols, rows }, `evenGrid(${n})`);
  }
});

test("evenGrid: primes fall back to near-square with a partial last row", () => {
  assert.deepEqual(evenGrid(3), { cols: 2, rows: 2 });
  assert.deepEqual(evenGrid(5), { cols: 3, rows: 2 });
  assert.deepEqual(evenGrid(7), { cols: 3, rows: 3 });
  assert.deepEqual(evenGrid(11), { cols: 4, rows: 3 });
  assert.deepEqual(evenGrid(13), { cols: 4, rows: 4 });
});

test("evenGrid: every layout has enough cells and stays landscape", () => {
  for (let n = 1; n <= 40; n++) {
    const { cols, rows } = evenGrid(n);
    assert.ok(cols * rows >= n, `evenGrid(${n}) has ${cols * rows} < ${n} cells`);
    assert.ok(cols >= rows, `evenGrid(${n}) is portrait`);
  }
});

test("evenGrid: degenerate input", () => {
  assert.deepEqual(evenGrid(0), { cols: 1, rows: 0 });
  assert.deepEqual(evenGrid(-3), { cols: 1, rows: 0 });
});
