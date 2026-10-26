import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  FROZEN_PREFIXES,
  GENERATED_PATHS,
  GENERATORS,
  LOCK_PAIRS,
  findViolations,
} from "../../scripts/precommit.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;

test("every generator and generated path exists", () => {
  for (const generator of GENERATORS) {
    if (generator.command === process.execPath) {
      assert.ok(existsSync(join(ROOT, generator.args[0])), `${generator.args[0]} is missing`);
    }
    for (const output of generator.outputs) {
      assert.ok(existsSync(join(ROOT, output)), `${output} is missing`);
    }
  }
  assert.equal(
    new Set(GENERATED_PATHS).size,
    GENERATED_PATHS.length,
    "generated paths must be listed once"
  );
});

test("ordinary staged changes are not violations", () => {
  assert.deepEqual(
    findViolations({ staged: ["frontend/src/views/steps.js", "docs/engine.md", "data/artifact.json", "tests/conformance/fixtures/report-bundle.json"] }),
    []
  );
});

test("frozen docs cannot be staged", () => {
  for (const prefix of FROZEN_PREFIXES) {
    const violations = findViolations({ staged: [`${prefix}example.md`] });
    assert.equal(violations.length, 1);
    assert.match(violations[0], /frozen/);
  }
  assert.deepEqual(findViolations({ staged: ["docs/historical-notes.md"] }), []);
});

test("an artifact change demands the report bundle fixture", () => {
  const violations = findViolations({ staged: ["data/artifact.json"] });
  assert.equal(violations.length, 1);
  assert.match(violations[0], /make generate/);
});

test("a manifest change demands its lockfile", () => {
  for (const [manifest, lock] of LOCK_PAIRS) {
    const violations = findViolations({ staged: [manifest] });
    assert.equal(violations.length, 1);
    assert.match(violations[0], new RegExp(lock));
    assert.deepEqual(findViolations({ staged: [manifest, lock] }), []);
  }
});

test("unstaged edits to a generated file block regeneration", () => {
  const violations = findViolations({
    staged: ["frontend/src/views/steps.js"],
    dirtyGenerated: ["docs/report-bundle-glossary.md"],
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0], /unstaged edits/);
});
