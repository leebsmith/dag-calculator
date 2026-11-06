// Text display and URL safety.

import { DASH } from "./internal.js";
import { formatValue } from "./number.js";

/**
 * Normalize display text, substituting a dash for empty output.
 *
 * @param {unknown} text
 * @param {string} [dash="—"]
 * @returns {string}
 */
export function displayOrDash(text, dash = DASH) {
  if (text === null || text === undefined) return dash;
  const value = typeof text === "string" ? text.trim() : formatValue(text);
  return value === "" ? dash : value;
}

/**
 * Return a safe `href` for an external link: the trimmed URL if its scheme is
 * strictly `http:` or `https:`, else `""`. Blocks `javascript:`, `data:`,
 * `vbscript:`, and scheme-less/relative URLs so a stored value can never inject
 * an executable URL into an anchor.
 *
 * @param {unknown} url
 * @returns {string}
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
