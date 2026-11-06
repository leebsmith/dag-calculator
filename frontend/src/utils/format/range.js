// Join two formatted bounds with a separator, tolerating partial or missing
// sides.

import { DASH } from "./internal.js";
import { formatValue } from "./number.js";

/**
 * Join two formatted bounds with a separator, tolerating partial or missing sides.
 *
 * @param {unknown} low
 * @param {unknown} high
 * @param {(value: unknown) => string} [formatter]
 * @param {{ separator?: string, dash?: string }} [options]
 * @returns {string} `"1.040–1.055"`, the single known side, or `"—"`.
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
