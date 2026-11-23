/**
 * @file Conditional class strings for templates.
 *
 * Alpine's CSP build cannot parse `:class="{ 'x': condition }"` object literals,
 * and this repository prefers precomputed values in the view layer to logic in
 * markup. These helpers keep the markup to a single call.
 */

/**
 * Return `name` when `active` is truthy, otherwise an empty string.
 *
 * @param {unknown} active
 * @param {string} name
 * @returns {string}
 */
export function classWhen(active, name) {
  return active ? String(name ?? "") : "";
}

/**
 * Build the alignment/bold class string for a table cell.
 *
 * @param {"left"|"center"|"right"|string|undefined|null} align
 * @param {unknown} bold
 * @returns {string}
 */
export function cellClass(align, bold) {
  const parts = [];
  if (align === "right") parts.push("text-right", "tabular-nums");
  else if (align === "center") parts.push("text-center");
  if (bold) parts.push("font-bold");
  return parts.join(" ");
}

/**
 * Compose class names from `(condition, name)` pairs.
 *
 * @param {...unknown} pairs
 * @returns {string}
 */
export function classNames(...pairs) {
  const out = [];
  for (let index = 0; index < pairs.length; index += 2) {
    if (pairs[index]) out.push(String(pairs[index + 1] ?? ""));
  }
  return out.filter(Boolean).join(" ");
}
