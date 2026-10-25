// Regenerate docs/report-bundle-glossary.md from the artifact + registries.
// Run after any artifact, registry, or step-label change.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildGlossary, readArtifact } from "./report-bundle-glossary.mjs";

const target = fileURLToPath(new URL("../docs/report-bundle-glossary.md", import.meta.url));
writeFileSync(target, buildGlossary(readArtifact()));
console.log("wrote docs/report-bundle-glossary.md");
