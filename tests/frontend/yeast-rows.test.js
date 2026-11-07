import test from "node:test";
import assert from "node:assert/strict";

import {
  attenuationBandLabel,
  attenuationLabel,
  attenuationTier,
  diastaticusTier,
  diastaticusTiers,
  isYeastListTruncated,
  percentText,
  pofLabel,
  pofTier,
  pofTiers,
  sta1Label,
  temperatureRangeLabel,
  YEAST_ATTENUATION_TIERS,
  YEAST_ROW_LIMIT,
  yeastResultLabel,
} from "../../frontend/src/views/producer/yeastRows.js";

test("attenuationLabel prints one decimal and blanks a missing strain", () => {
  assert.equal(attenuationLabel({ attenuation_pct: 0.755 }), "75.5%");
  assert.equal(attenuationLabel({ attenuation_pct: 0.8 }), "80%");
  assert.equal(attenuationLabel(null), "");
  assert.equal(attenuationLabel(undefined), "");
  assert.equal(percentText(0.705), "70.5");
});

test("attenuationBandLabel prints the vendor band only when both ends exist", () => {
  assert.equal(
    attenuationBandLabel({ attenuation_low_pct: 0.82, attenuation_high_pct: 0.86 }),
    "82–86%"
  );
  assert.equal(attenuationBandLabel({ attenuation_low_pct: 0.82 }), "");
  assert.equal(attenuationBandLabel({ attenuation_pct: 0.8 }), "");
  assert.equal(attenuationBandLabel(null), "");
});

test("sta1Label keeps the unpublished result as its own marker", () => {
  assert.equal(sta1Label({ sta1: true }), "STA1+");
  assert.equal(sta1Label({ sta1: false }), "STA1−");
  assert.equal(sta1Label({}), "STA1?");
  assert.equal(sta1Label(null), "STA1?");
});

test("attenuationTier follows the published band edges", () => {
  assert.equal(attenuationTier(0.7), "low");
  assert.equal(attenuationTier(0.705), "medium");
  assert.equal(attenuationTier(0.754), "medium");
  assert.equal(attenuationTier(0.755), "high");
  assert.equal(attenuationTier(0.824), "high");
  assert.equal(attenuationTier(0.825), "super");
  assert.equal(attenuationTier(undefined), "");
});

test("diastaticusTier keeps the unpublished STA1 result as its own bucket", () => {
  assert.equal(diastaticusTier({ sta1: true }), "positive");
  assert.equal(diastaticusTier({ sta1: false }), "negative");
  assert.equal(diastaticusTier({}), "unknown");
  assert.equal(diastaticusTier(null), "unknown");
});

test("diastaticusTiers labels every bucket and counts the catalogue", () => {
  const tiers = diastaticusTiers([
    { sta1: true },
    { sta1: false },
    { sta1: false },
    {},
    { sta1: undefined },
  ]);

  assert.deepEqual(tiers, [
    { key: "positive", label: "Diastaticus", count: 1 },
    { key: "negative", label: "Non-diastaticus", count: 2 },
    { key: "unknown", label: "Unknown", count: 2 },
  ]);
  assert.deepEqual(diastaticusTiers([]), [
    { key: "positive", label: "Diastaticus", count: 0 },
    { key: "negative", label: "Non-diastaticus", count: 0 },
    { key: "unknown", label: "Unknown", count: 0 },
  ]);
  assert.deepEqual(diastaticusTiers(undefined)[0].count, 0);
});

test("pofLabel omits unknown and marks asserted values", () => {
  assert.equal(pofLabel({ pof: "positive" }), "POF+");
  assert.equal(pofLabel({ pof: "negative" }), "POF−");
  assert.equal(pofLabel({ pof: "unknown" }), "");
  assert.equal(pofLabel({}), "");
  assert.equal(pofLabel(null), "");
});

test("pofTier and pofTiers keep unknown first-class", () => {
  assert.equal(pofTier({ pof: "positive" }), "positive");
  assert.equal(pofTier({}), "unknown");
  assert.deepEqual(pofTiers([{ pof: "positive" }, { pof: "negative" }, {}]), [
    { key: "positive", label: "POF positive", count: 1 },
    { key: "negative", label: "POF negative", count: 1 },
    { key: "unknown", label: "POF unknown", count: 1 },
  ]);
});

test("temperatureRangeLabel needs both ends of the band", () => {
  assert.equal(temperatureRangeLabel({ temp_low_c: 18, temp_high_c: 22 }), "18–22°C");
  assert.equal(temperatureRangeLabel({ temp_low_c: 18 }), "");
  assert.equal(temperatureRangeLabel(null), "");
});

test("temperatureRangeLabel converts to the display unit", () => {
  const fahrenheit = { toDisplay: (c) => (c * 9) / 5 + 32, symbol: "°F", decimals: 1 };
  assert.equal(
    temperatureRangeLabel({ temp_low_c: 12, temp_high_c: 25 }, fahrenheit),
    "53.6–77.0°F"
  );
});

test("the result label reports the cap and the truncation hint", () => {
  assert.equal(
    yeastResultLabel(3, 3, isYeastListTruncated(3)),
    "Showing 3 matching strains"
  );
  assert.equal(
    yeastResultLabel(YEAST_ROW_LIMIT, YEAST_ROW_LIMIT + 7, isYeastListTruncated(YEAST_ROW_LIMIT + 7)),
    `Showing ${YEAST_ROW_LIMIT} of ${YEAST_ROW_LIMIT + 7} matching strains — refine search or filters`
  );
});

test("isYeastListTruncated trips past the display cap, not at it", () => {
  assert.equal(isYeastListTruncated(YEAST_ROW_LIMIT), false);
  assert.equal(isYeastListTruncated(YEAST_ROW_LIMIT + 1), true);
});

test("the attenuation tier table covers every key attenuationTier returns", () => {
  assert.deepEqual(
    YEAST_ATTENUATION_TIERS.map((tier) => tier.key),
    ["low", "medium", "high", "super"]
  );
  for (const tier of YEAST_ATTENUATION_TIERS) {
    const pct = { low: 0.6, medium: 0.73, high: 0.8, super: 0.9 }[tier.key];
    assert.equal(attenuationTier(pct), tier.key);
  }
});
