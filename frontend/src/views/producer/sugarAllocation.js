// Host-side sugar-extract allocation for late-addition share mode.
//
// The wire carries `sugar_extract_share` (sugar extract ÷ total post-boil
// extract); the solver derives the sugar mass per candidate gravity. Rows carry
// `parts`, which Hamilton-normalize to the share of that sugar budget. Masses are
// display/report values only: the request never sends them in share mode.

import { hamiltonPct } from "../hamilton.js";

export const MAX_SUGAR_SHARE = 0.95;
export const HIGH_SUGAR_SHARE = 0.9;
// Share mode weights rows by parts. A row with no authored weight (a catalog
// add, or a batch saved before the weight existed) starts equal to its peers, so
// a positive sugar budget is never left unallocated.
export const EQUAL_SUGAR_PARTS = 10;

function finiteNonNegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

export function sugarDoseExtractKg(rows) {
  return (rows ?? []).reduce(
    (sum, row) =>
      sum + finiteNonNegative(Number(row.mass_kg)) * finiteNonNegative(Number(row.yield_fraction)),
    0
  );
}

export function sugarPartsFromDose(rows) {
  return (rows ?? []).map(
    (row) => finiteNonNegative(Number(row.mass_kg)) * finiteNonNegative(Number(row.yield_fraction))
  );
}

export function sugarShareFromDose(rows, extractTotalKg) {
  const dose = sugarDoseExtractKg(rows);
  const total = finiteNonNegative(Number(extractTotalKg));
  if (dose <= 0 || total <= 0) return 0;
  return Math.min(MAX_SUGAR_SHARE, dose / total);
}

export function resolvedSugarMasses({ rows, budgetKg, share, mode }) {
  const list = rows ?? [];
  const shareMode = mode ?? (Number(share) > 0 ? "share" : "dose");
  if (shareMode !== "share") {
    return list.map((row) => ({
      extractKg: finiteNonNegative(Number(row.mass_kg)) * finiteNonNegative(Number(row.yield_fraction)),
      massKg: finiteNonNegative(Number(row.mass_kg)),
    }));
  }
  const pcts = hamiltonPct(list.map((row) => finiteNonNegative(Number(row.parts))));
  const budget = finiteNonNegative(Number(budgetKg));
  return list.map((row, index) => {
    const extractKg = pcts[index] * budget;
    const yieldFraction = finiteNonNegative(Number(row.yield_fraction));
    return { extractKg, massKg: yieldFraction > 0 ? extractKg / yieldFraction : 0 };
  });
}
