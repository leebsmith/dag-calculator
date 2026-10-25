// SVG length attributes reject an empty string: Alpine binding `undefined`
// (from an optional chain) logs an XML parse error and leaves the geometry
// unset. Every bound length must therefore supply a numeric fallback.

import test from "node:test";
import assert from "node:assert/strict";

import { read, rel, walk } from "./util.js";

const LENGTH_ATTRS = [
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "width",
  "height",
];
const BINDING = new RegExp(`:(${LENGTH_ATTRS.join("|")})="([^"]*)"`, "g");

test("SVG length bindings always supply a numeric fallback", () => {
  const offenders = [];
  for (const file of walk("frontend/src/partials", [".html"]).map(rel)) {
    for (const match of read(file).matchAll(BINDING)) {
      const [, attribute, expression] = match;
      if (!expression.includes("?.")) continue;
      if (expression.includes("??")) continue;
      offenders.push(`${file}: :${attribute}="${expression}"`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `optional SVG length bindings need a numeric fallback:\n${offenders.join("\n")}`
  );
});
