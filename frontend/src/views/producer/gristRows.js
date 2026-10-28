// Malt card readouts: the grain-bill table formatters, the parts/percent
// balance badge, and the draft totals line. Pure `(row|value) => …`; the card
// owns the draft rows, the catalogue lookup, and the engine refresh.

import { formatPercent, formatWithDecimals, toPercentValue } from "../../utils.js";
import { figureMarkFor } from "./table.js";

export const MALT_ROW_LIMIT = 8;

// Summary-card order: largest parts first, then name (case-insensitive).
export function sortGristRows(rows) {
  return [...rows].sort(
    (a, b) =>
      (Number(b.parts) || 0) - (Number(a.parts) || 0) ||
      String(a.name ?? "").localeCompare(String(b.name ?? ""), undefined, { sensitivity: "base" })
  );
}

// Trace = under 2% of the bill (matches the legacy threshold).
export function isTraceMalt(row) {
  return (row?.pct || 0) < 0.02;
}

// Resolved real fermentability with its provenance marker (prior, floor, or
// apparent-converted); blank when the row has no figure.
export function maltFermentableLabel(row) {
  if (typeof row?.fermentability_fraction !== "number") return "";
  return `${figureMarkFor("fermentability_fraction", row)}${formatPercent(
    row.fermentability_fraction
  )}`;
}

export function gristTotalParts(rows) {
  return (rows ?? []).reduce((sum, row) => sum + (Number(row.parts) || 0), 0);
}

export function gristTotalPct(rows) {
  return (rows ?? []).reduce((sum, row) => sum + (row.pct || 0), 0);
}

export function gristDraftTotalsLabel(parts, pct) {
  return `${formatWithDecimals(parts, 1)} parts · ${formatPercent(pct)}`;
}

export function gristValidationState(pct) {
  const total = toPercentValue(pct, 1);
  if (total === 100) {
    return { type: "balanced", label: "100.0% Balanced", class: "badge-success" };
  }
  if (total === 0) return { type: "unconfigured", label: "Unconfigured", class: "badge-muted" };
  if (total < 100) {
    const remaining = formatWithDecimals(100 - total, 1);
    return {
      type: "deficit",
      label: `${formatWithDecimals(total, 1)}% (Remaining ${remaining}%)`,
      class: "badge-amber",
    };
  }
  const excess = formatWithDecimals(total - 100, 1);
  return {
    type: "surplus",
    label: `${formatWithDecimals(total, 1)}% (Excess +${excess}%)`,
    class: "badge-danger",
  };
}

export function isMaltAtLimit(count) {
  return count >= MALT_ROW_LIMIT;
}
