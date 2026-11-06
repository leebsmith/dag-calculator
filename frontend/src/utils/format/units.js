// Value + unit strings, producer field models, and column/field labels.

import { firstNonEmptyString } from "../strings.js";
import {
  DASH,
  DEFAULT_TIGHT_UNITS,
  normalizeTightUnits,
} from "./internal.js";
import { formatValue } from "./number.js";

/**
 * Format a value plus an optional unit symbol. Symbols listed in `tightUnits`
 * (default `"%"`) are appended without a space; everything else gets one.
 *
 * @param {unknown} value
 * @param {unknown} unit
 * @param {{ fallbackUnit?: string, dash?: string,
 *           tightUnits?: string|string[] }} [options]
 * @returns {string} e.g. `"12.3 EBC"`, `"80%"`, or `"—"`.
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
 * @param {{ display?: unknown, value?: unknown, unit?: unknown }|null|undefined} field
 * @param {{ fallbackUnit?: string, dash?: string,
 *           tightUnits?: string|string[] }} [options]
 * @returns {string}
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
 */
export function formatFieldLabel(label, symbol) {
  const text = firstNonEmptyString(label);
  const suffix = firstNonEmptyString(symbol);
  return suffix === "" ? text : `${text} (${suffix})`;
}

/**
 * Render a column header from `{ label, unit }` (falls back to `id`).
 *
 * @param {{ label?: unknown, unit?: unknown, id?: unknown }|null|undefined} column
 * @returns {string}
 */
export function formatColumnHeader(column) {
  if (!column || typeof column !== "object") return "";
  return formatFieldLabel(firstNonEmptyString(column.label, column.id), column.unit);
}
