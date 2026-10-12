import test from "node:test";
import assert from "node:assert/strict";
import { walk, read, rel } from "./util.js";

// A1: no reactivity / read-tracking primitives anywhere the engine, store, or
// producer live. Dependencies come from the artifact, never from reads.
const RE = /\bnew\s+Proxy\b|\bdefineProperty\b|\bcomputed\s*\(|\breactive\s*\(|\bwatch\s*\(|\beffect\s*\(/;

test("A1: no reactivity inference in engine/store/producer", () => {
  const files = [
    ...walk("frontend/src/engine", [".js"]),
    ...walk("frontend/src/store", [".js"]),
  ];
  for (const abs of walk("frontend/src/views", [".js"])) {
    if (abs.endsWith("producer.js")) files.push(abs);
  }

  const offenders = [];
  for (const abs of files) {
    read(rel(abs))
      .split("\n")
      .forEach((line, i) => {
        if (RE.test(line)) offenders.push(`${rel(abs)}:${i + 1}: ${line.trim()}`);
      });
  }
  assert.deepEqual(offenders, [], `Reactivity inference found:\n${offenders.join("\n")}`);
});
