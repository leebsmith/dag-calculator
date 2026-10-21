// Regenerate data/seeds/hops.json from the committed beer-analytics.com scrape.
//
// Usage: node scripts/build-hops-seed.mjs [input.json]
// Defaults to data/sources/beer-analytics-hops.json (the raw scrape produced by
// scripts/scrape/hop_scraper.py).
//
// The scrape is an array of BeerAnalyticsHopDetail objects; this normalizes each
// row into the flat id-keyed, schema-conforming map the runtime cache expects.
// Alpha acid uses the median of the scraped range, stored as a fraction (0..1).

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULT_INPUT = fileURLToPath(
  new URL("../data/sources/beer-analytics-hops.json", import.meta.url)
);
const OUTPUT = fileURLToPath(new URL("../data/seeds/hops.json", import.meta.url));
const SITE = "https://www.beer-analytics.com";

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// "Aroma Hops" -> "aroma", "Dual Purpose Hops" -> "dual-purpose".
function categorySlug(breadcrumbCategory) {
  return slugify((breadcrumbCategory ?? "").replace(/\bhops?\b/gi, "").trim());
}

function fraction(value) {
  return typeof value === "number" ? value / 100 : undefined;
}

function range(characteristics, key) {
  return characteristics?.[key] ?? {};
}

function convert(row) {
  const name = (row.hop_name ?? "").trim();
  if (!name) return null;

  const component = { id: slugify(name), name };

  if (row.hop_synonym) component.synonym = row.hop_synonym;
  if (row.breadcrumb_category) component.category = row.breadcrumb_category;
  if (row.purpose) component.purpose = row.purpose;
  if (row.origin) component.origin = row.origin;
  if (row.alpha_rating) component.alpha_rating = row.alpha_rating;
  if (Number.isInteger(row.recipes_count)) component.recipes_count = row.recipes_count;

  const chars = row.characteristics ?? {};
  const alpha = range(chars, "alpha_acid_range");
  const beta = range(chars, "beta_acid_range");
  if (fraction(alpha.median) !== undefined) component.alpha_acid_pct = fraction(alpha.median);
  if (fraction(alpha.min) !== undefined) component.alpha_acid_min_pct = fraction(alpha.min);
  if (fraction(alpha.max) !== undefined) component.alpha_acid_max_pct = fraction(alpha.max);
  if (fraction(beta.median) !== undefined) component.beta_acid_pct = fraction(beta.median);

  if (Array.isArray(row.pairings) && row.pairings.length) {
    component.pairings = row.pairings.join(", ");
  }
  if (Array.isArray(row.flavor_profiles) && row.flavor_profiles.length) {
    component.flavor_profiles = row.flavor_profiles.join(", ");
  }
  if (row.profile_description) component.notes = row.profile_description;

  const category = categorySlug(row.breadcrumb_category);
  if (category) component.url = `${SITE}/hops/${category}/${component.id}/`;

  return component;
}

export function buildSeed(rows) {
  const usedSlugs = new Set();
  const seed = {};
  for (const row of rows) {
    const component = convert(row);
    if (!component) continue;
    let id = component.id;
    if (usedSlugs.has(id)) {
      let n = 2;
      while (usedSlugs.has(`${id}-${n}`)) n += 1;
      id = `${id}-${n}`;
      component.id = id;
    }
    usedSlugs.add(id);
    seed[id] = component;
  }
  return Object.fromEntries(Object.keys(seed).sort().map((id) => [id, seed[id]]));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const inputPath = process.argv[2] ?? DEFAULT_INPUT;
  const seed = buildSeed(JSON.parse(readFileSync(inputPath, "utf8")));
  writeFileSync(OUTPUT, `${JSON.stringify(seed, null, 2)}\n`);
  console.log(`wrote ${Object.keys(seed).length} hops to data/seeds/hops.json`);
}
