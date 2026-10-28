// Regenerate docs/frontend-ownership.md from frontend/src/adapters/installers.js.
// Run after any installer or card-partial change: `node scripts/emit-ownership-index.mjs`.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildOwnershipIndex } from "./frontend-ownership.mjs";

const target = fileURLToPath(new URL("../docs/frontend-ownership.md", import.meta.url));
writeFileSync(target, buildOwnershipIndex());
console.log("wrote docs/frontend-ownership.md");
