import test from "node:test";
import assert from "node:assert/strict";
import { steps } from "../../frontend/src/views/steps.js";
import { ROOT, read, existsSync, join } from "./util.js";

// A7: every <load src> include exists and corresponds to a manifest step partial
// (bidirectional — no orphan includes, no undeclared steps). Steps may share a
// single generic partial, so comparison is over the unique sets. Non-step
// includes (e.g. the app-level library surface) are allowlisted explicitly.
const EXTRA_PARTIALS = ["./src/partials/library.html"];

test("A7: include integrity", () => {
  const html = read("frontend/index.html");
  const srcs = [...html.matchAll(/<load\s+src="([^"]+)"/g)].map((m) => m[1]);

  for (const src of srcs) {
    const p = join(ROOT, "frontend", src.replace(/^\.?\//, ""));
    assert.ok(existsSync(p), `missing partial for <load src="${src}">`);
  }

  const declared = [...new Set(steps.map((s) => s.partial)), ...EXTRA_PARTIALS];
  assert.deepEqual(
    [...new Set(srcs)].sort(),
    [...declared].sort(),
    "index.html <load> includes must match the step manifest partials"
  );
});
