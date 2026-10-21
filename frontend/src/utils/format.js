/**
 * @file Pure numeric, unit, and display formatting helpers. Deterministic and
 * side-effect free; never touches the DOM, engine, or artifact. Strings live in
 * ./strings.js; field-model and predicate helpers live in ./model.js.
 */

import { firstNonEmptyString } from "./strings.js";

const DASH = "—";
const MAX_DECIMALS = 20;
const DEFAULT_VALUE_DECIMALS = 3;
const DEFAULT_TIGHT_UNITS = ["%"];
const DEFAULT_TIGHT_SET = new Set(DEFAULT_TIGHT_UNITS);

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

/**
 * @typedef {Object} FieldLike
 * @property {string} [id]
 * @property {string} [label]
 * @property {string|number} [display]
 * @property {string|null} [unit]
 * @property {number|null} [value]
 * @property {number|null} [decimals]
 * @property {boolean} [seeded]
 * @property {string} [seededSource]
 * @property {number|null} [seededValue]
 */

/**
 * @typedef {Object} ColumnLike
 * @property {string} [id]
 * @property {string} [label]
 * @property {string|null} [unit]
 * @property {number|null} [decimals]
 */

/**
 * Clamp a decimal count to a value `Number.prototype.toFixed` accepts.
 *
 * @private
 * @param {unknown} decimals
 * @param {number} [fallback=3]
 * @returns {number} Integer in [0, 20].
 */
function normalizeDecimals(decimals, fallback = DEFAULT_VALUE_DECIMALS) {
  const n = toFiniteOrNull(decimals);
  if (n === null) return fallback;
  return Math.min(MAX_DECIMALS, Math.max(0, Math.trunc(n)));
}

/**
 * Normalize a symbol list into a Set of symbols rendered without a space.
 *
 * @private
 * @param {unknown} tightUnits
 * @returns {Set<string>}
 */
function normalizeTightUnits(tightUnits) {
  if (tightUnits === DEFAULT_TIGHT_UNITS) return DEFAULT_TIGHT_SET;
  if (typeof tightUnits === "string") return new Set([tightUnits]);
  if (Array.isArray(tightUnits)) {
    return new Set(tightUnits.filter((unit) => typeof unit === "string" && unit !== ""));
  }
  return DEFAULT_TIGHT_SET;
}

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
 * Format a fraction (0..1) as a percentage.
 *
 * @param {unknown} fraction
 * @param {number} [decimals=1]
 * @param {{ dash?: string }} [options]
 * @returns {string} e.g. `"76.2%"`.
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
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
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
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
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
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
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function toPercentValue(fraction, decimals = 1, { dash = "" } = {}) {
  const n = toFiniteOrNull(fraction);
  if (n === null) return dash;
  const rounded = roundTo(n * 100, decimals);
  return rounded === null ? dash : rounded;
}

