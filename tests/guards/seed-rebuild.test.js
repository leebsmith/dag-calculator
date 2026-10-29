import test from "node:test";
import assert from "node:assert/strict";

import { buildSeed as buildHops } from "../../scripts/build-hops-seed.mjs";
import { buildSeed as buildHopProducts } from "../../scripts/build-hop-products-seed.mjs";
import { buildSeed as buildWhirlpoolNotes } from "../../scripts/build-whirlpool-notes-seed.mjs";
import { buildSeed as buildYeasts } from "../../scripts/build-yeasts-seed.mjs";
import { buildSeed as buildStyles } from "../../scripts/build-styles-seed.mjs";
import { buildSeeds as buildFermentables } from "../../scripts/build-fermentables-seed.mjs";
import { read } from "./util.js";

function json(path) {
  return JSON.parse(read(path));
}

test("A9: styles seed is a pure rebuild of its source", () => {
  assert.deepEqual(buildStyles(json("data/sources/bjcp_styles_2021.json")), json("data/seeds/styles.json"));
});

test("A9: yeasts seed is a pure rebuild of its source", () => {
  const vendor = json("data/sources/whitelabs-yeasts.json").entries;
  assert.deepEqual(
    buildYeasts(json("data/sources/beer-analytics-yeasts.json"), vendor),
    json("data/seeds/yeasts.json")
  );
});

test("A9: hops seed is a pure rebuild of its source", () => {
  assert.deepEqual(buildHops(json("data/sources/beer-analytics-hops.json")), json("data/seeds/hops.json"));
});

test("A9: hop products seed is a pure rebuild of its sources", () => {
  const source = json("data/sources/hop-products.json");
  const lupulin = json("data/sources/hop-products-lupulin.json");
  const hops = json("data/seeds/hops.json");
  assert.deepEqual(
    buildHopProducts(source.entries, hops, lupulin),
    json("data/seeds/hop-products.json")
  );
});

test("A9: whirlpool notes seed is a pure rebuild of its source", () => {
  assert.deepEqual(
    buildWhirlpoolNotes(json("data/sources/whirlpool-notes.json")),
    json("data/seeds/whirlpool-notes.json")
  );
});

test("A9: fermentable seeds rebuild from the scrape and the crosswalk", () => {
  const { entries } = json("data/sources/malt-database-malts.json");
  const crosswalk = json("data/sources/malt-standard-crosswalk.json");
  const standardList = json("data/sources/standard-malts.json");

  const { malts, sugars } = buildFermentables(entries, crosswalk, standardList);

  assert.deepEqual(malts, json("data/seeds/malts.json"));
  assert.deepEqual(sugars, json("data/seeds/sugars.json"));
});

test("a source without a fermentability figure stays null in the seed", () => {
  const rows = [
    {
      name: "Plain Malt",
      maltster: "Test",
      product_type: "malt",
      category: "BASE",
      yield_fraction: 0.8,
      color_lovibond: 2,
    },
  ];

  const { malts } = buildFermentables(rows, {}, {});
  assert.equal(malts["plain-malt"].fermentability_fraction, null);
  assert.equal(malts["plain-malt"].fermentability_provenance, undefined);
});

