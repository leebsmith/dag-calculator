// Regenerate data/seeds/hops.json from the scraper's catalogue and the
// committed vendor facts.
//
// Usage: node scripts/build-hops-seed.mjs
//
// The scrape supplies identity and popularity; the facts supply measurement.
// Synthesis rules, in order: resolve identity, drop a hard zero another source
// contradicts, rank the sources, take the mean of bounds where at least three
// usable sources exist and precedence otherwise, and mark the result with the
// basis it has. The tail keeps the scraped alpha and says it is an aggregator
// figure — a hop without alpha would disable the IBU solve rather than report
// an unknown.
//
// Nothing here writes a provenance-free measurement: every synthesised field
// carries the sources it came from and the merge that produced it.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SCRAPE = fileURLToPath(new URL("../data/sources/beer-analytics-hops.json", import.meta.url));
const FACTS = fileURLToPath(new URL("../data/sources/hop-facts.json", import.meta.url));
const OUTPUT = fileURLToPath(new URL("../data/seeds/hops.json", import.meta.url));

const AGGREGATOR = "hopslist";

const RANK = {
  "hga-2020": 0,
  "hga-2017": 1,
  "haas-sheet": 2,
  "usda-varieties": 2,
  "barthhaas-sheet": 2,
  "hopsteiner-vf": 3,
  "barthhaas-variety": 3,
  "crosby-variety": 4,
  "hpa-catalogue": 4,
  "nzhops-products": 4,
  hopslist: 5,
};

const LABEL = {
  "hga-2020": "USA Hops 2020",
  "hga-2017": "USA Hops 2017",
  "haas-sheet": "John I. Haas",
  "usda-varieties": "USDA / OSU",
  "barthhaas-sheet": "BarthHaas",
  "hopsteiner-vf": "Hopsteiner",
  "barthhaas-variety": "BarthHaas",
  "crosby-variety": "Crosby Hops",
  "hpa-catalogue": "Hop Products Australia",
  "nzhops-products": "NZ Hops",
  hopslist: "Hopslist",
  "usda-cultivars": "USDA",
};

const GROUPS = [
  { attribute: "alpha", bounds: ["alpha_acid_min_pct", "alpha_acid_max_pct"], centre: "alpha_acid_pct", provenance: "alpha_provenance" },
  { attribute: "beta", bounds: ["beta_acid_min_pct", "beta_acid_max_pct"], centre: "beta_acid_pct", provenance: "beta_provenance" },
  { attribute: "total_oil", centre: "total_oil_ml_per_100g", provenance: "oil_provenance" },
  { attribute: "cohumulone", centre: "cohumulone_pct_of_alpha", provenance: "oil_provenance" },
  { attribute: "myrcene", centre: "myrcene_pct_of_oil", provenance: "oil_provenance" },
  { attribute: "humulene", centre: "humulene_pct_of_oil", provenance: "oil_provenance" },
  { attribute: "caryophyllene", centre: "caryophyllene_pct_of_oil", provenance: "oil_provenance" },
  { attribute: "farnesene", centre: "farnesene_pct_of_oil", provenance: "oil_provenance" },
  { attribute: "linalool", centre: "linalool_pct_of_oil", provenance: "oil_provenance" },
];

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const round = (value, places = 4) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

function asRange(observation) {
  const value = observation.normalised;
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return { low: value[0], high: value[1] };
  return { low: value, high: value };
}

function groupObservations(facts) {
  const byVariety = new Map();
  for (const row of facts.observations) {
    if (!byVariety.has(row.variety_id)) byVariety.set(row.variety_id, []);
    byVariety.get(row.variety_id).push(row);
  }
  return byVariety;
}

function dedupe(rows) {
  const seen = new Map();
  for (const row of rows) {
    const key = `${row.source_id}/${row.attribute}`;
    if (!seen.has(key)) seen.set(key, row);
  }
  return [...seen.values()];
}

// A hard zero means "no value" in some payloads and "genuinely none" in others.
// Alpha, beta, oil and co-humulone cannot be zero for a hop that is sold for
// bitterness, so a zero there is a placeholder and never a measurement. The oil
// fractions are different: a variety really can carry almost no farnesene, so a
// zero stands unless another source contradicts it.
const ZERO_IS_PLAUSIBLE = new Set(["myrcene", "humulene", "caryophyllene", "farnesene", "linalool"]);

