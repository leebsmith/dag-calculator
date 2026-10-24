// Regenerate data/seeds/malts.json and data/seeds/sugars.json from the vendored
// malt-database scrape.
//
// Usage: node scripts/build-fermentables-seed.mjs [input.json]
// Defaults to data/sources/malt-database-malts.json (a committed copy of the
// personal malt_database scrape; see data/sources/manifest.json).
//
// The scrape is a list of entries (name, maltster, product_type, category,
// description, notes, color_lovibond, yield_fraction, yield_basis, sold_out).
// This builder:
//   - drops sold-out entries;
//   - restores extract/syrup/sugar rows whose `yield_basis` is
//     "fermentability": the value is a sugar-point contribution (as-is yield),
//     and the fermentability is 1.0;
//   - excludes the two Maltoferm black extracts and any malt/adjunct row whose
//     basis is "fermentability" (no extract yield can be derived);
//   - routes malt + adjunct -> malts.json, sugar + syrup + extract -> sugars.json;
//   - dedupes malts one-per-name (cross-maltster), preferring records that carry
//     yield, then colour, then description, and backfills missing yield/colour
//     from sibling records of the same name;
//   - maps category ACIDULATED -> ACID;
//   - fills residual gaps with category defaults;
//   - classifies each malt against the standard-malt list (via the committed
//     crosswalk) and emits `standard_malt` + `generic_description`;
//   - slugifies names to ids and emits the flat id-keyed maps the engine expects.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULT_INPUT = fileURLToPath(
  new URL("../data/sources/malt-database-malts.json", import.meta.url)
);
const MALTS_OUTPUT = fileURLToPath(new URL("../data/seeds/malts.json", import.meta.url));
const SUGARS_OUTPUT = fileURLToPath(new URL("../data/seeds/sugars.json", import.meta.url));
const CROSSWALK_PATH = fileURLToPath(
  new URL("../data/sources/malt-standard-crosswalk.json", import.meta.url)
);
const STANDARD_LIST_PATH = fileURLToPath(
  new URL("../data/sources/standard-malts.json", import.meta.url)
);

const MALT_TYPES = new Set(["malt", "adjunct"]);
const SUGAR_TYPES = new Set(["sugar", "syrup", "extract"]);

const CATEGORY_MAP = { ACIDULATED: "ACID" };
const CATEGORY_DEFAULT_YIELD = { BASE: 0.8, CRYSTAL: 0.74, ROASTED: 0.6, ACID: 0.74 };
const CATEGORY_DEFAULT_F = { BASE: 0.81, CRYSTAL: 0.5, ROASTED: 0.15, ACID: 0.8 };
const EXCLUDED_EXTRACTS = new Set([
  "Maltoferm A-6000 Black LME",
  "Maltoferm A-6001 Black DME",
]);

