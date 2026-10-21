import test from "node:test";
import assert from "node:assert/strict";

import { createStepApp } from "../../frontend/src/adapters/stepAdapter.js";
import { read, rel, walk } from "./util.js";

const JS_GLOBALS = new Set([
  "Array",
  "Boolean",
  "Date",
  "JSON",
  "Map",
  "Math",
  "Number",
  "Object",
  "Set",
  "String",
  "decodeURIComponent",
  "encodeURIComponent",
  "isFinite",
  "isNaN",
  "parseFloat",
  "parseInt",
]);

const HANDLER = /(?:^|\s)(?:@|x-on:)[\w.:-]+="([^"]*)"/g;
const CALL = /(^|[^\w$.'"])([A-Za-z_$][\w$]*)\s*\(/g;

function calledNames(expression) {
  const names = new Set();
  for (const match of expression.matchAll(CALL)) names.add(match[2]);
  return names;
}

test("A8: every Alpine handler calls a method on the step app", () => {
  const app = createStepApp();
  const files = [
    "frontend/index.html",
    ...walk("frontend/src/partials", [".html"]).map(rel).sort(),
  ];
  const missing = [];

  for (const file of files) {
    for (const match of read(file).matchAll(HANDLER)) {
      for (const name of calledNames(match[1])) {
        if (JS_GLOBALS.has(name)) continue;
        if (typeof app[name] !== "function") missing.push(`${file}: ${name}()`);
      }
    }
  }

  assert.deepEqual(missing, [], `unbound Alpine handlers:\n${missing.join("\n")}`);
});
