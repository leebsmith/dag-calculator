import test from "node:test";
import assert from "node:assert/strict";
import { walk, read, rel } from "./util.js";

// A2: only the engine, the adapters, and the field-model producer may reference
// the engine. Views/partials bind to field models.
const ALLOW = [
  "frontend/src/engine/",
  "frontend/src/adapters/",
  "frontend/src/store/snapshot.js",
  "frontend/src/views/producer.js",
  "frontend/src/views/producer/",
];

const isComment = (line) => /^\s*(\/\/|\*|\/\*|#)/.test(line);

test("A2: `engine.` only referenced by engine/adapters/producer", () => {
  const offenders = [];
  for (const abs of walk("frontend/src", [".js", ".html"])) {
    const r = rel(abs);
    if (ALLOW.some((a) => r.startsWith(a))) continue;
    read(r)
      .split("\n")
      .forEach((line, i) => {
        if (!isComment(line) && /engine\./.test(line)) {
          offenders.push(`${r}:${i + 1}: ${line.trim()}`);
        }
      });
  }
  assert.deepEqual(offenders, [], `View layer references engine directly:\n${offenders.join("\n")}`);
});
