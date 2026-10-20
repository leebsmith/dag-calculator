import test from "node:test";
import assert from "node:assert/strict";

import { buildStandardMalts, majorityCategory, median } from "../../scripts/build-standard-malts-seed.mjs";

test("median handles odd and even counts", () => {
  assert.equal(median([1, 3, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), 0);
});

test("majorityCategory returns strict majority or null", () => {
  const m = (cat) => ({ category: cat });
  assert.equal(majorityCategory([m("BASE"), m("BASE"), m("ROASTED")]), "BASE");
  assert.equal(majorityCategory([m("BASE"), m("ROASTED")]), null);
});

test("buildStandardMalts derives medians, majority category, and tie fallback", () => {
  const malts = {
    a1: { id: "a1", name: "A one", standard_malt: "pale", standard_name: "Pale", family: "base", generic_description: "d", category: "BASE", yield_fraction: 0.80, color_lovibond: 2.0 },
    a2: { id: "a2", name: "A two", standard_malt: "pale", standard_name: "Pale", family: "base", generic_description: "d", category: "BASE", yield_fraction: 0.82, color_lovibond: 3.0 },
    b1: { id: "b1", name: "B one", standard_malt: "aroma", standard_name: "Aroma", family: "kilned", generic_description: "x", category: "BASE", yield_fraction: 0.75, color_lovibond: 20 },
    b2: { id: "b2", name: "B two", standard_malt: "aroma", standard_name: "Aroma", family: "kilned", generic_description: "x", category: "ROASTED", yield_fraction: 0.77, color_lovibond: 22 },
  };

  const reps = buildStandardMalts(malts);
  assert.equal(reps["std:pale"].yield_fraction, 0.81);
  assert.equal(reps["std:pale"].color_lovibond, 2.5);
  assert.equal(reps["std:pale"].category, "BASE");

  // tie on category -> family fallback (kilned -> BASE)
  assert.equal(reps["std:aroma"].category, "BASE");
  assert.equal(reps["std:aroma"].yield_fraction, 0.76);
});
