// Regenerate docs/dag-artifacts/inventory.md from data/artifact.json.
// Run after any artifact change: `node scripts/emit-artifact-inventory.mjs`.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildInventory, readArtifact } from "./artifact-inventory.mjs";

const target = fileURLToPath(new URL("../docs/dag-artifacts/inventory.md", import.meta.url));
writeFileSync(target, buildInventory(readArtifact()));
console.log("wrote docs/dag-artifacts/inventory.md");
