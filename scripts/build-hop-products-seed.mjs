// Regenerate data/seeds/hop-products.json from the curated variant source.
//
// Usage: node scripts/build-hop-products-seed.mjs [input.json]
// Defaults to data/sources/hop-products.json. Percentage fields are authored as
// percentages in the source and stored as fractions in the seed.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULT_INPUT = fileURLToPath(
  new URL("../data/sources/hop-products.json", import.meta.url)
);
const OUTPUT = fileURLToPath(new URL("../data/seeds/hop-products.json", import.meta.url));

const PERCENT_FIELDS = [
  "alpha_acid_pct",
  "alpha_acid_min_pct",
  "alpha_acid_max_pct",
  "beta_acid_pct",
  "total_oil_pct",
];

function sorted(seed) {
  return Object.fromEntries(Object.keys(seed).sort().map((id) => [id, seed[id]]));
}

export function buildSeed(entries) {
  const used = new Set();
  const seed = {};

  for (const entry of entries) {
    if (!entry?.id || !entry?.name) {
      throw new Error("hop product entries require id and name");
    }
    if (used.has(entry.id)) {
      throw new Error(`duplicate hop product id "${entry.id}"`);
    }
    used.add(entry.id);

    const component = { ...entry };
    for (const field of PERCENT_FIELDS) {
      if (typeof component[field] === "number") component[field] /= 100;
    }
    if (!component.url) delete component.url;
    seed[component.id] = component;
  }

  return sorted(seed);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const inputPath = process.argv[2] ?? DEFAULT_INPUT;
  const source = JSON.parse(readFileSync(inputPath, "utf8"));
  const entries = Array.isArray(source) ? source : source.entries ?? [];
  const seed = buildSeed(entries);
  writeFileSync(OUTPUT, `${JSON.stringify(seed, null, 2)}\n`);
  console.log(`wrote ${Object.keys(seed).length} hop products to data/seeds/hop-products.json`);
}
