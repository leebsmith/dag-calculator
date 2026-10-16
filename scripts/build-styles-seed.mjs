// Regenerate data/seeds/styles.json from a BJCP styles export.
//
// Usage: node scripts/build-styles-seed.mjs [input.json]
// Defaults to /junk/styles.json.
//
// The export is a bare array of styles with lowercase flat keys; this
// normalizes each into the flat, schema-conforming, id-keyed map the runtime
// seed substrate expects (keyed by the BJCP style number).

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULT_INPUT = "/junk/styles.json";
const OUTPUT = fileURLToPath(new URL("../data/seeds/styles.json", import.meta.url));

// Prose keys shared verbatim (already snake_case in the target).
const TEXT_FIELDS = {
  overallimpression: "overall_impression",
  aroma: "aroma",
  appearance: "appearance",
  flavor: "flavor",
  mouthfeel: "mouthfeel",
  comments: "comments",
  history: "history",
  characteristicingredients: "characteristic_ingredients",
  stylecomparison: "style_comparison",
  entryinstructions: "entry_instructions",
  commercialexamples: "commercial_examples",
  tags: "tags",
};

// Flat vital-stat keys -> target field names.
const STAT_FIELDS = {
  ogmin: "og_min",
  ogmax: "og_max",
  fgmin: "fg_min",
  fgmax: "fg_max",
  ibumin: "ibu_min",
  ibumax: "ibu_max",
  srmmin: "srm_min",
  srmmax: "srm_max",
  abvmin: "abv_min",
  abvmax: "abv_max",
};

// Placeholder used in the export for "not applicable".
const PLACEHOLDER = "-";

function present(value) {
  return value !== undefined && value !== null && value.trim?.() !== "" && value !== PLACEHOLDER;
}

function convert(row) {
  const component = {
    id: row.number,
    name: row.name,
    category_id: row.categorynumber,
    category_name: row.category,
    type: "beer",
  };

  for (const [src, dst] of Object.entries(TEXT_FIELDS)) {
    if (present(row[src])) component[dst] = row[src];
  }

  for (const [src, dst] of Object.entries(STAT_FIELDS)) {
    if (present(row[src])) {
      const value = Number(row[src]);
      if (!Number.isNaN(value)) component[dst] = value;
    }
  }

  return component;
}

const inputPath = process.argv[2] ?? DEFAULT_INPUT;
const rows = JSON.parse(readFileSync(inputPath, "utf8"));
if (!Array.isArray(rows)) throw new Error(`${inputPath} must be a JSON array`);

const seed = {};
for (const row of rows) {
  const component = convert(row);
  if (!component.id) throw new Error(`style "${row.name}" has no number`);
  if (seed[component.id]) throw new Error(`duplicate style number "${component.id}"`);
  seed[component.id] = component;
}

const sorted = Object.fromEntries(Object.keys(seed).sort().map((id) => [id, seed[id]]));
writeFileSync(OUTPUT, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`wrote ${Object.keys(sorted).length} styles to data/seeds/styles.json`);
