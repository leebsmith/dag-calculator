// Two sources rank equally often, and when they disagree the merge has to pick.
// A value that states both ends says more than one that states only a top, and
// because the centre of a max-bound value is the bound itself, preferring the
// weaker claim makes the number larger for no reason. The tie-break is within a
// rank only: an aggregator range still never displaces a vendor bound.

import test from "node:test";
import assert from "node:assert/strict";

import { RANK, buildSeed } from "../../scripts/build-hops-seed.mjs";
import { read } from "./util.js";

const seed = () => JSON.parse(read("data/seeds/hops.json"));
const facts = () => JSON.parse(read("data/sources/hop-facts.json"));

function observation(variety, sourceId, attribute, normalised) {
  return { variety_id: variety, source_id: sourceId, attribute, normalised, page_url: null };
}

function built(rows) {
  return buildSeed(
    [{ hop_name: "Test Hop" }],
    { sources: {}, observations: rows.concat([observation("Test Hop", "hga-2020", "alpha", [0.08, 0.12])]) }
  )["test-hop"];
}

test("at equal rank a two-sided value beats an upper bound", () => {
  const hop = built([
    observation("Test Hop", "barthhaas-variety", "linalool", [null, 0.016]),
    observation("Test Hop", "hopsteiner-vf", "linalool", [0.001, 0.003]),
  ]);
  assert.equal(hop.linalool_pct_of_oil, 0.002);
  assert.equal(hop.linalool_provenance.bound, "range");
  assert.deepEqual(hop.linalool_provenance.sources, ["hopsteiner-vf"]);
});

test("a worse-ranked range does not displace a better-ranked bound", () => {
  const hop = built([
    observation("Test Hop", "barthhaas-variety", "myrcene", [null, 0.5]),
    observation("Test Hop", "hopslist", "myrcene", [0.3, 0.4]),
  ]);
  assert.equal(hop.myrcene_pct_of_oil, 0.5);
  assert.equal(hop.myrcene_provenance.bound, "max");
});

test("an upper bound is still the value when nothing else publishes the field", () => {
  const hop = built([observation("Test Hop", "barthhaas-variety", "geraniol", [null, 0.004])]);
  assert.equal(hop.geraniol_pct_of_oil, 0.004);
  assert.equal(hop.geraniol_provenance.bound, "max");
});

function twoSided(row) {
  const value = row.normalised;
  if (value === null || value === undefined) return false;
  if (!Array.isArray(value)) return value > 0;
  return value[0] !== null && value[1] > 0;
}

test("no seed row takes an upper bound while an equally-ranked range exists", () => {
  const observations = facts().observations;
  const byVariety = new Map();
  for (const row of observations) {
    if (!byVariety.has(row.variety_id)) byVariety.set(row.variety_id, []);
    byVariety.get(row.variety_id).push(row);
  }
  const offenders = [];
  for (const hop of Object.values(seed())) {
    for (const attribute of ["linalool", "geraniol"]) {
      const provenance = hop[`${attribute}_provenance`];
      if (!provenance || provenance.bound !== "max") continue;
      const winnerRank = RANK[provenance.sources[0]] ?? 9;
      const better = (byVariety.get(hop.name) ?? []).filter(
        (row) =>
          row.attribute === attribute &&
          twoSided(row) &&
          (RANK[row.source_id] ?? 9) <= winnerRank
      );
      if (better.length) {
        offenders.push(`${hop.id}/${attribute}: bound taken over ${better.map((r) => r.source_id).join(", ")}`);
      }
    }
  }
  assert.deepEqual(offenders, [], "a complete range within the same rank must win");
});
