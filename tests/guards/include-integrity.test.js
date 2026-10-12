import test from "node:test";
import assert from "node:assert/strict";
import { steps } from "../../frontend/src/views/steps.js";
import { ROOT, read, existsSync, join } from "./util.js";

// A7: every <load src> include exists and corresponds to a manifest step
// (bidirectional — no orphan includes, no undeclared steps).
test("A7: include integrity", () => {
  const html = read("frontend/index.html");
  const srcs = [...html.matchAll(/<load\s+src="([^"]+)"/g)].map((m) => m[1]);

  for (const src of srcs) {
    const p = join(ROOT, "frontend", src.replace(/^\.?\//, ""));
    assert.ok(existsSync(p), `missing partial for <load src="${src}">`);
  }

  const declared = steps.map((s) => s.partial);
  assert.deepEqual(
    [...srcs].sort(),
    [...declared].sort(),
    "index.html <load> includes must match the step manifest partials"
  );
});
