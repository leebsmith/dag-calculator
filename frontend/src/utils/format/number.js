// Numeric primitives: coercion, rounding, canonical scalar display.

import { DEFAULT_VALUE_DECIMALS, normalizeDecimals } from "./internal.js";

/**
 * True when `value` is a real, finite number.
 *
 * @param {unknown} value
 * @returns {boolean}
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Coerce a number or numeric string to a finite number, else `null`.
 * Rejects booleans, arrays, objects, `NaN`, `Infinity`, and blank strings.
 *
 * @param {unknown} value
 * @returns {number|null}
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function toFiniteOrNull(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Round to a fixed number of decimal places.
 *
 * @param {unknown} value
 * @param {number} [decimals=0]
 * @returns {number|null} `null` when `value` is not numeric.
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function roundTo(value, decimals = 0) {
  const n = toFiniteOrNull(value);
  if (n === null) return null;
  const factor = 10 ** normalizeDecimals(decimals, 0);
  return Math.round(n * factor) / factor;
}

/**
 * Canonical scalar display: integers verbatim, other numbers trimmed to 3dp.
 *
 * @param {unknown} value
 * @returns {string} `""` for null/undefined/non-finite input.
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function formatValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return Number.isInteger(value) ? String(value) : String(roundTo(value, DEFAULT_VALUE_DECIMALS));
  }
  return String(value);
}

/**
 * Format a number with fixed decimals, or trim to 3dp when `decimals` is null.
 *
 * @param {unknown} value
 * @param {number|null} [decimals=null]
 * @param {{ dash?: string }} [options]
 * @returns {string}
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function formatWithDecimals(value, decimals = null, { dash = "" } = {}) {
  const n = toFiniteOrNull(value);
  if (n === null) return dash;
  if (decimals === null || decimals === undefined) return formatValue(n);
  return n.toFixed(normalizeDecimals(decimals));
}

/**
 * Clamp a numeric value to optional bounds; `null` bounds are ignored.
 *
 * @param {unknown} value
 * @param {unknown} [min=null]
 * @param {unknown} [max=null]
 * @returns {number|null} `null` when `value` is not numeric.
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function clamp(value, min = null, max = null) {
  const n = toFiniteOrNull(value);
  if (n === null) return null;
  const low = toFiniteOrNull(min);
  const high = toFiniteOrNull(max);
  let out = n;
  if (low !== null && out < low) out = low;
  if (high !== null && out > high) out = high;
  return out;
}
