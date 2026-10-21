import test from "node:test";
import assert from "node:assert/strict";

import { buildSeed as buildHops } from "../../scripts/build-hops-seed.mjs";
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
  assert.deepEqual(buildYeasts(json("data/sources/beer-analytics-yeasts.json")), json("data/seeds/yeasts.json"));
});

test("A9: hops seed is a pure rebuild of its source", () => {
  assert.deepEqual(buildHops(json("data/sources/beer-analytics-hops.json")), json("data/seeds/hops.json"));
});

test("A9: fermentable seeds rebuild from the scrape and the crosswalk", () => {
  const { entries } = json("data/sources/malt-database-malts.json");
  const crosswalk = json("data/sources/malt-standard-crosswalk.json");
  const standardList = json("data/sources/standard-malts.json");

  const { malts, sugars } = buildFermentables(entries, crosswalk, standardList);

  assert.deepEqual(malts, json("data/seeds/malts.json"));
  assert.deepEqual(sugars, json("data/seeds/sugars.json"));
});
