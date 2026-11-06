import test from "node:test";
import assert from "node:assert/strict";

import {
  boilPolicyDescriptors,
  boilRowsFor,
  catalogResultLabel,
  combinedMassDisplay,
  createHopFormatters,
  draftPartsTotal,
  draftSummary,
  hopAlphaOutsideStockFor,
  hopAlphaRangeText,
  hopCatalogEntries,
  hopCatalogItemMeta,
  hopMassText,
  hopTempText,
  massTotalDisplay,
  massTotalKg,
  whirlpoolPolicyDescriptors,
  whirlpoolRowsFor,
  whirlpoolTimelineDescriptors,
} from "../../frontend/src/views/hopsLogic.js";

const ARTIFACT = {
  dimensions: {
    mass: { base_unit: "kg", kind: "linear", units: { g: { factor: 0.001 } } },
    temperature: { base_unit: "degC", kind: "linear", units: { degC: { factor: 1 } } },
  },
};

const FORMATTERS = createHopFormatters({
  artifact: ARTIFACT,
  engine: {},
  ui: { unitMode: { temperature: "degC" } },
});

const formatMassStub = (kg, unit) => `${kg} ${unit}`;
const formatNumberStub = (value, decimals) => Number(value).toFixed(decimals);

test("createHopFormatters formats mass and temperature with exact precision", () => {
  assert.equal(FORMATTERS.formatMass(0.012, "g"), "12.0 g");
  assert.equal(FORMATTERS.formatMass(null, "g"), "—");
  assert.equal(FORMATTERS.formatTemp(20), "20.0 °C");
  assert.equal(FORMATTERS.formatTemp(null), "—");
});

test("hopMassText and hopTempText delegate with the row's raw values", () => {
  assert.equal(hopMassText({ mass_kg: 0.012 }, "g", FORMATTERS.formatMass), "12.0 g");
  assert.equal(hopTempText({ initial_temp_c: 20 }, FORMATTERS.formatTemp), "20.0 °C");
  assert.equal(hopMassText(null, "g", FORMATTERS.formatMass), "—");
  assert.equal(hopTempText(null, FORMATTERS.formatTemp), "—");
});

test("hopAlphaRangeText and hopAlphaOutsideStockFor read the stock band", () => {
  const cache = {
    seeds: {
      hopProducts: {
        p1: { alpha_acid_min_pct: 0.04, alpha_acid_max_pct: 0.06 },
      },
    },
    references: { hop: {} },
  };
  assert.equal(hopAlphaRangeText(cache, { hop_id: "p1" }), "stock 4.0–6.0%");
  assert.equal(hopAlphaRangeText(cache, { hop_id: "missing" }), "");
  assert.equal(hopAlphaOutsideStockFor(cache, { hop_id: "p1", alpha_acid_pct: 0.07 }), true);
  assert.equal(hopAlphaOutsideStockFor(cache, { hop_id: "p1", alpha_acid_pct: 0.05 }), false);
});

test("boilRowsFor and whirlpoolRowsFor merge boundary results exactly", () => {
  assert.deepEqual(
    boilRowsFor({
      rows: [{ pct: 0.5, boil_time_fraction: 1 }],
      results: [{ minutes: 60, ibu: 20, mass_kg: 0.012 }],
      boilIbu: 40,
      boilTimeMin: 60,
    }),
    [{ pct: 0.5, boil_time_fraction: 1, minutes: 60, ibu: 20, mass_kg: 0.012 }]
  );
  const whirlpool = whirlpoolRowsFor({
    rows: [{ pct: 0.5, initial_temp_c: 95 }],
    results: [{ minutes: 30, ibu: 5, mass_kg: 0.012, effective_minutes: 20 }],
    whirlpoolIbu: 10,
    volume: 20,
  });
  assert.deepEqual(whirlpool, [
    {
      pct: 0.5,
      initial_temp_c: 95,
      source_index: 0,
      product_form: "t90_pellet",
      minutes: 30,
      ibu: 5,
      mass_kg: 0.012,
      effective_minutes: 20,
      dose_g_per_gal: 2.2712470704,
    },
  ]);
});

test("draft totals and summaries count additions and parts", () => {
  const rows = [{ parts: 10 }, { parts: "5" }];
  assert.equal(draftPartsTotal(rows), 15);
  assert.equal(draftPartsTotal(null), 0);
  assert.equal(draftSummary(rows), "2 additions · 15.0 parts");
  assert.equal(draftSummary([]), "0 additions · 0.0 parts");
});

test("catalogResultLabel reports the shown and filtered totals", () => {
  assert.equal(
    catalogResultLabel({ visible: 2, filtered: 5, truncated: true }),
    "Showing 2 of 5 hops — refine search or purpose filters"
  );
  assert.equal(catalogResultLabel({ visible: 2, filtered: 2, truncated: false }), "Showing 2 hops");
});

test("mass totals prefer boundary values and format the fallback sum", () => {
  assert.equal(massTotalKg([{ mass_kg: 0.01 }, { mass_kg: 0.02 }], null), 0.03);
  assert.equal(massTotalKg([{ mass_kg: 0.01 }], 0.05), 0.05);
  assert.equal(
    massTotalDisplay({
      rows: [{ mass_kg: 0.01 }, { mass_kg: 0.02 }],
      boundaryMassKg: null,
      unit: "kg",
      formatMass: formatMassStub,
    }),
    "0.03 kg"
  );
  assert.equal(
    massTotalDisplay({
      rows: [],
      boundaryMassKg: 0.05,
      unit: "kg",
      formatMass: formatMassStub,
    }),
    "0.05 kg"
  );
  assert.equal(
    massTotalDisplay({ rows: [], boundaryMassKg: null, unit: "kg", formatMass: formatMassStub }),
    "—"
  );
  assert.equal(
    combinedMassDisplay({
      boilRows: [{ mass_kg: 0.01 }],
      whirlpoolRows: [{ mass_kg: 0.02 }],
      boundaryMassKg: null,
      unit: "kg",
      formatMass: formatMassStub,
    }),
    "0.03 kg"
  );
  assert.equal(
    combinedMassDisplay({
      boilRows: [],
      whirlpoolRows: [],
      boundaryMassKg: 0.05,
      unit: "kg",
      formatMass: formatMassStub,
    }),
    "—"
  );
});

