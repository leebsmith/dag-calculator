// Regenerate docs/frontend-ownership.md from frontend/src/adapters/installers.js.
// Run after any installer or card-partial change: `node scripts/emit-ownership-index.mjs`.
// The committed document is the summary (header, installers, cross-owner reads);
// the 700-line member table is on demand: `node scripts/emit-ownership-index.mjs --full`.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildOwnershipIndex } from "./frontend-ownership.mjs";

const full = process.argv.includes("--full");
if (full) {
  process.stdout.write(`${buildOwnershipIndex()}\n`);
} else {
  const target = fileURLToPath(new URL("../docs/frontend-ownership.md", import.meta.url));
  writeFileSync(target, buildOwnershipIndex(undefined, undefined, { members: false }));
  console.log("wrote docs/frontend-ownership.md");
}
