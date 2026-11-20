// `x-data` is a scope, not a program. The partial may name a factory that the
// app owns, or alias one scope member, but it may not carry its own logic: an
// IIFE or a computed getter in markup is code that the shape ceilings, the
// ownership index and the card tests never see.
//
// Allowed:
//   stepCalculator(), draftTableConfig()            a zero-argument app factory
//   formBuilder({ ... }), modalShell({ ... })       a declarative schema literal
//   { field: child }, { config: pumpConfig() }      one key, a reference or a call
//   { get findingItems() { return findings; } }     an alias to one scope member

import test from "node:test";
import assert from "node:assert/strict";

import { read, rel, walk } from "./util.js";

const ATTR = /x-data="([^"]*)"/gs;
const ALIAS = /^\{\s*get\s+[A-Za-z_$][\w$]*\s*\(\s*\)\s*\{\s*return\s+[A-Za-z_$][\w$.]*\s*;?\s*\}\s*\}$/s;
const CALL = /^[A-Za-z_$][\w$]*\(\s*\)$/s;
const FACTORY = /^(?:formBuilder|modalShell)\(\s*\{[\s\S]*\}\s*\)$/s;
const SIMPLE = /^\{\s*[A-Za-z_$][\w$]*\s*:\s*[^{};,]+?\s*\}$/s;
const LOGIC = /=>|\bfunction\b|\bget\s|\bMath\./;

function shapeOf(expression) {
  const source = expression.trim();
  if (ALIAS.test(source)) return null;
  if (CALL.test(source)) return null;
  if (FACTORY.test(source)) return source.startsWith("(() =>") ? "IIFE" : null;
  if (SIMPLE.test(source) && !LOGIC.test(source)) return null;
  if (source.includes("(() =>") || source.includes("(function")) return "IIFE";
  return "inline logic";
}

function files() {
  return ["frontend/index.html", ...walk("frontend/src/partials", [".html"])];
}

function occurrences() {
  const found = [];
  for (const abs of files()) {
    const path = abs.startsWith("frontend/") ? abs : rel(abs);
    const source = read(path);
    for (const match of source.matchAll(ATTR)) {
      const line = source.slice(0, match.index).split("\n").length;
      found.push({ path, line, expression: match[1] });
    }
  }
  return found;
}

test("x-data carries a factory, a literal or an alias — never its own logic", () => {
  assert.ok(occurrences().length >= 10, "the scan must see the scope declarations");
  const offenders = occurrences()
    .map((entry) => ({ ...entry, shape: shapeOf(entry.expression) }))
    .filter((entry) => entry.shape)
    .map((entry) => {
      const head = entry.expression.trim().split("\n")[0].slice(0, 60);
      return `${entry.path}:${entry.line}: ${entry.shape} (${head})`;
    });
  assert.deepEqual(offenders, [], `Move this scope into an app factory:\n${offenders.join("\n")}`);
});

test("the thinness check rejects the shapes it exists to catch", () => {
  const cases = {
    "(() => { const x = 1; return formBuilder({ schema: [] }); })()": "IIFE",
    "{ get findingItems() { return (rows || []).map((r) => r.id); } }": "inline logic",
    "{ a: one(), b: two() }": "inline logic",
    "{ value: Math.max(1, 2) }": "inline logic",
    stepCalculator: "inline logic",
  };
  for (const [expression, shape] of Object.entries(cases)) {
    assert.equal(shapeOf(expression), shape, expression);
  }
});

test("the accepted shapes stay accepted", () => {
  for (const expression of [
    "stepCalculator()",
    "draftTableConfig()",
    "formBuilder({ schema: [{ id: 'x', read: () => view.x }] })",
    "modalShell({ title: 'x', body: 'y' })",
    "{ field: child }",
    "{ config: boilHopTableConfig() }",
    "{ delta: $store.importReview.delta }",
    "{ get findingItems() { return findings; } }",
  ]) {
    assert.equal(shapeOf(expression), null, expression);
  }
});
