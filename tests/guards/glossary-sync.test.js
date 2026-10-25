// Anti-drift gate: the generated glossary must match the artifact + registries.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildGlossary, readArtifact } from "../../scripts/report-bundle-glossary.mjs";

test("report bundle glossary is in sync with the artifact and registries", () => {
  const expected = buildGlossary(readArtifact());
  const actual = readFileSync(
    fileURLToPath(new URL("../../docs/report-bundle-glossary.md", import.meta.url)),
    "utf8"
  );
  assert.equal(
    actual,
    expected,
    "docs/report-bundle-glossary.md is stale — run `node scripts/emit-report-bundle-glossary.mjs`"
  );
});
