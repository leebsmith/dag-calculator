// Regenerate data/seeds/standard-malts.json: one generic representative per
// used standard-malt class, derived from the producer malts in data/seeds/malts.json.
//
// Each representative is a median of its class's members (yield + colour), with
// a category from the member majority (family fallback on a tie). The result is
// the neutral "generic" default set; ids are `std:<standard-id>` and never
// collide with producer ids. Re-run after any malts.json change — a guard
// (tests/guards/standard-malts.test.js) fails if this file goes stale.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MALTS = fileURLToPath(new URL("../data/seeds/malts.json", import.meta.url));
const OUT = fileURLToPath(new URL("../data/seeds/standard-malts.json", import.meta.url));

const FAMILY_CATEGORY = {
  acidulated: "ACID",
  crystal: "CRYSTAL",
  dextrin: "CRYSTAL",
  roasted: "ROASTED",
  dehusked: "ROASTED",
  toasted: "ROASTED",
};

export function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Strict-majority category over the members; null on a tie.
export function majorityCategory(malts) {
  const counts = new Map();
  for (const m of malts) counts.set(m.category, (counts.get(m.category) ?? 0) + 1);
  let best = null;
  let bestN = 0;
  for (const [cat, n] of counts) {
    if (n > bestN) {
      best = cat;
      bestN = n;
    }
  }
  return bestN * 2 > malts.length ? best : null;
}

export function buildStandardMalts(malts) {
  const groups = new Map();
  for (const m of Object.values(malts)) {
    if (!groups.has(m.standard_malt)) groups.set(m.standard_malt, []);
    groups.get(m.standard_malt).push(m);
  }

  const reps = {};
  for (const [stdId, ms] of groups) {
    const first = ms[0];
    const category = majorityCategory(ms) ?? FAMILY_CATEGORY[first.family] ?? "BASE";
    reps[`std:${stdId}`] = {
      id: `std:${stdId}`,
      name: first.standard_name,
      maltster: "Generic",
      category,
      yield_fraction: median(ms.map((m) => m.yield_fraction).filter((n) => typeof n === "number")),
      color_lovibond: median(ms.map((m) => m.color_lovibond).filter((n) => typeof n === "number")),
      notes: first.generic_description,
      standard_malt: stdId,
      standard_name: first.standard_name,
      family: first.family,
      generic_description: first.generic_description,
    };
  }
  return reps;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const malts = JSON.parse(readFileSync(MALTS, "utf8"));
  const reps = buildStandardMalts(malts);
  const sorted = Object.fromEntries(Object.keys(reps).sort().map((id) => [id, reps[id]]));
  writeFileSync(OUT, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`wrote ${Object.keys(sorted).length} standard-malt representatives`);
}