test("hopCatalogEntries and hopCatalogItemMeta map plain catalogue records", () => {
  const cache = {
    seeds: {
      hops: { a: { id: "a" } },
      hopProducts: {
        p1: { id: "p1", product_form: "t90_pellet" },
        p2: { id: "p2", product_form: "lupulin_pellet" },
      },
    },
  };
  assert.deepEqual(hopCatalogEntries(cache, "t90_pellet"), [{ id: "a" }]);
  assert.deepEqual(hopCatalogEntries(cache, "lupulin_pellet"), [
    { id: "p2", product_form: "lupulin_pellet" },
  ]);
  assert.deepEqual(
    hopCatalogItemMeta({
      product_form: "t90_pellet",
      brand: "Brand",
      alpha_acid_pct: 0.055,
      manufacturer: "Maker",
    }),
    ["Brand", "5.5% alpha", "Maker"]
  );
  assert.deepEqual(hopCatalogItemMeta({ purpose: "Aroma", alpha_acid_pct: null, origin: "US" }), [
    "Aroma",
    "alpha n/a",
    "US",
  ]);
});

test("boilPolicyDescriptors compute the warning and demand line", () => {
  const descriptors = boilPolicyDescriptors({
    formatMass: formatMassStub,
    formatNumber: formatNumberStub,
    postBoilVolume: () => 20,
    boilIbu: () => 40,
    rows: () => [{ product_form: "flowable_extract", mass_kg: 0.1 }],
    alphaMassKg: () => 0.012,
  });
  assert.equal(
    descriptors.hopDoseWarning.get(),
    "Flowable extract dose 18.93 g/gal exceeds the 4 g/gal saturation ceiling."
  );
  assert.equal(
    descriptors.hopDemandLine.get(),
    "40.0 IBU ← 600 mg/L α · 6.7% yield → 0.012 g α"
  );
});

test("whirlpoolPolicyDescriptors build bands, selection, ceiling cells, and demand", () => {
  const descriptors = whirlpoolPolicyDescriptors({
    notes: {
      b: { id: "b", name: "Band", mid_temp: 90, description: "Hot" },
      a: { id: "a", name: "Cool", mid_temp: 50, description: "Cold" },
    },
    formatTemp: (temp) => `${temp}C`,
    formatMass: formatMassStub,
    formatNumber: formatNumberStub,
    postBoilVolume: () => 20,
    whirlpoolIbu: () => 10,
    activeRow: () => ({ initial_temp_c: 90 }),
    alphaMassKg: () => 0.012,
  });
  assert.deepEqual(descriptors.whirlpoolStartBands.get(), [
    { value: "b", label: "Band (90C)", mid: 90, hint: "Hot" },
    { value: "a", label: "Cool (50C)", mid: 50, hint: "Cold" },
  ]);
  assert.equal(descriptors.whirlpoolStartBandValue.get(), "b");
  assert.equal(descriptors.whirlpoolStartBandHint.get(), "Hot");
  assert.equal(descriptors.whirlpoolCeilingMinute.value({ minute: 5 }), "5");
  assert.equal(descriptors.whirlpoolCeilingTemp.value({ tempC: 80 }), "80C");
  assert.equal(
    descriptors.whirlpoolHopDemandLine.get(),
    "10.0 IBU ← 600 mg/L α · 1.7% yield → 0.012 g α"
  );
});

test("whirlpoolTimelineDescriptors expose the timeline and advisory notes", () => {
  const descriptors = whirlpoolTimelineDescriptors({
    formatTemp: (temp) => `${temp}C`,
    formatNumber: formatNumberStub,
    readTimeline: () => ({
      segments: [],
      chills: [{ at_min: 5, from_temp_c: 90, to_temp_c: 80 }],
    }),
    reportError: () => {},
    timelineState: () => ({ chills: [{ at_min: 5, from_temp_c: 90, to_temp_c: 80 }] }),
    rows: () => [{ minutes: 0, ibu: 1 }],
  });
  assert.deepEqual(descriptors.whirlpoolTimelineState.get(), {
    segments: [],
    chills: [{ at_min: 5, from_temp_c: 90, to_temp_c: 80 }],
  });
  assert.deepEqual(descriptors.whirlpoolInferredChills.get(), [
    "Chill inferred at 5.0 min: 90C → 80C.",
  ]);
  assert.equal(
    descriptors.whirlpoolZeroRestNote.get(),
    "A 0-minute charge contributes no IBU; its mass is not computed."
  );

  const empty = whirlpoolTimelineDescriptors({
    formatTemp: (temp) => `${temp}C`,
    formatNumber: formatNumberStub,
    readTimeline: () => ({ segments: null, chills: [] }),
    reportError: () => {},
    timelineState: () => null,
    rows: () => [],
  });
  assert.equal(empty.whirlpoolTimelineState.get(), null);
  assert.deepEqual(empty.whirlpoolInferredChills.get(), []);
  assert.equal(empty.whirlpoolZeroRestNote.get(), "");
});
