/**
 * @file Row predicates for templates.
 *
 * Alpine's CSP build cannot parse arrow functions, so the `.some(...)` /
 * `.filter(...)` shapes that used to sit in `x-show` live here instead: pure,
 * defensive, and unit-tested.
 */

function rows(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * True when any row's field is null or undefined (or absent).
 *
 * @param {unknown} value
 * @param {string} field
 * @returns {boolean}
 */
export function someRowMissing(value, field) {
  return rows(value).some((row) => row == null || row[field] == null);
}

/**
 * True when any row's field equals `expected`.
 *
 * @param {unknown} value
 * @param {string} field
 * @param {unknown} expected
 * @returns {boolean}
 */
export function someRowMatches(value, field, expected) {
  return rows(value).some((row) => row != null && row[field] === expected);
}

/**
 * True when any per-cell validation object reports `holds === false`.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function someValidationFails(value) {
  return rows(value).some(
    (row) =>
      row != null &&
      typeof row === "object" &&
      Object.values(row).some((entry) => entry != null && entry.holds === false)
  );
}

/**
 * True when any field exposes the given gate id.
 *
 * @param {unknown} value
 * @param {unknown} gate
 * @returns {boolean}
 */
export function someFieldHasGate(value, gate) {
  return rows(value).some((field) => field != null && field.id === gate);
}
