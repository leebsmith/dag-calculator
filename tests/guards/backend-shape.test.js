// Backend file-length ratchet: a module over the ceiling is split, never grown.
//
// The frontend pins its oversized modules through eslint's `max-lines: 400` and
// re-measures them in tests/guards/shape-pins.test.js; ruff caps backend function
// complexity (C901 = 10) but nothing caps file length, and
// scripts/check-hygiene.mjs is a diff-scoped tripwire rather than a standing
// invariant. This table is the backend's equivalent, with the same discipline: a
// pin equals the file as it is, so improving a file means lowering its pin in the
// same commit, and growth past a pin means a split.
//
// core/water/engines.py sits at 399 and is the next pin candidate.

import test from "node:test";
import assert from "node:assert/strict";

import { read, rel, walk } from "./util.js";

const CEILING = 400;

const PINS = {
  "backend/app/core/hop_solver.py": 786,
  "backend/app/core/batch/orchestration.py": 738,
  "backend/app/main.py": 720,
  "backend/app/core/water/telemetry.py": 602,
  "backend/app/core/water/orchestration.py": 591,
  "backend/app/schemas/recipe_import.py": 550,
  "backend/app/schemas/boundary.py": 501,
  "backend/app/services/prose.py": 455,
  "backend/app/routers/dev.py": 430,
  "backend/app/artifact.py": 410,
};

function lineCount(path) {
  const source = read(path);
  return source.split("\n").length - (source.endsWith("\n") ? 1 : 0);
}

function modules() {
  return walk("backend/app", [".py"]).map(rel).sort();
}

test("a pin equals the length the module reports", () => {
  const drift = [];
  for (const [path, pin] of Object.entries(PINS)) {
    const actual = lineCount(path);
    if (actual === pin) continue;
    drift.push(
      actual > pin
        ? `${path}: pinned ${pin}, actual ${actual} (split it; a pin is never raised)`
        : `${path}: pinned ${pin}, actual ${actual} (lower the pin)`
    );
  }
  assert.deepEqual(drift, [], "a pin describes the file as it is: lower the pin in the commit that splits it");
});

test("no unpinned module exceeds the ceiling", () => {
  const offenders = modules()
    .filter((path) => PINS[path] === undefined)
    .map((path) => [path, lineCount(path)])
    .filter(([, count]) => count > CEILING)
    .map(([path, count]) => `${path}: ${count} lines, over the ${CEILING}-line ceiling`);
  assert.deepEqual(offenders, [], `split the module, or add a pin at today's size: ${offenders.join("; ")}`);
});

test("every pin names a module that exists", () => {
  const present = new Set(modules());
  const stale = Object.keys(PINS).filter((path) => !present.has(path));
  assert.deepEqual(stale, [], `stale pins: ${stale.join(", ")}`);
});

test("every pin is above the ceiling it exempts", () => {
  const redundant = Object.entries(PINS)
    .filter(([, pin]) => pin <= CEILING)
    .map(([path]) => path);
  assert.deepEqual(redundant, [], `these fit under the ceiling and need no pin: ${redundant.join(", ")}`);
});
