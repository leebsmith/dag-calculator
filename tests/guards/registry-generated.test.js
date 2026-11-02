import test from "node:test";
import assert from "node:assert/strict";

import { renderRegistry } from "../../scripts/registry-source.mjs";
import { read, rel, walk } from "./util.js";

// The registry is generated from data/labels.json. A hand edit to generated.js,
// or a second registry map in one of the slice modules, would create two homes
// for the same labels — the drift D3 exists to prevent.

test("generated registry is byte-identical to its source", () => {
  assert.equal(read("frontend/src/views/registry/generated.js"), renderRegistry());
});

test("no slice module declares its own registry map", () => {
  const offenders = [];
  for (const file of walk("frontend/src/views/registry", [".js"])) {
    const path = rel(file);
    if (path.endsWith("generated.js") || path.endsWith("index.js")) continue;
    if (/export const \w+Registry = \{/.test(read(path))) offenders.push(path);
  }
  assert.deepEqual(
    offenders,
    [],
    `registry maps outside the generated file:\n${offenders.join("\n")}`
  );
});
