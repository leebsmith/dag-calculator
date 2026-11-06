// Specific-gravity display and the simple gravity math the cards quote.

import { DASH } from "./internal.js";
import { formatWithDecimals, toFiniteOrNull } from "./number.js";
import { formatRange } from "./range.js";

/**
 * Format a specific-gravity value.
 *
 * @param {unknown} sg
 * @param {number} [decimals=3]
 * @param {{ dash?: string }} [options]
 * @returns {string} e.g. `"1.054"`.
 */
export function formatGravity(sg, decimals = 3, { dash = "" } = {}) {
  return formatWithDecimals(sg, decimals, { dash });
}

/**
 * Format an OG/FG range in gravity units.
 *
 * @param {unknown} low
 * @param {unknown} high
 * @param {{ decimals?: number, separator?: string, dash?: string }} [options]
 * @returns {string}
 */
export function formatGravityRange(
  low,
  high,
  { decimals = 3, separator = "–", dash = DASH } = {}
) {
  return formatRange(low, high, (value) => formatGravity(value, decimals), {
    separator,
    dash,
  });
}

/**
 * Convert specific gravity to gravity units: `(sg - 1) * 1000`.
 *
 * @param {unknown} sg
 * @returns {number|null}
 */
export function gravityUnits(sg) {
  const n = toFiniteOrNull(sg);
  return n === null ? null : (n - 1) * 1000;
}

/**
 * Bitterness ratio (BU:GU) from IBU and specific gravity.
 *
 * @param {unknown} ibu
 * @param {unknown} og
 * @returns {number|null} `null` when either input is invalid or GU <= 0.
 */
export function bitternessRatio(ibu, og) {
  const bitterness = toFiniteOrNull(ibu);
  const units = gravityUnits(og);
  if (bitterness === null || units === null || units <= 0) return null;
  return bitterness / units;
}
