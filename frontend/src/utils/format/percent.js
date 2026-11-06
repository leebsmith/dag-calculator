// Fraction and percent formatting.

import { DASH, normalizeDecimals } from "./internal.js";
import { roundTo, toFiniteOrNull } from "./number.js";

/**
 * Format a fraction (0..1) as a percentage.
 *
 * @param {unknown} fraction
 * @param {number} [decimals=1]
 * @param {{ dash?: string }} [options]
 * @returns {string} e.g. `"76.2%"`.
 */
export function formatPercent(fraction, decimals = 1, { dash = DASH } = {}) {
  const n = toFiniteOrNull(fraction);
  if (n === null) return dash;
  return `${(n * 100).toFixed(normalizeDecimals(decimals, 1))}%`;
}

/**
 * Format a fraction as a whole percentage.
 *
 * @param {unknown} fraction
 * @param {{ dash?: string }} [options]
 * @returns {string} e.g. `"76%"`.
 */
export function formatPercentRounded(fraction, { dash = DASH } = {}) {
  return formatPercent(fraction, 0, { dash });
}

/**
 * Format a number ALREADY expressed in percent units (e.g. ABV 5.4).
 * Do not pass a 0..1 fraction here — use `formatPercent` for those.
 *
 * @param {unknown} percent
 * @param {number} [decimals=1]
 * @param {{ dash?: string }} [options]
 * @returns {string} e.g. `"5.4%"`.
 */
export function formatPercentValue(percent, decimals = 1, { dash = DASH } = {}) {
  const n = toFiniteOrNull(percent);
  if (n === null) return dash;
  return `${n.toFixed(normalizeDecimals(decimals, 1))}%`;
}

/**
 * Convert a 0..1 fraction to a percent-valued NUMBER for an `<input>` binding
 * (no "%" sign). Inverse of the `scale = 0.01` write path.
 *
 * @param {unknown} fraction
 * @param {number} [decimals=1]
 * @param {{ dash?: string }} [options]
 * @returns {number|string} Percent value, or `dash` for invalid input.
 */
export function toPercentValue(fraction, decimals = 1, { dash = "" } = {}) {
  const n = toFiniteOrNull(fraction);
  if (n === null) return dash;
  const rounded = roundTo(n * 100, decimals);
  return rounded === null ? dash : rounded;
}

/**
 * Format a fraction range as one percentage span.
 *
 * Both ends share a single `%` suffix, and a span whose ends round equal
 * collapses to the single value.
 *
 * @param {unknown} low
 * @param {unknown} high
 * @param {{ decimals?: number, separator?: string, dash?: string }} [options]
 * @returns {string} e.g. `"5.3–6.2%"`, `"5.3%"`, or `"—"`.
 */
export function formatPercentRange(
  low,
  high,
  { decimals = 1, separator = "–", dash = DASH } = {}
) {
  const places = normalizeDecimals(decimals, 1);
  const a = toFiniteOrNull(low);
  const b = toFiniteOrNull(high);
  if (a === null || b === null) {
    return formatPercent(a ?? b, places, { dash });
  }
  const left = (a * 100).toFixed(places);
  const right = (b * 100).toFixed(places);
  return left === right ? `${left}%` : `${left}${separator}${right}%`;
}
