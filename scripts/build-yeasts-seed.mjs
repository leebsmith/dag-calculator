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
const VENDOR_INPUT = fileURLToPath(
  new URL("../data/sources/whitelabs-yeasts.json", import.meta.url)
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

// The aggregator names carry the vendor's strain code as a trailing token
// ("European Ale WLP011"), which is the join key to the vendor source.
const STRAIN = /\b(WLP[0-9]+)\b/;

function vendorFor(name, vendorByStrain) {
  const match = STRAIN.exec(name ?? "");
  return match ? vendorByStrain.get(match[1]) : undefined;
}

function convert(row, usedSlugs, vendorByStrain) {
  const { title } = row;
  const sep = title.indexOf("·");
  const rawManufacturer = title.slice(0, sep).trim();
  const manufacturer = MANUFACTURER_ALIASES[rawManufacturer] ?? rawManufacturer;
  const name = title.slice(sep + 1).trim();

  let attenuation_pct = parsePercent(row.attenuation);
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

  // A matched vendor page upgrades the aggregator point to a cited apparent
  // range. The high end is the cap (A14); the low end is display data. A null
  // STA1 is "not published", modelled as d = 0 with an advisory in D5.
  const vendor = vendorFor(name, vendorByStrain);
  if (vendor) attenuation_pct = vendor.attenuation_high_pct / 100;

  const component = { id, name, manufacturer, attenuation_pct };
  if (vendor) {
    component.attenuation_low_pct = vendor.attenuation_low_pct / 100;
    component.attenuation_high_pct = vendor.attenuation_high_pct / 100;
    component.attenuation_basis = vendor.attenuation_basis;
    component.sta1 = vendor.sta1;
    component.attenuation_provenance = {
      bound: "point",
      kind: "vendor",
      vendor: "White Labs",
      url: vendor.url,
      retrieved_at: vendor.retrieved_at,
      sha256: vendor.sha256,
      note: `apparent ${vendor.attenuation_text} range; high end used as the cap`,
    };
  } else {
    // Aggregator-level citation: the scrape publishes no per-page hash or fetch
    // time, so unmatched rows keep the profile URL and the aggregator.
    component.attenuation_provenance = {
      bound: "point",
      kind: "aggregator",
      vendor: "Beer Analytics",
      note: "aggregator scrape; no per-page hash in Pass 1",
    };
    if (row.url) component.attenuation_provenance.url = row.url;
  }
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

export function buildSeed(rows, vendorEntries = []) {
  const usedSlugs = new Set();
  const vendorByStrain = new Map(
    vendorEntries.filter((entry) => entry?.strain).map((entry) => [entry.strain, entry])
  );
  const seed = {};
  for (const row of rows) {
    const component = convert(row, usedSlugs, vendorByStrain);
    if (component) seed[component.id] = component;
  }
  return Object.fromEntries(Object.keys(seed).sort().map((id) => [id, seed[id]]));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const inputPath = process.argv[2] ?? DEFAULT_INPUT;
  const rows = JSON.parse(readFileSync(inputPath, "utf8"));
  const vendor = JSON.parse(readFileSync(VENDOR_INPUT, "utf8"));
  const seed = buildSeed(rows, vendor.entries);

  writeFileSync(OUTPUT, `${JSON.stringify(seed, null, 2)}\n`);

  const enriched = Object.values(seed).filter(
    (component) => component.attenuation_provenance?.kind === "vendor"
  ).length;
  const skipped = rows.length - Object.keys(seed).length;
  console.log(`wrote ${Object.keys(seed).length} yeasts to data/seeds/yeasts.json`);
  console.log(`enriched ${enriched} with vendor attenuation ranges and STA1`);
  if (skipped) console.log(`skipped ${skipped} rows without a parseable attenuation`);
}
