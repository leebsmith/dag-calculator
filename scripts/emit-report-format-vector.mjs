// Regenerate tests/conformance/fixtures/report-format-vector.json.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildFormatVector, readArtifact, readBundle } from "./report-format-vector.mjs";

const target = fileURLToPath(
  new URL("../tests/conformance/fixtures/report-format-vector.json", import.meta.url)
);
const vector = buildFormatVector(readArtifact(), readBundle());
writeFileSync(target, `${JSON.stringify(vector, null, 2)}\n`);
console.log("wrote tests/conformance/fixtures/report-format-vector.json");
