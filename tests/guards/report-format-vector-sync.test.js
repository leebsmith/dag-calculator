// Anti-drift gate: the committed formatting vector must match what the frontend
// formatter produces from the committed bundle and artifact.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  buildFormatVector,
  readArtifact,
  readBundle,
} from "../../scripts/report-format-vector.mjs";

test("report format vector is in sync with the frontend formatter", () => {
  const expected = `${JSON.stringify(buildFormatVector(readArtifact(), readBundle()), null, 2)}\n`;
  const actual = readFileSync(
    fileURLToPath(new URL("../conformance/fixtures/report-format-vector.json", import.meta.url)),
    "utf8"
  );
  assert.equal(
    actual,
    expected,
    "report-format-vector.json is stale — run `node scripts/emit-report-format-vector.mjs`"
  );
});
