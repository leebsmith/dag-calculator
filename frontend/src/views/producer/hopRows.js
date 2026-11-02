// Hop card row readouts: the boil and whirlpool addition tables print these
// labels. Pure `(row) => string`; the card owns the rows, the boundary merge,
// and the display-unit conversion.

import { formatPercent, formatPercentRange, isFiniteNumber, toPercentValue } from "../../utils.js";
import { cellLabel } from "./cell.js";

const DASH = "—";

// The leaf is the form, and the form is the only thing the yield scalar sees.
// Stage never restricts the leaf: the same extract leaf holds a kettle product
// and a whirlpool product, so the picker seeds the likely stage and the row
// carries the truth.
export const KETTLE_HOP_FORMS = [
  { value: "whole_cone", label: "Whole cone" },
  { value: "t90_pellet", label: "Pellets (T-90, T-45/55)" },
  { value: "lupulin_pellet", label: "Lupulin concentrate (Cryo, Lupomax)" },
  {
    value: "flowable_extract",
    label: "Extract (CO₂, Hop Shot, Flex, DynaBoost, Incognito)",
  },
];

export const BOIL_HOP_FORMS = KETTLE_HOP_FORMS;

export const WHIRLPOOL_HOP_FORMS = KETTLE_HOP_FORMS;

// The dry hop prices no IBU, so its leaves carry lupulin load and beer loss.
export const DRY_HOP_FORMS = [
  { value: "whole_cone", label: "Whole cone" },
  { value: "t90_pellet", label: "Pellets (T-90)" },
  { value: "lupulin_pellet", label: "Lupulin concentrate (Cryo, Lupomax)" },
];

// The label vocabulary covers every form, including the ones a table does not
// offer, so a stored row never prints a raw code.
const HOP_FORM_LABELS = {
  whole_cone: "Whole cone",
  t90_pellet: "T-90 pellets",
  flowable_extract: "Extract",
  lupulin_pellet: "Lupulin concentrate",
};

export const HOP_FORM_LABEL_OPTIONS = {
  whole_cone: "Whole cone",
  t90_pellet: "T-90 pellet",
  flowable_extract: "Extract",
  lupulin_pellet: "Lupulin concentrate",
};

export function hopFormLabel(row) {
  const value = row?.product_form ?? "t90_pellet";
  return HOP_FORM_LABELS[value] ?? value;
}

export function hopFormOptionLabel(value) {
  return HOP_FORM_LABEL_OPTIONS[value] ?? value;
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

export function hopAdditionLabel(row) {
  const at = Number(row?.addition_at_min);
  return Number.isFinite(at) ? `${Math.round(at)} min` : "—";
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
      minutes: Number.isFinite(minutes) ? minutes : 0,
      ibu: Number.isFinite(ibu) ? ibu : (Number(row.pct) || 0) * whirlpoolIbu,
      mass_kg: mass,
      effective_minutes:
        typeof result.effective_minutes === "number" ? result.effective_minutes : null,
      dose_g_per_gal: doseGPerGal,
    };
  });
}
