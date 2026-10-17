// Regenerate data/seeds/yeasts.json from a beer-analytics.com scrape.
//
// Usage: node scripts/build-yeasts-seed.mjs [input.json]
// Defaults to data/sources/beer-analytics-yeasts.json (the committed raw scrape,
// produced by scripts/scrape/yeast_scraper.py).
//
// The scrape is an array of display strings; this normalizes each row into the
// flat id-keyed, schema-conforming map the runtime reference cache expects.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULT_INPUT = fileURLToPath(
  new URL("../data/sources/beer-analytics-yeasts.json", import.meta.url)
);
const OUTPUT = fileURLToPath(new URL("../data/seeds/yeasts.json", import.meta.url));

// Scrape manufacturer labels that should match the catalog's established name.
const MANUFACTURER_ALIASES = {
  "Omega Yeast Labs": "Omega Yeast",
};

// Collapse the scrape's finer-grained flocculation labels onto the artifact
// `flocculation` taxonomy (Low / Medium / High).
const FLOCCULATION = {
  Low: "Low",
  "Medium-Low": "Low",
  Medium: "Medium",
  "Medium-High": "Medium",
  High: "High",
  "Very High": "High",
};

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parsePercent(value) {
  const match = /^([0-9.]+)%$/.exec((value ?? "").trim());
  return match ? Number(match[1]) / 100 : undefined;
}

function parseTemperature(value) {
  const nums = (value ?? "").match(/[0-9]+(?:\.[0-9]+)?/g);
  if (!nums || nums.length < 2) return {};
  return { temp_low_c: Number(nums[0]), temp_high_c: Number(nums[1]) };
}

function parseCount(value) {
  const digits = String(value ?? "").replace(/[^0-9]/g, "");
  return digits ? Number(digits) : undefined;
}

function convert(row, usedSlugs) {
  const { title } = row;
  const sep = title.indexOf("·");
  const rawManufacturer = title.slice(0, sep).trim();
  const manufacturer = MANUFACTURER_ALIASES[rawManufacturer] ?? rawManufacturer;
  const name = title.slice(sep + 1).trim();

  const attenuation_pct = parsePercent(row.attenuation);
  if (attenuation_pct === undefined) return null;

  // The scrape is the source of truth for tolerance; it stays a display string
  // ("12.0%", "High", …) because it is not uniformly numeric.
  const flocculation = FLOCCULATION[row.flocculation];
  const temperature = parseTemperature(row.temperature);

  let id = slugify(`${manufacturer} ${name}`);
  if (usedSlugs.has(id)) {
    let n = 2;
    while (usedSlugs.has(`${id}-${n}`)) n += 1;
    id = `${id}-${n}`;
  }
  usedSlugs.add(id);

  const component = { id, name, manufacturer, attenuation_pct };
  if (flocculation) component.flocculation = flocculation;
  if (row.tolerance) component.alcohol_tolerance = row.tolerance;
  if (row.form) component.form = row.form;
  Object.assign(component, temperature);
  const recipes = parseCount(row.recipes);
  if (recipes !== undefined) component.recipes = recipes;
  if (row.url) component.url = row.url;
  if (row.description) component.notes = row.description;
  return component;
}

const inputPath = process.argv[2] ?? DEFAULT_INPUT;
const rows = JSON.parse(readFileSync(inputPath, "utf8"));

const usedSlugs = new Set();
const seed = {};
for (const row of rows) {
  const component = convert(row, usedSlugs);
  if (component) seed[component.id] = component;
}

const sorted = Object.fromEntries(Object.keys(seed).sort().map((id) => [id, seed[id]]));
writeFileSync(OUTPUT, `${JSON.stringify(sorted, null, 2)}\n`);

const skipped = rows.length - Object.keys(sorted).length;
console.log(`wrote ${Object.keys(sorted).length} yeasts to data/seeds/yeasts.json`);
if (skipped) console.log(`skipped ${skipped} rows without a parseable attenuation`);
