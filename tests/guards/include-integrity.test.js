import test from "node:test";
import assert from "node:assert/strict";
import { steps } from "../../frontend/src/views/steps.js";
import { ROOT, read, existsSync, join } from "./util.js";

// A7: every <load src> include exists and corresponds to a manifest step partial
// (bidirectional — no orphan includes, no undeclared steps). Steps may share a
// single generic partial, so comparison is over the unique sets. Non-step
// includes (e.g. the app-level library surface) are allowlisted explicitly.
const EXTRA_PARTIALS = [
  "./src/partials/action-error.html",
  "./src/partials/library.html",
  "./src/partials/chooser.html",
  "./src/partials/batch-setup.html",
  "./src/partials/editor.html",
  "./src/partials/findings.html",
];

// App-level files that may declare <load src>: index.html plus the allowlisted
// non-step partials (the editor shell loads the step partials; modal includes
// live inside step partials and are not part of this bidirectional contract).
const LOAD_FILES = [
  "frontend/index.html",
  ...EXTRA_PARTIALS.map((p) => `frontend/${p.replace(/^\.?\//, "")}`),
];

test("A7: include integrity", () => {
  const srcs = LOAD_FILES.flatMap((file) => {
    const html = read(file);
    return [...html.matchAll(/<load\s+src="([^"]+)"/g)].map((m) => m[1]);
  });

  for (const src of srcs) {
    const p = join(ROOT, "frontend", src.replace(/^\.?\//, ""));
    assert.ok(existsSync(p), `missing partial for <load src="${src}">`);
  }

  const norm = (p) => p.replace(/^\.\//, "");
  const declared = [...new Set(steps.map((s) => s.partial)), ...EXTRA_PARTIALS].map(norm);
  assert.deepEqual(
    [...new Set(srcs.map(norm))].sort(),
    [...declared].sort(),
    "app-level <load> includes must match the step manifest partials"
  );
});
