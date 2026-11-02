import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildGeneratedRegistry, renderRegistry } from "./registry-source.mjs";

const target = fileURLToPath(new URL("../frontend/src/views/registry/generated.js", import.meta.url));
const registry = buildGeneratedRegistry();
writeFileSync(target, renderRegistry(registry));
console.log(`wrote ${Object.keys(registry).length} registry entries`);
