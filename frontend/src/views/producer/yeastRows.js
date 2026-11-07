// Yeast card readouts: the attenuation and temperature labels, the attenuation
// tier table, the tri-state STA1 buckets with their counts, and the result
// counter. Pure `(record|value) => …`; the card owns the catalogue, the filter
// state, and the engine refresh.

import { formatWithDecimals, resultCounter, toPercentValue } from "../../utils.js";

// The picker's display window; the result counter reports the truncation.
export const YEAST_ROW_LIMIT = 50;

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

export const YEAST_POF_TIERS = [
  { key: "positive", label: "POF positive" },
  { key: "negative", label: "POF negative" },
  { key: "unknown", label: "POF unknown" },
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
  return yeast ? `${percentText(yeast.attenuation_cap_pct)}%` : "";
}

// A ranged strain's cap is the published high. Older records can carry a
// point cap beside a range; normalize them at every state boundary instead of
// tolerating two different ceilings.
export function normalizeRangedYeast(yeast) {
  if (!yeast || typeof yeast !== "object") return yeast;
  const low = yeast.attenuation_low_pct;
  const high = yeast.attenuation_high_pct;
  if (typeof low !== "number" || typeof high !== "number") return yeast;
  if (yeast.attenuation_cap_pct === high) return yeast;
  return { ...yeast, attenuation_cap_pct: high };
}

// The vendor's published band, when it published one; the cap basis is the
// point (`attenuation_cap_pct`), so this is detail rather than the row's figure.
export function attenuationBandLabel(yeast) {
  const low = yeast?.attenuation_low_pct;
  const high = yeast?.attenuation_high_pct;
  if (typeof low !== "number" || typeof high !== "number") return "";
  return `${percentText(low)}–${percentText(high)}%`;
}

// The vendor QC marker is tri-state; the row shows the marker, never silence.
export function sta1Label(yeast) {
  if (yeast?.sta1 === true) return "STA1+";
  if (yeast?.sta1 === false) return "STA1−";
  return "STA1?";
}

export function diastaticusTiers(catalog) {
  const counts = { positive: 0, negative: 0, unknown: 0 };
  for (const yeast of catalog ?? []) counts[diastaticusTier(yeast)] += 1;
  return YEAST_DIASTATICUS_TIERS.map((tier) => ({ ...tier, count: counts[tier.key] }));
}

export function pofTier(yeast) {
  const value = yeast?.pof;
  return value === "positive" || value === "negative" ? value : "unknown";
}

// The report/row suffix is only printed when the status is known: an unasserted
// POF is the normal seed state, not a warning.
export function pofLabel(yeast) {
  if (yeast?.pof === "positive") return "POF+";
  if (yeast?.pof === "negative") return "POF−";
  return "";
}

export function pofTiers(catalog) {
  const counts = { positive: 0, negative: 0, unknown: 0 };
  for (const yeast of catalog ?? []) counts[pofTier(yeast)] += 1;
  return YEAST_POF_TIERS.map((tier) => ({ ...tier, count: counts[tier.key] }));
}

// The vendor band is stored in °C (the artifact's temperature base). `context`
// converts it to the unit menu's pick; the defaults keep the pure °C reading.
export function temperatureRangeLabel(
  yeast,
  { toDisplay = (value) => value, symbol = "°C", decimals = 0 } = {}
) {
  if (!yeast || typeof yeast.temp_low_c !== "number" || typeof yeast.temp_high_c !== "number") {
    return "";
  }
  const show = (value) => formatWithDecimals(toDisplay(value), decimals);
  return `${show(yeast.temp_low_c)}–${show(yeast.temp_high_c)}${symbol}`;
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
