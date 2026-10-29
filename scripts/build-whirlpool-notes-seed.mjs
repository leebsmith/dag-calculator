// Regenerate data/seeds/whirlpool-notes.json from the curated temperature bands.
//
// Usage: node scripts/build-whirlpool-notes-seed.mjs [input.json]
// Defaults to data/sources/whirlpool-notes.json. The source is a hand-authored
// table of whirlpool addition bands (Yakima Chief Hops data sheet); the seed adds
// the band midpoint the start-temperature selector prefills.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULT_INPUT = fileURLToPath(
  new URL("../data/sources/whirlpool-notes.json", import.meta.url)
);
const OUTPUT = fileURLToPath(new URL("../data/seeds/whirlpool-notes.json", import.meta.url));

export function buildSeed(source) {
  const seed = {};
  for (const [id, entry] of Object.entries(source ?? {})) {
    const range = entry?.temp_range;
    if (!entry?.name || !Array.isArray(range) || range.length !== 2) {
      throw new Error(`whirlpool note "${id}" needs a name and a two-value temp_range`);
    }
    const [low, high] = range;
    if (!Number.isFinite(low) || !Number.isFinite(high) || low >= high) {
      throw new Error(`whirlpool note "${id}" has an invalid temp_range`);
    }
    seed[id] = {
      id,
      name: entry.name,
      temp_min: low,
      temp_max: high,
      mid_temp: (low + high) / 2,
      description: entry.description ?? "",
    };
  }
  return Object.fromEntries(Object.keys(seed).sort().map((key) => [key, seed[key]]));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const inputPath = process.argv[2] ?? DEFAULT_INPUT;
  const seed = buildSeed(JSON.parse(readFileSync(inputPath, "utf8")));
  writeFileSync(OUTPUT, `${JSON.stringify(seed, null, 2)}\n`);
  console.log(`wrote ${Object.keys(seed).length} whirlpool bands to data/seeds/whirlpool-notes.json`);
}