test("fermentability-basis extracts store the published figure as fermentability", () => {
  const rows = [
    {
      name: "Test Dry Extract",
      maltster: "Test",
      product_type: "extract",
      yield_fraction: 0.75,
      yield_basis: "fermentability",
      yield_provenance: {
        bound: "point",
        kind: "vendor",
        vendor: "Test",
        url: "https://example.invalid/dry",
        retrieved_at: "2026-01-01T00:00:00Z",
        sha256: "0".repeat(64),
      },
      color_lovibond: 3,
    },
    {
      name: "Maltoferm A-6000 Black LME",
      maltster: "Test",
      product_type: "extract",
      yield_fraction: 0.32,
      yield_basis: "fermentability",
      color_lovibond: 500,
    },
    {
      name: "Test Fermentability Malt",
      maltster: "Test",
      product_type: "malt",
      category: "BASE",
      yield_fraction: 0.8,
      yield_basis: "fermentability",
      color_lovibond: 2,
    },
  ];

  const { sugars, malts, excluded } = buildFermentables(rows, {}, {});
  assert.equal(excluded, 2);
  const extract = sugars["test-dry-extract"];
  assert.equal(extract.yield_fraction, null, "a fermentability figure is not an extract");
  assert.equal(extract.fermentability_fraction, 0.75);
  assert.equal(extract.yield_basis, undefined);
  assert.equal(extract.fermentability_provenance.sha256, "0".repeat(64));
  assert.equal(sugars["maltoferm-a-6000-black-lme"], undefined);
  assert.equal(malts["test-fermentability-malt"], undefined);
});

test("a row with both axes keeps extract yield and fermentability", () => {
  const rows = [
    {
      name: "Test Dual Basis",
      maltster: "Test",
      product_type: "extract",
      yield_fraction: 0.8,
      yield_basis: "extract",
      fermentability_fraction: 0.75,
      color_lovibond: 3,
    },
  ];

  const { sugars } = buildFermentables(rows, {}, {});
  assert.equal(sugars["test-dual-basis"].yield_fraction, 0.8);
  assert.equal(sugars["test-dual-basis"].fermentability_fraction, 0.75);
});

// --- Vendor yeast ranges and STA1 ----------------------------------------

const AGGREGATOR_ROW = {
  title: "White Labs · Test Ale WLP999",
  url: "https://www.beer-analytics.com/yeasts/ale/test/",
  form: "Liquid",
  attenuation: "70.0%",
  flocculation: "Medium",
  tolerance: "10.0%",
  temperature: "18.0 – 21.0°C",
  recipes: "3",
};

function vendorEntry(overrides = {}) {
  return {
    strain: "WLP999",
    name: "Test Ale Yeast",
    attenuation_text: "72% - 80%",
    attenuation_low_pct: 72,
    attenuation_high_pct: 80,
    attenuation_basis: "apparent",
    sta1: false,
    url: "https://www.whitelabs.com/yeast-single?id=999&type=YEAST",
    retrieved_at: "2026-01-01T00:00:00Z",
    sha256: "1".repeat(64),
    ...overrides,
  };
}

test("a vendor range stores both ends and uses the high end as the cap", () => {
  const seed = buildYeasts([AGGREGATOR_ROW], [vendorEntry()]);
  const strain = seed["white-labs-test-ale-wlp999"];

  assert.equal(strain.attenuation_low_pct, 0.72);
  assert.equal(strain.attenuation_high_pct, 0.8);
  assert.equal(strain.attenuation_pct, 0.8, "the cap is the high end (A14)");
  assert.equal(strain.attenuation_basis, "apparent");
  assert.equal(strain.attenuation_provenance.kind, "vendor");
  assert.equal(strain.attenuation_provenance.sha256, "1".repeat(64));
  assert.equal(strain.attenuation_provenance.url, vendorEntry().url);
});

test("STA1 is carried tri-state", () => {
  for (const [sta1, expected] of [
    [true, true],
    [false, false],
    [null, null],
  ]) {
    const seed = buildYeasts([AGGREGATOR_ROW], [vendorEntry({ sta1 })]);
    assert.equal(seed["white-labs-test-ale-wlp999"].sta1, expected);
  }
});

test("an unmatched strain keeps the aggregator citation", () => {
  const seed = buildYeasts([AGGREGATOR_ROW], [
    vendorEntry({ strain: "WLP000", name: "Other" }),
  ]);
  const strain = seed["white-labs-test-ale-wlp999"];

  assert.equal(strain.attenuation_provenance.kind, "aggregator");
  assert.equal(strain.sta1, undefined);
  assert.equal(strain.attenuation_pct, 0.7);
});
