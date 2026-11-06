// Date display.

import { DASH } from "./internal.js";
import { toFiniteOrNull } from "./number.js";

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

/**
 * Format epoch seconds as a localized, short date.
 *
 * @param {unknown} seconds
 * @param {{ locale?: string, timeZone?: string, dash?: string }} [options]
 * @returns {string} e.g. `"Oct 21, 2026"`, or the dash for invalid input.
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
