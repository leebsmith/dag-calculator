// Presentation ids stay in the registry: card modules and the producer must not
// hardcode artifact node paths. Registry modules are the allowed home.

import test from "node:test";
import assert from "node:assert/strict";
import { walk, read, rel } from "./util.js";

const SCAN = ["frontend/src/views/producer", "frontend/src/adapters/cards"];
const NODE_LITERAL = /["'`](?:batch|mash|grist|equipment|water|solver|fermentables)\.[a-z0-9_.]+["'`]/;
const isComment = (line) => /^\s*(\/\/|\*|\/\*)/.test(line);

test("presentation ids are not hardcoded in cards or the producer", () => {
  const offenders = [];
  for (const dir of SCAN) {
    for (const abs of walk(dir, [".js"])) {
      const r = rel(abs);
      read(r)
        .split("\n")
        .forEach((line, i) => {
          if (!isComment(line) && NODE_LITERAL.test(line)) {
            offenders.push(`${r}:${i + 1}: ${line.trim()}`);
          }
        });
    }
  }
  assert.deepEqual(offenders, [], `Hardcoded presentation ids:\n${offenders.join("\n")}`);
});
