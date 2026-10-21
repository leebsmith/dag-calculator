// Standard-malt representative guard: the committed representative set must be
// the exact derived output of build-standard-malts-seed.mjs over the current
// malts.json, so a re-import that shifts the seed fails loudly until the set is
// regenerated. Also asserts ids resolve to known standards and categories are
// valid.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildStandardMalts } from "../../scripts/build-standard-malts-seed.mjs";

function read(rel) {
  return JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
}

const malts = read("../../data/seeds/malts.json");
const committed = read("../../data/seeds/standard-malts.json");
const standards = read("../../data/sources/standard-malts.json");

const CATEGORIES = new Set(["BASE", "CRYSTAL", "ROASTED", "ACID"]);

test("representative set is not stale (equals the derived medians)", () => {
  assert.deepEqual(committed, buildStandardMalts(malts), "re-run scripts/build-standard-malts-seed.mjs");
});

test("every representative id maps to a known standard and a valid category", () => {
  for (const [id, rep] of Object.entries(committed)) {
    assert.ok(id.startsWith("std:"), `${id} is not std:-prefixed`);
    assert.ok(standards[rep.standard_malt], `${id} -> unknown standard "${rep.standard_malt}"`);
    assert.ok(CATEGORIES.has(rep.category), `${id} has invalid category "${rep.category}"`);
  }
});