function dropContradictedZeros(rows) {
  const peak = new Map();
  for (const row of rows) {
    const range = asRange(row);
    if (!range) continue;
    const high = Math.max(range.low ?? 0, range.high ?? 0);
    peak.set(row.attribute, Math.max(peak.get(row.attribute) ?? 0, high));
  }
  return rows.filter((row) => {
    const range = asRange(row);
    if (!range) return false;
    const high = Math.max(range.low ?? 0, range.high ?? 0);
    if (high !== 0) return true;
    return ZERO_IS_PLAUSIBLE.has(row.attribute) && (peak.get(row.attribute) ?? 0) === 0;
  });
}

function contributorsOf(rows) {
  return rows
    .filter((row) => row.source_id !== AGGREGATOR)
    .map((row) => ({ row, range: asRange(row) }))
    .filter(({ range }) => range && range.low !== null && range.high !== null);
}

function dispersionOf(entries) {
  if (entries.length < 2) return 0;
  const mids = entries.map(({ range }) => (range.low + range.high) / 2);
  const mean = mids.reduce((sum, value) => sum + value, 0) / mids.length;
  if (mean === 0) return 0;
  const variance = mids.reduce((sum, value) => sum + (value - mean) ** 2, 0) / mids.length;
  return round(Math.sqrt(variance) / mean, 3);
}

function meanOfBounds(entries) {
  const low = entries.reduce((sum, { range }) => sum + range.low, 0) / entries.length;
  const high = entries.reduce((sum, { range }) => sum + range.high, 0) / entries.length;
  return { low: round(low), high: round(high) };
}

function byPrecedence(rows) {
  return [...rows].sort((a, b) => {
    const rank = (RANK[a.source_id] ?? 9) - (RANK[b.source_id] ?? 9);
    return rank !== 0 ? rank : a.source_id.localeCompare(b.source_id);
  })[0];
}

function provenanceFor({ winner, rows, merge, dispersion, range, sourceUrls }) {
  const sources = [...new Set(rows.map((row) => row.source_id))];
  return {
    kind: winner.source_id === AGGREGATOR ? "aggregator" : RANK[winner.source_id] <= 1 ? "survey" : "vendor",
    bound: range.low === null ? "max" : range.low === range.high ? "point" : "range",
    merge,
    sources,
    sources_count: sources.length,
    vendor: LABEL[winner.source_id] ?? winner.source_id,
    url: winner.page_url ?? sourceUrls[winner.source_id] ?? null,
    range: range.low === null ? [null, range.high] : [range.low, range.high],
    ...(dispersion ? { dispersion } : {}),
    ...(winner.crop_years ? { crop_years: winner.crop_years } : {}),
  };
}

function synthesize(rows, sourceUrls) {
  const cleaned = dropContradictedZeros(dedupe(rows));
  const result = {};
  for (const group of GROUPS) {
    const candidates = cleaned.filter((row) => row.attribute === group.attribute);
    if (!candidates.length) continue;
    const contributors = contributorsOf(candidates);
    const useMean = contributors.length >= 3;
    const winner = useMean ? byPrecedence(contributors.map(({ row }) => row)) : byPrecedence(candidates);
    const range = useMean ? meanOfBounds(contributors) : asRange(winner);
    if (!range) continue;
    const pool = useMean ? contributors.map(({ row }) => row) : [winner];
    const centre = range.low === null ? range.high : round((range.low + range.high) / 2);
    result[group.centre] = centre;
    if (group.bounds && range.low !== null) {
      result[group.bounds[0]] = range.low;
      result[group.bounds[1]] = range.high;
    }
    result[group.provenance] = provenanceFor({
      winner,
      rows: pool,
      merge: useMean ? "mean_range" : "precedence",
      dispersion: dispersionOf(contributors),
      range,
      sourceUrls,
    });
  }
  return result;
}

