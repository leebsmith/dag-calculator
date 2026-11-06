// Counts and the catalog result sentence.

import { firstNonEmptyString } from "../strings.js";
import { formatValue, toFiniteOrNull } from "./number.js";

/**
 * Pluralized count label, e.g. `countLabel(1, "malt")` -> `"1 malt"`.
 *
 * @param {unknown} count
 * @param {string} [singular="item"]
 * @param {string|null} [plural=null] Defaults to `singular + "s"`.
 * @param {{ dash?: string }} [options]
 * @returns {string}
 */
export function countLabel(count, singular = "item", plural = null, { dash = "" } = {}) {
  const n = toFiniteOrNull(count);
  if (n === null) return dash;
  const singularWord = firstNonEmptyString(singular, "item");
  const pluralWord = firstNonEmptyString(plural, `${singularWord}s`);
  return `${formatValue(n)} ${Math.abs(n) === 1 ? singularWord : pluralWord}`;
}

function countWords(noun, plural) {
  const singularWord = firstNonEmptyString(noun, "result");
  return { singularWord, pluralWord: firstNonEmptyString(plural, `${singularWord}s`) };
}

function truncatedSuffix(hint) {
  const text = firstNonEmptyString(hint);
  return text === "" ? "" : ` — ${text}`;
}

/**
 * Build a "Showing X of Y <noun>" catalog counter sentence.
 *
 * @param {{ shown?: unknown, total?: unknown, noun?: string, plural?: string|null,
 *           truncated?: boolean, truncatedHint?: string, dash?: string }} [spec]
 * @returns {string}
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
  const { singularWord, pluralWord } = countWords(noun, plural);
  const word = Math.abs(totalCount) === 1 ? singularWord : pluralWord;
  if (!truncated) return `Showing ${formatValue(totalCount)} ${word}`;
  return `Showing ${formatValue(visible)} of ${formatValue(totalCount)} ${pluralWord}${truncatedSuffix(truncatedHint)}`;
}
