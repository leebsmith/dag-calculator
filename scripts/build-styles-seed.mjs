// Regenerate data/seeds/styles.json from the aggregated BJCP 2021 scrape.
//
// Usage: node scripts/build-styles-seed.mjs [input.json]
// Defaults to data/sources/bjcp_styles_2021.json (the vendored aggregator's
// output). The seed uses the 2021 guide; the 2015 capture is preserved as a
// source but is not merged.
//
// The aggregated shape (scripts/scrape/bjcp/aggregator.py): style_id/style_name,
// category/categorynumber, snake_case prose, nested vital_statistics, and array
// commercial_examples/style_attributes. This normalizes it into the flat,
// id-keyed seed the runtime reference cache expects:
//   - category-header records (bare numeric id) are dropped;
//   - duplicated style ids (21B, 27A) become composite ids from the sub-name;
//   - a bare duplicate with no ":" sub-name is the container and is dropped;
//   - nested ranges are flattened; arrays are joined to comma-delimited strings.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULT_INPUT = fileURLToPath(
  new URL("../data/sources/bjcp_styles_2021.json", import.meta.url)
);
const OUTPUT = fileURLToPath(new URL("../data/seeds/styles.json", import.meta.url));

// Prose keys copied verbatim (already snake_case in the aggregated shape).
const PROSE_FIELDS = [
  "overall_impression",
  "aroma",
  "appearance",
  "flavor",
  "mouthfeel",
  "comments",
  "history",
  "characteristic_ingredients",
  "style_comparison",
];

// vital_statistics.<key>.{min,max} -> seed <key>_min / <key>_max.
const STAT_FIELDS = ["ibu", "srm", "og", "fg", "abv"];

const isStyleLevel = (styleId) => /[A-Za-z]$/.test(styleId);

// The BJCP site uses "-" for "not applicable"; treat it like an empty value.
function present(value) {
  return value !== undefined && value !== null && String(value).trim() !== "" && String(value).trim() !== "-";
}

// "Specialty IPA: Belgian IPA" -> "Belgian IPA"; null when there is no sub-name.
function subName(styleName) {
  const index = (styleName ?? "").indexOf(":");
  return index === -1 ? null : styleName.slice(index + 1).trim();
}

function convert(row, id) {
  const component = {
    id,
    name: row.style_name,
    category_id: row.categorynumber ?? "",
    category_name: row.category ?? "",
    type: "beer",
  };

  for (const field of PROSE_FIELDS) {
    if (present(row[field])) component[field] = row[field];
  }

  const vitals = row.vital_statistics ?? {};
  for (const key of STAT_FIELDS) {
    const range = vitals[key];
    if (range && typeof range.min === "number" && typeof range.max === "number") {
      component[`${key}_min`] = range.min;
      component[`${key}_max`] = range.max;
    }
  }

  if (Array.isArray(row.commercial_examples) && row.commercial_examples.length) {
    component.commercial_examples = row.commercial_examples.join(", ");
  }
  if (Array.isArray(row.style_attributes) && row.style_attributes.length) {
    component.tags = row.style_attributes.join(", ");
  }

  return component;
}

export function buildSeed(rows) {
  const styleLevel = rows.filter((row) => isStyleLevel(row.style_id));
  const idCounts = {};
  for (const row of styleLevel) idCounts[row.style_id] = (idCounts[row.style_id] ?? 0) + 1;

  const seed = {};
  for (const row of styleLevel) {
    let id = row.style_id;
    if (idCounts[row.style_id] > 1) {
      const suffix = subName(row.style_name);
      // A duplicated id with no sub-name is the container record (e.g. the bare
      // "Specialty IPA"); drop it in favor of its concrete sub-types.
      if (!suffix) continue;
      id = `${row.style_id} ${suffix}`;
    }
    if (seed[id]) throw new Error(`duplicate style id "${id}"`);
    seed[id] = convert(row, id);
  }

  return Object.fromEntries(Object.keys(seed).sort().map((id) => [id, seed[id]]));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const inputPath = process.argv[2] ?? DEFAULT_INPUT;
  const seed = buildSeed(JSON.parse(readFileSync(inputPath, "utf8")));
  writeFileSync(OUTPUT, `${JSON.stringify(seed, null, 2)}\n`);
  console.log(`wrote ${Object.keys(seed).length} styles to data/seeds/styles.json`);
}