/**
 * Format a specific-gravity value.
 *
 * @param {unknown} sg
 * @param {number} [decimals=3]
 * @param {{ dash?: string }} [options]
 * @returns {string} e.g. `"1.054"`.
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function formatGravity(sg, decimals = 3, { dash = "" } = {}) {
  return formatWithDecimals(sg, decimals, { dash });
}

/**
 * Join two formatted bounds with a separator, tolerating partial or missing sides.
 *
 * @param {unknown} low
 * @param {unknown} high
 * @param {(value: unknown) => string} [formatter]
 * @param {{ separator?: string, dash?: string }} [options]
 * @returns {string} `"1.040–1.055"`, the single known side, or `"—"`.
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function formatRange(low, high, formatter, { separator = "–", dash = DASH } = {}) {
  const format = typeof formatter === "function" ? formatter : formatValue;
  const left = formatValue(format(low));
  const right = formatValue(format(high));
  if (left === "" && right === "") return dash;
  if (left === "") return right;
  if (right === "") return left;
  return `${left}${separator}${right}`;
}

/**
 * Format an OG/FG range in gravity units.
 *
 * @param {unknown} low
 * @param {unknown} high
 * @param {{ decimals?: number, separator?: string, dash?: string }} [options]
 * @returns {string}
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
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
 * Format a value plus an optional unit symbol. Symbols listed in `tightUnits`
 * (default `"%"`) are appended without a space; everything else gets one.
 *
 * @param {unknown} value
 * @param {unknown} unit
 * @param {{ fallbackUnit?: string, dash?: string,
 *           tightUnits?: string|string[] }} [options]
 * @returns {string} e.g. `"12.3 EBC"`, `"80%"`, or `"—"`.
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function formatValueWithUnit(
  value,
  unit,
  { fallbackUnit = "", dash = DASH, tightUnits = DEFAULT_TIGHT_UNITS } = {}
) {
  const text = formatValue(value);
  if (text === "") return dash;
  const symbol = firstNonEmptyString(unit, fallbackUnit);
  if (symbol === "") return text;
  const joiner = normalizeTightUnits(tightUnits).has(symbol) ? "" : " ";
  return `${text}${joiner}${symbol}`;
}

/**
 * Format a producer `{ display, unit }` field model into one display string.
 *
 * @param {FieldLike|null|undefined} field
 * @param {{ fallbackUnit?: string, dash?: string,
 *           tightUnits?: string|string[] }} [options]
 * @returns {string}
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function formatQuantity(
  field,
  { fallbackUnit = "", dash = DASH, tightUnits = DEFAULT_TIGHT_UNITS } = {}
) {
  if (!field || typeof field !== "object") return dash;
  const raw =
    field.display !== undefined && field.display !== null ? field.display : field.value;
  return formatValueWithUnit(raw, field.unit, { fallbackUnit, dash, tightUnits });
}

/**
 * Render `"Label (unit)"`, or just the label when no unit is known.
 *
 * @param {unknown} label
 * @param {unknown} symbol
 * @returns {string}
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function formatFieldLabel(label, symbol) {
  const text = firstNonEmptyString(label);
  const suffix = firstNonEmptyString(symbol);
  return suffix === "" ? text : `${text} (${suffix})`;
}

/**
 * Render a column header from `{ label, unit }` (falls back to `id`).
 *
 * @param {ColumnLike|null|undefined} column
 * @returns {string}
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function formatColumnHeader(column) {
  if (!column || typeof column !== "object") return "";
  return formatFieldLabel(firstNonEmptyString(column.label, column.id), column.unit);
}

/**
 * Pluralized count label, e.g. `countLabel(1, "malt")` -> `"1 malt"`.
 *
 * @param {unknown} count
 * @param {string} [singular="item"]
 * @param {string|null} [plural=null] Defaults to `singular + "s"`.
 * @param {{ dash?: string }} [options]
 * @returns {string}
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function countLabel(count, singular = "item", plural = null, { dash = "" } = {}) {
  const n = toFiniteOrNull(count);
  if (n === null) return dash;
  const singularWord = firstNonEmptyString(singular, "item");
  const pluralWord = firstNonEmptyString(plural, `${singularWord}s`);
  return `${formatValue(n)} ${Math.abs(n) === 1 ? singularWord : pluralWord}`;
}

/**
 * Build a "Showing X of Y <noun>" catalog counter sentence.
 *
 * @param {{ shown?: unknown, total?: unknown, noun?: string, plural?: string|null,
 *           truncated?: boolean, truncatedHint?: string, dash?: string }} [spec]
 * @returns {string}
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function resultCounter({
  shown = 0,
  total = 0,
  noun = "result",
  plural = null,
  truncated = false,
  truncatedHint = "",
  dash = "",
} = {}) {
  const totalCount = toFiniteOrNull(total);
  if (totalCount === null) return dash;
  const shownCount = toFiniteOrNull(shown);
  const visible = shownCount === null ? totalCount : shownCount;
  const singularWord = firstNonEmptyString(noun, "result");
  const pluralWord = firstNonEmptyString(plural, `${singularWord}s`);
  const word = Math.abs(totalCount) === 1 ? singularWord : pluralWord;
  const hint = firstNonEmptyString(truncatedHint);
  if (!truncated) return `Showing ${formatValue(totalCount)} ${word}`;
  const suffix = hint === "" ? "" : ` — ${hint}`;
  return `Showing ${formatValue(visible)} of ${formatValue(totalCount)} ${pluralWord}${suffix}`;
}

/**
 * Normalize display text, substituting a dash for empty output.
 *
 * @param {unknown} text
 * @param {string} [dash="—"]
 * @returns {string}
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function displayOrDash(text, dash = DASH) {
  if (text === null || text === undefined) return dash;
  const value = typeof text === "string" ? text.trim() : formatValue(text);
  return value === "" ? dash : value;
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

/**
 * Convert specific gravity to gravity units: `(sg - 1) * 1000`.
 *
 * @param {unknown} sg
 * @returns {number|null}
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
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
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function bitternessRatio(ibu, og) {
  const bitterness = toFiniteOrNull(ibu);
  const units = gravityUnits(og);
  if (bitterness === null || units === null || units <= 0) return null;
  return bitterness / units;
}

/**
 * Return a safe `href` for an external link: the trimmed URL if its scheme is
 * strictly `http:` or `https:`, else `""`. Blocks `javascript:`, `data:`,
 * `vbscript:`, and scheme-less/relative URLs so a stored value can never inject
 * an executable URL into an anchor.
 *
 * @param {unknown} url
 * @returns {string}
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function safeHref(url) {
  if (typeof url !== "string") return "";
  const trimmed = url.trim();
  if (trimmed === "") return "";
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? trimmed : "";
  } catch {
    return "";
  }
}

/**
 * Format epoch seconds as a localized, short date.
 *
 * @param {unknown} seconds
 * @param {{ locale?: string, timeZone?: string, dash?: string }} [options]
 * @returns {string} e.g. `"Oct 21, 2026"`, or the dash for invalid input.
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function formatDate(seconds, { locale, timeZone, dash = DASH } = {}) {
  const n = toFiniteOrNull(seconds);
  if (n === null) return dash;
  const date = new Date(n * 1000);
  if (Number.isNaN(date.getTime())) return dash;
  if (!locale && !timeZone) return DATE_FORMAT.format(date);
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      ...(timeZone ? { timeZone } : {}),
    }).format(date);
  } catch {
    return DATE_FORMAT.format(date);
  }
}
