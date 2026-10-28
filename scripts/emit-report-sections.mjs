// Regenerate docs/report-sections.md and the app-facing manifest from the
// section registry literal.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  buildSectionsDoc,
  buildSectionsManifest,
  readRegistry,
} from "./report-sections.mjs";

const sections = readRegistry();
const doc = fileURLToPath(new URL("../docs/report-sections.md", import.meta.url));
writeFileSync(doc, buildSectionsDoc(sections));
console.log("wrote docs/report-sections.md");

const manifest = fileURLToPath(
  new URL("../backend/app/templates/sections.json", import.meta.url)
);
writeFileSync(manifest, buildSectionsManifest(sections));
console.log("wrote backend/app/templates/sections.json");
