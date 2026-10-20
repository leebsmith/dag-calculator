// Crosswalk coverage guard: every seed malt is classified, and the seed's
// embedded standard_malt/generic_description agree with the committed crosswalk
// + standard list (the builder must be re-run after either source changes).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function read(rel) {
  return JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
}

const malts = read("../../data/seeds/malts.json");
const crosswalk = read("../../data/sources/malt-standard-crosswalk.json");
const standards = read("../../data/sources/standard-malts.json");

test("malt-standard crosswalk covers every seed malt (bidirectional)", () => {
  const seedIds = Object.keys(malts).sort();
  const cwIds = Object.keys(crosswalk).sort();
  assert.deepEqual(cwIds, seedIds, "crosswalk slugs must match the seed malts exactly");
});

test("every crosswalk target is a known standard id", () => {
  for (const [slug, standardId] of Object.entries(crosswalk)) {
    assert.ok(standards[standardId], `${slug} -> unknown standard "${standardId}"`);
  }
});

test("seed carries standard_malt + generic_description agreeing with the crosswalk", () => {
  for (const [slug, malt] of Object.entries(malts)) {
    assert.equal(
      malt.standard_malt,
      crosswalk[slug],
      `${slug}.standard_malt disagrees with the crosswalk — re-run build-fermentables-seed.mjs`
    );
    const standard = standards[crosswalk[slug]];
    assert.equal(
      malt.generic_description,
      standard.description,
      `${slug}.generic_description disagrees with the standard list`
    );
    assert.equal(
      malt.standard_name,
      standard.name,
      `${slug}.standard_name disagrees with the standard list — re-run build-fermentables-seed.mjs`
    );
    assert.equal(
      malt.family,
      standard.family,
      `${slug}.family disagrees with the standard list — re-run build-fermentables-seed.mjs`
    );
  }
});
