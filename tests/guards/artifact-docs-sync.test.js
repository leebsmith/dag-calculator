import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildInventory, readArtifact } from "../../scripts/artifact-inventory.mjs";

// Anti-drift gate: the generated inventory must match the artifact, so a change
// to data/artifact.json that isn't re-synced into the doc fails the test suite.
test("artifact inventory doc is in sync with data/artifact.json", () => {
  const expected = buildInventory(readArtifact());
  const actual = readFileSync(
    fileURLToPath(new URL("../../docs/dag-artifacts/inventory.md", import.meta.url)),
    "utf8"
  );
  assert.equal(
    actual,
    expected,
    "docs/dag-artifacts/inventory.md is stale — run `node scripts/emit-artifact-inventory.mjs`"
  );
});
