// Regenerate docs/report-sections.md from the section registry literal.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildSectionsDoc, readRegistry } from "./report-sections.mjs";

const target = fileURLToPath(new URL("../docs/report-sections.md", import.meta.url));
writeFileSync(target, buildSectionsDoc(readRegistry()));
console.log("wrote docs/report-sections.md");