function identityOf(row) {
  const component = { id: slugify(row.hop_name.trim()), name: row.hop_name.trim() };
  for (const [field, key] of [
    ["synonym", "hop_synonym"],
    ["category", "breadcrumb_category"],
    ["purpose", "purpose"],
    ["origin", "origin"],
    ["alpha_rating", "alpha_rating"],
  ]) {
    if (row[key]) component[field] = row[key];
  }
  if (Number.isInteger(row.recipes_count)) component.recipes_count = row.recipes_count;
  return component;
}

function measurementsOf(component, row) {
  const chars = row.characteristics ?? {};
  const alpha = chars.alpha_acid_range ?? {};
  const beta = chars.beta_acid_range ?? {};
  if (typeof alpha.median === "number") component.alpha_acid_pct = alpha.median / 100;
  if (typeof alpha.min === "number") component.alpha_acid_min_pct = alpha.min / 100;
  if (typeof alpha.max === "number") component.alpha_acid_max_pct = alpha.max / 100;
  if (typeof beta.median === "number") component.beta_acid_pct = beta.median / 100;
  return component;
}

function descriptorsOf(component, row) {
  if (Array.isArray(row.pairings) && row.pairings.length) component.pairings = row.pairings.join(", ");
  if (Array.isArray(row.flavor_profiles) && row.flavor_profiles.length) {
    component.flavor_profiles = row.flavor_profiles.join(", ");
  }
  return component;
}

function fromScrape(row) {
  const component = descriptorsOf(measurementsOf(identityOf(row), row), row);
  const category = slugify((row.breadcrumb_category ?? "").replace(/\bhops?\b/gi, "").trim());
  if (category) component.url = `https://www.beer-analytics.com/hops/${category}/${component.id}/`;
  component.alpha_provenance = {
    kind: "aggregator",
    bound: "point",
    sources: ["beer-analytics-hops"],
    sources_count: 1,
    vendor: "Beer Analytics",
    url: component.url ?? null,
    note: "crowd mean of brewers' entries; no vendor sheet in the source set",
    ...(Number.isInteger(row.recipes_count) ? { recipes_count: row.recipes_count } : {}),
  };
  return component;
}

function mergeFacts(component, factsForName, sourceUrls) {
  if (!factsForName) return component;
  const synthesized = synthesize(factsForName, sourceUrls);
  const merged = { ...component, ...synthesized };
  const alpha = synthesized.alpha_provenance;
  if (alpha && alpha.url) merged.url = alpha.url;
  return merged;
}

function vendorOnly(name, factsForName, sourceUrls) {
  const synthesized = synthesize(factsForName, sourceUrls);
  if (!synthesized.alpha_acid_pct) return null;
  const component = { id: slugify(name), name };
  const merged = { ...component, ...synthesized };
  if (synthesized.alpha_provenance?.url) merged.url = synthesized.alpha_provenance.url;
  return merged;
}

export function buildSeed(rows, facts) {
  const byVariety = groupObservations(facts ?? { observations: [] });
  const sourceUrls = Object.fromEntries(
    Object.entries(facts?.sources ?? {}).map(([id, source]) => [id, source.url ?? null])
  );
  const usedSlugs = new Set();
  const seed = {};

  for (const row of rows) {
    const name = (row.hop_name ?? "").trim();
    if (!name) continue;
    const component = fromScrape(row);
    if (!component) continue;
    const merged = mergeFacts(component, byVariety.get(name), sourceUrls);
    let id = merged.id;
    if (usedSlugs.has(id)) {
      let n = 2;
      while (usedSlugs.has(`${id}-${n}`)) n += 1;
      id = `${id}-${n}`;
      merged.id = id;
    }
    usedSlugs.add(id);
    seed[id] = merged;
  }

  for (const [name, observations] of byVariety) {
    if (seed[slugify(name)]) continue;
    const row = vendorOnly(name, observations, sourceUrls);
    if (!row || usedSlugs.has(row.id)) continue;
    usedSlugs.add(row.id);
    seed[row.id] = row;
  }

  return Object.fromEntries(
    Object.keys(seed)
      .sort()
      .map((id) => [id, seed[id]])
  );
}

function load(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const seed = buildSeed(load(SCRAPE), load(FACTS));
  writeFileSync(OUTPUT, `${JSON.stringify(seed, null, 2)}\n`);
  console.log(`wrote ${Object.keys(seed).length} hops to data/seeds/hops.json`);
}
