import test from "node:test";
import assert from "node:assert/strict";

import {
  doseRows,
  fmtDelta,
  fmtL,
  fmtPpm,
  ionDelta,
  optionLabelFor,
  severityRank,
  waterTargetOptionsOf,
} from "../../frontend/src/views/waterLogic.js";

test("ionDelta subtracts numeric targets and rejects missing sides", () => {
  assert.equal(ionDelta(10, 6), 4);
  assert.equal(ionDelta(0, 5), -5);
  assert.equal(ionDelta(null, 6), null);
  assert.equal(ionDelta(10, undefined), null);
});

test("optionLabelFor resolves registry labels and falls back to the raw value", () => {
  assert.equal(optionLabelFor("batch.boil_hops.product_form", "t90_pellet"), "T-90 pellet");
  assert.equal(optionLabelFor("missing.field", "raw"), "raw");
});

test("doseRows maps positive additions and reports suppressed zero rows", () => {
  const fields = {
    "solver.water.mash_additions.gypsum_kg": { value: 0.012, display: 12, unit: "g" },
    "solver.water.mash_additions.acid_l": { value: 0.001, display: 1, unit: "ml" },
    "solver.water.mash_additions.chalk_kg": { value: 0.02, display: 0, unit: "g" },
  };
  assert.deepEqual(
    doseRows(fields, "solver.water.mash_additions", {
      gypsum: "anhydrous",
      cacl2: "dihydrate",
      acid: "lactic",
    }),
    {
      rows: [
        { key: "gypsum_kg", label: "gypsum (anhydrous)", text: "12 g" },
        { key: "acid_l", label: "lactic", text: "1 ml" },
      ],
      suppressed: true,
    }
  );
});

test("doseRows returns no rows without mutating the field index", () => {
  const fields = {
    "solver.water.mash_additions.gypsum_kg": { value: 0, display: 0, unit: "g" },
  };
  const before = structuredClone(fields);
  assert.deepEqual(
    doseRows(fields, "solver.water.mash_additions", {
      gypsum: "anhydrous",
      cacl2: "dihydrate",
      acid: "lactic",
    }),
    { rows: [], suppressed: false }
  );
  assert.deepEqual(fields, before);
});

test("formatters render exact fixed-precision strings", () => {
  assert.equal(fmtL(2), "2 L");
  assert.equal(fmtL(1.234), "1.234 L");
  assert.equal(fmtL(null), "—");
  assert.equal(fmtPpm(12.345), "12.3");
  assert.equal(fmtPpm(null), "—");
  assert.equal(fmtDelta(2.5), "+2.5");
  assert.equal(fmtDelta(-2.5), "-2.5");
  assert.equal(fmtDelta(0), "0.0");
  assert.equal(fmtDelta(null), "—");
});

test("severityRank orders known severities and defaults unknown ones to zero", () => {
  assert.equal(severityRank("ERROR"), 3);
  assert.equal(severityRank("WARNING"), 2);
  assert.equal(severityRank("NOTE"), 1);
  assert.equal(severityRank("INFO"), 0);
  assert.equal(severityRank("unknown"), 0);
});

test("waterTargetOptionsOf builds sorted preset options without mutating the cache", () => {
  const cache = {
    references: {
      water_target: {
        soft: {
          name: "Soft",
          calcium_ca: 1,
          magnesium_mg: 2,
          sodium_na: 3,
          sulfate_so4: 4,
          chloride_cl: 5,
          alkalinity_as_caco3: 6,
        },
        hoppy: { name: "Hoppy", sulfate_so4: 4, chloride_cl: 5 },
        empty: { name: "Empty", calcium_ca: null },
      },
    },
  };
  const before = structuredClone(cache);
  assert.deepEqual(waterTargetOptionsOf(cache), [
    { value: "none", label: "No targets — no ion targets" },
    { value: "hoppy", label: "SO₄/Cl — Hoppy" },
    { value: "soft", label: "All six — Soft" },
    { value: "freeform", label: "Freeform entry — compose your own set" },
  ]);
  assert.deepEqual(cache, before);
});