const NOTES_MAX = 300;

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u00ae\u2122]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normName(value) {
  return value
    .replace(/[\u00ae\u2122]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function hasValue(v) {
  return v !== null && v !== undefined && v !== "";
}

function truncate(value, max = NOTES_MAX) {
  return value.length <= max ? value : value.slice(0, max);
}

// Prefer the record with the most complete technical profile, in priority
// order: yield, then moisture/colour, then description.
function prefer(a, b) {
  const rank = (r) =>
    (hasValue(r.yield_fraction) ? 4 : 0) +
    (hasValue(r.moisture) ? 2 : 0) +
    (hasValue(r.color_lovibond) ? 2 : 0) +
    (hasValue(r.description) ? 1 : 0);
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra > rb ? a : b;
  return a;
}

function notesFor(entry) {
  if (hasValue(entry.notes)) return entry.notes.trim();
  if (hasValue(entry.description)) return truncate(entry.description.trim());
  return "";
}

function splitByType(rows) {
  const malts = [];
  const sugars = [];
  const excluded = [];
  for (const row of rows) {
    if (row.sold_out) continue;
    if (EXCLUDED_EXTRACTS.has(row.name)) {
      excluded.push(row);
      continue;
    }
    if (row.yield_basis === "fermentability" && MALT_TYPES.has(row.product_type)) {
      excluded.push(row);
      continue;
    }
    if (MALT_TYPES.has(row.product_type)) malts.push(row);
    else if (SUGAR_TYPES.has(row.product_type)) sugars.push(row);
  }
  return { malts, sugars, excluded };
}

function dedupeMalts(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = normName(row.name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const deduped = [];
  for (const [key, group] of groups) {
    let winner = group[0];
    for (const candidate of group.slice(1)) winner = prefer(winner, candidate);

    // Backfill missing yield/colour/moisture/fermentability from sibling records
    // of the same name.
    for (const field of [
      "yield_fraction",
      "color_lovibond",
      "moisture",
      "fermentability_fraction",
    ]) {
      if (hasValue(winner[field])) continue;
      const sibling = group.find((r) => hasValue(r[field]));
      if (sibling) winner = { ...winner, [field]: sibling[field] };
    }

    deduped.push(winner);
  }
  return deduped;
}

function maltComponent(row) {
  const category = CATEGORY_MAP[row.category] ?? row.category;
  const component = {
    id: slugify(row.name),
    name: row.name.trim(),
    maltster: row.maltster,
    category,
    yield_fraction:
      row.yield_fraction ?? CATEGORY_DEFAULT_YIELD[category] ?? 0.8,
    fermentability_fraction:
      row.fermentability_fraction ?? CATEGORY_DEFAULT_F[category] ?? 0.8,
    color_lovibond: hasValue(row.color_lovibond) ? row.color_lovibond : 0,
    notes: notesFor(row),
  };
  // Datasheet moisture is a percent; 0 means "not published" (absent).
  if (hasValue(row.moisture) && row.moisture > 0) {
    component.moisture_fraction = row.moisture / 100;
  }
  return component;
}

function sugarComponent(row) {
  const component = {
    id: slugify(row.name),
    name: row.name.trim(),
    maltster: row.maltster,
    yield_fraction: row.yield_fraction ?? 0.95,
    fermentability_fraction: row.fermentability_fraction ?? 1.0,
    color_lovibond: hasValue(row.color_lovibond) ? row.color_lovibond : 0,
    notes: notesFor(row),
  };
  return component;
}

function toIdKeyedMap(components, classify, crosswalk, standardList) {
  const used = new Set();
  const seed = {};
  for (const component of components) {
    let id = component.id;
    if (used.has(id)) {
      let n = 2;
      while (used.has(`${id}-${n}`)) n += 1;
      id = `${id}-${n}`;
    }
    used.add(id);
    seed[id] = classify
      ? { ...component, id, ...standardFor(id, crosswalk, standardList) }
      : { ...component, id };
  }
  return seed;
}

function standardFor(id, crosswalk, standardList) {
  const standardId = crosswalk[id];
  if (!standardId) return {};
  const entry = standardList[standardId];
  if (!entry) return {};
  return {
    standard_malt: standardId,
    standard_name: entry.name ?? "",
    family: entry.family ?? "",
    generic_description: entry.description ?? "",
  };
}

function sorted(seed) {
  return Object.fromEntries(Object.keys(seed).sort().map((id) => [id, seed[id]]));
}

function writeSorted(path, seed) {
  writeFileSync(path, `${JSON.stringify(sorted(seed), null, 2)}\n`);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Backfill color_lovibond === 0 (a "no colour published" sentinel) from the
// malt's standard group: use the group's non-zero median when it is >= 1 L
// (real colour), keeping 0 only for genuine near-zero adjuncts (rice hulls).
function backfillColor(seed) {
  const groups = new Map();
  for (const malt of Object.values(seed)) {
    if (!malt.standard_malt) continue; // unclassified — skip (no group to borrow from)
    if (!groups.has(malt.standard_malt)) groups.set(malt.standard_malt, []);
    groups.get(malt.standard_malt).push(malt);
  }
  for (const malts of groups.values()) {
    const nonZero = malts
      .map((m) => m.color_lovibond)
      .filter((c) => typeof c === "number" && c > 0);
    if (!nonZero.length) continue;
    const value = median(nonZero);
    if (value < 1.0) continue;
    for (const malt of malts) {
      if (malt.color_lovibond === 0) malt.color_lovibond = value;
    }
  }
}

export function buildSeeds(rows, crosswalk, standardList) {
  const { malts, sugars, excluded } = splitByType(rows);

  const maltSeed = toIdKeyedMap(dedupeMalts(malts).map(maltComponent), true, crosswalk, standardList);
  const sugarSeed = toIdKeyedMap(sugars.map(sugarComponent), false, crosswalk, standardList);

  backfillColor(maltSeed);

  return { malts: sorted(maltSeed), sugars: sorted(sugarSeed), excluded: excluded.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const inputPath = process.argv[2] ?? DEFAULT_INPUT;
  const source = JSON.parse(readFileSync(inputPath, "utf8"));
  const expectedSchemaVersion = 1;
  if (source.schema_version !== expectedSchemaVersion) {
    throw new Error(
      `malt-database source has schema_version ${source.schema_version}; expected ${expectedSchemaVersion}`
    );
  }
  const crosswalk = JSON.parse(readFileSync(CROSSWALK_PATH, "utf8"));
  const standardList = JSON.parse(readFileSync(STANDARD_LIST_PATH, "utf8"));
  const { malts, sugars, excluded } = buildSeeds(source.entries, crosswalk, standardList);

  writeSorted(MALTS_OUTPUT, malts);
  writeSorted(SUGARS_OUTPUT, sugars);
  console.log(
    `wrote ${Object.keys(malts).length} malts and ${Object.keys(sugars).length} sugars; ` +
      `excluded ${excluded} rows (black extracts or malt with fermentability basis)`
  );
}
