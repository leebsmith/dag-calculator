// `configAttributes` resolves `data-shell` / `data-config` / `data-schema` names
// through `Alpine.$data`. The module build does not publish itself, so `main.js`
// owns that assignment: without it every lookup resolves to nothing and a modal
// shell keeps the default ids its teleports cannot find.

import test from "node:test";
import assert from "node:assert/strict";

import { read, rel, walk } from "./util.js";

const SEAM = "frontend/src/components/configAttributes.js";

test("main.js publishes the Alpine handle before start()", () => {
  const source = read("frontend/src/main.js");
  const assignment = source.indexOf("globalThis.Alpine = Alpine;");
  const start = source.indexOf("Alpine.start();");

  assert.ok(assignment > 0, "main.js must assign globalThis.Alpine");
  assert.ok(start > 0, "main.js must call Alpine.start()");
  assert.ok(assignment < start, "the assignment must precede Alpine.start()");
});

test("the Alpine handle is read only through the config seam", () => {
  const readers = walk("frontend/src", [".js"])
    .map(rel)
    .filter((file) => read(file).includes("globalThis.Alpine"))
    .sort();

  assert.deepEqual(readers, ["frontend/src/main.js", SEAM].sort());
});

test("the seam fails loudly instead of resolving to null", () => {
  const source = read(SEAM);

  assert.ok(
    source.includes("Alpine is not published"),
    "a declared attribute without a published handle must throw"
  );
});
