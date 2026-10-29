// Hop card row readouts: the boil and whirlpool addition tables print these
// labels. Pure `(row) => string`; the card owns the rows, the boundary merge,
// and the display-unit conversion.

import { formatPercent, formatPercentRange, isFiniteNumber, toPercentValue } from "../../utils.js";
import { cellLabel } from "./cell.js";

const DASH = "—";

export const WHIRLPOOL_HOP_FORMS = [
  { value: "t90_pellet", label: "T-90 pellets" },
  { value: "flowable_extract", label: "Flowable CO₂ extract" },
  { value: "lupulin_pellet", label: "Lupulin pellet" },
];

export function hopFormLabel(row) {
  const value = row?.product_form ?? "t90_pellet";
  return WHIRLPOOL_HOP_FORMS.find((form) => form.value === value)?.label ?? value;
}

export function hopAlphaLabel(row) {
  return typeof row?.alpha_acid_pct === "number" ? formatPercent(row.alpha_acid_pct, 1) : DASH;
}

export function hopAlphaInputValue(row) {
  return typeof row?.alpha_acid_pct === "number" ? toPercentValue(row.alpha_acid_pct, 2) : "";
}

// The batch row owns the measured value; the catalogue's alpha band is
// context (a descriptive range, never a gate).
export function hopAlphaStockLabel(record) {
  const lo = record?.alpha_acid_min_pct;
  const hi = record?.alpha_acid_max_pct;
  if (!isFiniteNumber(lo) || !isFiniteNumber(hi)) return "";
  return `stock ${formatPercentRange(lo, hi, { decimals: 1 })}`;
}

export function hopAlphaIsOutsideStock(row, record) {
  const lo = record?.alpha_acid_min_pct;
  const hi = record?.alpha_acid_max_pct;
  const value = row?.alpha_acid_pct;
  if (!isFiniteNumber(lo) || !isFiniteNumber(hi) || !isFiniteNumber(value)) return false;
  return value < lo || value > hi;
}

export function hopBoilPctLabel(row) {
  return typeof row?.boil_time_fraction === "number"
    ? formatPercent(row.boil_time_fraction, 0)
    : DASH;
}

export function hopMinutesLabel(row) {
  return typeof row?.minutes === "number"
    ? cellLabel(row.minutes, { decimals: 0, symbol: "min" })
    : DASH;
}

export function hopIbuLabel(row) {
  return typeof row?.ibu === "number" ? cellLabel(row.ibu, { decimals: 1 }) : DASH;
}

export function hopPctLabel(row) {
  return typeof row?.pct === "number" ? formatPercent(row.pct, 1) : DASH;
}

export function mergeBoilRows(rows, results, boilIbu, boilTimeMin) {
  return (rows ?? []).map((row, index) => {
    const result = results?.[index] ?? {};
    const minutes = Number(result.minutes);
    const ibu = Number(result.ibu);
    return {
      ...row,
      minutes: Number.isFinite(minutes)
        ? minutes
        : (Number(row.boil_time_fraction) || 0) * boilTimeMin,
      ibu: Number.isFinite(ibu) ? ibu : (Number(row.pct) || 0) * boilIbu,
      mass_kg: typeof result.mass_kg === "number" ? result.mass_kg : null,
    };
  });
}

export function mergeWhirlpoolRows(rows, results, whirlpoolIbu, volume) {
  return (rows ?? []).map((row, index) => {
    const result = results?.[index] ?? {};
    const minutes = Number(result.minutes);
    const ibu = Number(result.ibu);
    const mass = typeof result.mass_kg === "number" ? result.mass_kg : null;
    const doseGPerGal =
      typeof mass === "number" && volume > 0 ? (mass * 1000) / (volume / 3.785411784) : null;
    return {
      ...row,
      product_form: row.product_form ?? "t90_pellet",
      minutes: Number.isFinite(minutes) ? minutes : Number(row.duration_min) || 0,
      ibu: Number.isFinite(ibu) ? ibu : (Number(row.pct) || 0) * whirlpoolIbu,
      mass_kg: mass,
      effective_minutes:
        typeof result.effective_minutes === "number" ? result.effective_minutes : null,
      dose_g_per_gal: doseGPerGal,
    };
  });
}
