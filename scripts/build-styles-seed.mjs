// Regenerate data/seeds/styles.json from the committed BJCP sources.
//
// Usage: node scripts/build-styles-seed.mjs
//
// Two raw sources (flat lowercase keys, id-keyed by `number`) are normalized
// and merged into one flat id-keyed seed:
//   1. data/sources/bjcp-2021-styles.json — the 2021 style-guide export;
//   2. data/sources/bjcp-specialty-ipas.json — the hand-authored Specialty IPA
//      sub-types (from the BJCP 2015 style page, which lists each with stats).
//
// The "21B Specialty IPA" container entry is dropped: it is replaced by the
// concrete sub-types in the second source.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SOURCES = [
  fileURLToPath(new URL("../data/sources/bjcp-2021-styles.json", import.meta.url)),
  fileURLToPath(new URL("../data/sources/bjcp-specialty-ipas.json", import.meta.url)),
];
const OUTPUT = fileURLToPath(new URL("../data/seeds/styles.json", import.meta.url));

// Style ids excluded from the merged seed.
const DROP_IDS = new Set(["21B"]);

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

const rows = SOURCES.flatMap((path) => JSON.parse(readFileSync(path, "utf8")));

const seed = {};
for (const row of rows) {
  const component = convert(row);
  if (!component.id) throw new Error(`style "${row.name}" has no number`);
  if (DROP_IDS.has(component.id)) continue;
  if (seed[component.id]) throw new Error(`duplicate style number "${component.id}"`);
  seed[component.id] = component;
}

const sorted = Object.fromEntries(Object.keys(seed).sort().map((id) => [id, seed[id]]));
writeFileSync(OUTPUT, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`wrote ${Object.keys(sorted).length} styles to data/seeds/styles.json`);
