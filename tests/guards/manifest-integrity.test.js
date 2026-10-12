import test from "node:test";
import assert from "node:assert/strict";
import { resolveReference } from "../../frontend/src/engine/paths.js";
import { steps } from "../../frontend/src/views/steps.js";
import { artifact } from "./util.js";

// A6: every manifest reference must resolve to a declared node/field.
test("A6: manifest integrity", () => {
  const a = artifact();
  const offenders = [];
  for (const step of steps) {
    for (const entry of step.fields) {
      const id = typeof entry === "string" ? entry : entry.id;
      if (!resolveReference(a, id)) offenders.push(id);
    }
  }
  assert.deepEqual(offenders, [], `Unresolved manifest refs:\n${offenders.join("\n")}`);
});
