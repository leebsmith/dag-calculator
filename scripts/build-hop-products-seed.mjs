// Regenerate data/seeds/hop-products.json from the curated product sources.
//
// Usage: node scripts/build-hop-products-seed.mjs [input.json] [lupulin.json]
// Defaults to data/sources/hop-products.json and
// data/sources/hop-products-lupulin.json. Percentage fields are authored as
// percentages in the curated source and stored as fractions in the seed; the
// lupulin source is authored in fractions. Every variety_id must resolve against
// data/seeds/hops.json.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULT_INPUT = fileURLToPath(
  new URL("../data/sources/hop-products.json", import.meta.url)
);
const DEFAULT_LUPULIN = fileURLToPath(
  new URL("../data/sources/hop-products-lupulin.json", import.meta.url)
);
const HOPS = fileURLToPath(new URL("../data/seeds/hops.json", import.meta.url));
const OUTPUT = fileURLToPath(new URL("../data/seeds/hop-products.json", import.meta.url));

const PERCENT_FIELDS = [
  "alpha_acid_pct",
  "alpha_acid_min_pct",
  "alpha_acid_max_pct",
  "beta_acid_pct",
  "total_oil_pct",
];

// The lupulin source names two varieties by their working names; the hop catalog
// uses the registered slug for one and the umlaut-free spelling for the other.
const VARIETY_ALIASES = {
  "hbc-586-krush": "krush",
  "huell-melon": "hull-melon",
};

// One lupulin brand per listed manufacturer: YCH sells Cryo Hops, BarthHaas
// Lupomax. A variety carried by both becomes two products with the same alpha.
const LUPULIN_BRANDS = {
  "Yakima Chief Hops": { idPrefix: "cryo", brand: "Cryo Hops" },
  BarthHaas: { idPrefix: "lupomax", brand: "Lupomax" },
};

const LUPULIN_T90_REPLACEMENT_RATIO = 2;

function sorted(seed) {
  return Object.fromEntries(Object.keys(seed).sort().map((id) => [id, seed[id]]));
}

function buildCuratedSeed(entries, hops) {
  const hopIds = new Set(Object.keys(hops));
  const used = new Set();
  const seed = {};

  for (const entry of entries) {
    if (!entry?.id || !entry?.name) {
      throw new Error("hop product entries require id and name");
    }
    if (used.has(entry.id)) {
      throw new Error(`duplicate hop product id "${entry.id}"`);
    }
    if (entry.variety_id && !hopIds.has(entry.variety_id)) {
      throw new Error(`hop product "${entry.id}" references unknown variety "${entry.variety_id}"`);
    }
    used.add(entry.id);

    const component = { ...entry };
    for (const field of PERCENT_FIELDS) {
      if (typeof component[field] === "number") component[field] /= 100;
    }
    if (!component.variety_id) delete component.variety_id;
    if (!component.url) delete component.url;
    seed[component.id] = component;
  }

  return seed;
}

function lupulinVariety(row) {
  const slug = row?.slug;
  const name = row?.["hop-name"];
  const range = row?.["lupulin-alpha-acid-range"];
  if (!slug || typeof name !== "string") {
    throw new Error("lupulin varieties require slug and hop-name");
  }
  if (!Array.isArray(range) || range.length !== 2) {
    throw new Error(`lupulin variety "${slug}" needs a two-value alpha range`);
  }
  const [min, max] = range;
  if (!(min > 0) || !(max >= min)) {
    throw new Error(`lupulin variety "${slug}" has an invalid alpha range`);
  }
  return { slug, name, min, max, manufacturers: row.manufacturer ?? [] };
}

function lupulinProduct(variety, manufacturer, brand, hopIds) {
  const varietyId = VARIETY_ALIASES[variety.slug] ?? variety.slug;
  return {
    id: `${brand.idPrefix}-${variety.slug}`,
    name: `${variety.name} ${brand.brand}`,
    manufacturer,
    brand: brand.brand,
    ...(hopIds.has(varietyId) ? { variety_id: varietyId } : {}),
    product_form: "lupulin_pellet",
    purpose: "Lupulin pellet",
    alpha_acid_pct: Number(((variety.min + variety.max) / 2).toFixed(4)),
    alpha_acid_min_pct: variety.min,
    alpha_acid_max_pct: variety.max,
    t90_replacement_ratio: LUPULIN_T90_REPLACEMENT_RATIO,
    notes:
      `Lupulin pellet; stock alpha ${Math.round(variety.min * 100)}–` +
      `${Math.round(variety.max * 100)}% (${manufacturer}). Substitute at 1:2 T-90 by weight.`,
  };
}

export function buildLupulinSeed(source, hops = {}) {
  const hopIds = new Set(Object.keys(hops));
  const seed = {};
  for (const row of source?.varieties ?? []) {
    const variety = lupulinVariety(row);
    for (const manufacturer of variety.manufacturers) {
      const brand = LUPULIN_BRANDS[manufacturer];
      if (!brand) {
        throw new Error(`lupulin variety "${variety.slug}" names unknown manufacturer "${manufacturer}"`);
      }
      const product = lupulinProduct(variety, manufacturer, brand, hopIds);
      seed[product.id] = product;
    }
  }
  return seed;
}

export function buildSeed(entries, hops = {}, lupulin = null) {
  const seed = buildCuratedSeed(entries, hops);
  if (lupulin) Object.assign(seed, buildLupulinSeed(lupulin, hops));
  return sorted(seed);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const inputPath = process.argv[2] ?? DEFAULT_INPUT;
  const lupulinPath = process.argv[3] ?? DEFAULT_LUPULIN;
  const source = JSON.parse(readFileSync(inputPath, "utf8"));
  const lupulin = JSON.parse(readFileSync(lupulinPath, "utf8"));
  const hops = JSON.parse(readFileSync(HOPS, "utf8"));
  const entries = Array.isArray(source) ? source : source.entries ?? [];
  const seed = buildSeed(entries, hops, lupulin);
  writeFileSync(OUTPUT, `${JSON.stringify(seed, null, 2)}\n`);
  console.log(`wrote ${Object.keys(seed).length} hop products to data/seeds/hop-products.json`);
}
