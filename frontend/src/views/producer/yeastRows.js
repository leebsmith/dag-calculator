// Yeast card readouts: the attenuation and temperature labels, the attenuation
// tier table, the tri-state STA1 buckets with their counts, and the result
// counter. Pure `(record|value) => …`; the card owns the catalogue, the filter
// state, and the engine refresh.

import { resultCounter, toPercentValue } from "../../utils.js";

// The chooser's display window; the result counter reports the truncation.
export const YEAST_ROW_LIMIT = 25;

export const YEAST_ATTENUATION_TIERS = [
  { key: "low", label: "Low 65–70%" },
  { key: "medium", label: "Medium 71–75%" },
  { key: "high", label: "High 76–82%" },
  { key: "super", label: "Super 83%+" },
];

export const YEAST_DIASTATICUS_TIERS = [
  { key: "positive", label: "Diastaticus" },
  { key: "negative", label: "Non-diastaticus" },
  { key: "unknown", label: "Unknown" },
];

// A fraction as a percentage number without the "%" suffix, e.g. "75" / "75.5".
export function percentText(fraction) {
  return String(toPercentValue(fraction, 1));
}

export function attenuationTier(pct) {
  if (typeof pct !== "number") return "";
  if (pct < 0.705) return "low";
  if (pct < 0.755) return "medium";
  if (pct < 0.825) return "high";
  return "super";
}

// Vendor QC is tri-state and sparse: most seeds publish no STA1 result, so
// "unknown" is a real bucket, not a missing value to hide.
export function diastaticusTier(yeast) {
  if (yeast?.sta1 === true) return "positive";
  if (yeast?.sta1 === false) return "negative";
  return "unknown";
}

export function attenuationLabel(yeast) {
  return yeast ? `${percentText(yeast.attenuation_pct)}%` : "";
}

export function diastaticusTiers(catalog) {
  const counts = { positive: 0, negative: 0, unknown: 0 };
  for (const yeast of catalog ?? []) counts[diastaticusTier(yeast)] += 1;
  return YEAST_DIASTATICUS_TIERS.map((tier) => ({ ...tier, count: counts[tier.key] }));
}

export function temperatureRangeLabel(yeast) {
  if (!yeast || typeof yeast.temp_low_c !== "number" || typeof yeast.temp_high_c !== "number") {
    return "";
  }
  return `${yeast.temp_low_c}–${yeast.temp_high_c}°C`;
}

export function isYeastListTruncated(shown) {
  return shown > YEAST_ROW_LIMIT;
}

export function yeastResultLabel(shown, total, truncated) {
  return resultCounter({
    shown,
    total,
    noun: "matching strain",
    truncated,
    truncatedHint: "refine search or filters",
  });
}
