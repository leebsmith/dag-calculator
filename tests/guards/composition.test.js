// The composition mechanism: one merge point, layer factories instead of
// installers, and no app writes outside the root.

import test from "node:test";
import assert from "node:assert/strict";

import { INSTALLERS } from "../../frontend/src/adapters/installers.js";
import { read, rel, walk } from "./util.js";

const ADAPTERS = "frontend/src/adapters";
const ROOT = `${ADAPTERS}/stepAdapter.js`;
const CONTRACT = `${ADAPTERS}/contract.js`;

function adapterFiles() {
  return walk(ADAPTERS, [".js"]).map(rel);
}

test("only the composition root writes the app", () => {
  const offenders = [];
  for (const file of adapterFiles()) {
    if (file === ROOT || file === CONTRACT) continue;
    const source = read(file);
    if (/Object\.(assign|defineProperties)\(\s*app\b/.test(source)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], `modules writing the app directly:\n${offenders.join("\n")}`);
});

test("no installer module exports an install* shim", () => {
  const offenders = [];
  for (const { modules } of INSTALLERS) {
    for (const file of modules) {
      for (const match of read(file).matchAll(/^export function (install\w+)/gm)) {
        offenders.push(`${file}: ${match[1]}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `install shims left:\n${offenders.join("\n")}`);
});

test("the root merges layers exactly once", () => {
  const calls = [...read(ROOT).matchAll(/\bcomposeLayers\(/g)];
  assert.equal(calls.length, 1, "stepAdapter must contain exactly one composeLayers( call");
});

test("every layer factory is composed", () => {
  const factories = [];
  for (const file of adapterFiles()) {
    for (const match of read(file).matchAll(/^export function (create\w+Layers)\(/gm)) {
      factories.push(match[1]);
    }
  }
  assert.ok(factories.length > 0, "expected layer factories");
  const root = read(ROOT);
  for (const name of factories) {
    assert.match(root, new RegExp(`\\b${name}\\(`), `${name} is missing from the composition list`);
  }
});

test("every card module exports a factory", () => {
  const offenders = [];
  let count = 0;
  for (const { modules } of INSTALLERS) {
    for (const file of modules.filter((path) => path.includes("/cards/"))) {
      const source = read(file);
      if (!/^export const KEYS\b/m.test(source)) continue;
      count += 1;
      if (!/export (function|const) create\w+/.test(source)) offenders.push(file);
    }
  }
  assert.ok(count > 0, "expected card modules");
  assert.deepEqual(offenders, [], `card modules without a create factory:\n${offenders.join("\n")}`);
});

const GETVIEW_MODULES = [
  "frontend/src/adapters/libraryFields.js",
  "frontend/src/adapters/libraryListEditor.js",
  "frontend/src/adapters/libraryComposition.js",
];

test("layer modules address the app through getView, not this", () => {
  for (const file of GETVIEW_MODULES) {
    assert.doesNotMatch(read(file), /\bthis\./, `${file}: no this access`);
  }
});
