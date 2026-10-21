/**
 * @file Pure field-model and predicate helpers. Depends on ./format.js for
 * numeric coercion and ./strings.js for first-non-empty selection; never touches
 * the DOM, engine, or artifact.
 */

import { toFiniteOrNull } from "./format.js";
import { firstNonEmptyString } from "./strings.js";

/** Shared read-only fallback for missing field models. */
export const EMPTY_FIELD = Object.freeze({});

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
 * Click-to-clear filter toggle: select `value`, or clear when already selected.
 *
 * @param {unknown} current
 * @param {unknown} value
 * @returns {unknown} `""` when clearing, else `value`.
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function toggleFilter(current, value) {
  if (value === "" || value === null || value === undefined) return "";
  return current === value ? "" : value;
}

/**
 * Immutably add/remove a value from a filter list.
 *
 * @param {unknown} list
 * @param {unknown} value
 * @returns {Array<unknown>} A new array; never mutates the input.
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function toggleInList(list, value) {
  const items = Array.isArray(list) ? list : [];
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
}

/**
 * Advance to the next unit id in a dimension, wrapping at the end.
 *
 * @param {unknown} units
 * @param {unknown} current
 * @returns {unknown} The next unit id, or `current` when `units` is unusable.
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function cycleUnit(units, current) {
  if (!Array.isArray(units) || units.length === 0) return current ?? null;
  const index = units.indexOf(current);
  return units[(index + 1) % units.length];
}

/**
 * Index a field-model array by id for O(1) template lookups. First id wins.
 *
 * @param {unknown} fields
 * @returns {Record<string, FieldLike>} Plain object; `{}` for non-arrays.
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function indexFields(fields) {
  const index = {};
  if (!Array.isArray(fields)) return index;
  for (const field of fields) {
    if (!field || typeof field !== "object") continue;
    const id = typeof field.id === "string" ? field.id : "";
    if (id === "" || Object.prototype.hasOwnProperty.call(index, id)) continue;
    index[id] = field;
  }
  return index;
}

/**
 * Read a field model by id, falling back to a shared empty model.
 *
 * @param {unknown} fieldsById
 * @param {unknown} id
 * @param {FieldLike} [fallback=EMPTY_FIELD]
 * @returns {FieldLike}
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function fieldOr(fieldsById, id, fallback = EMPTY_FIELD) {
  if (!fieldsById || typeof fieldsById !== "object" || typeof id !== "string") return fallback;
  if (!Object.prototype.hasOwnProperty.call(fieldsById, id)) return fallback;
  const found = fieldsById[id];
  return found && typeof found === "object" ? found : fallback;
}

/**
 * Resolve a numeric `[low, high]` pair from two field ids; `null` unless strictly ordered.
 *
 * @param {unknown} fields Array of field models, or an id-keyed index.
 * @param {string} minId
 * @param {string} maxId
 * @returns {[number, number]|null}
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function boundsOf(fields, minId, maxId) {
  const index = Array.isArray(fields) ? indexFields(fields) : fields;
  const low = toFiniteOrNull(fieldOr(index, minId).value);
  const high = toFiniteOrNull(fieldOr(index, maxId).value);
  if (low === null || high === null || low >= high) return null;
  return [low, high];
}

/**
 * Derive the seed-badge / reset affordance state from a field model.
 *
 * @param {FieldLike|null|undefined} field
 * @param {{ sourceLabel?: string, resetSymbol?: string }} [options]
 * @returns {{ showSeed: boolean, showReset: boolean, seedTitle: string,
 *             resetTitle: string, resetSymbol: string }}
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function provenanceFor(field, { sourceLabel = "seed", resetSymbol = "↺" } = {}) {
  const label = firstNonEmptyString(sourceLabel, "seed");
  const source = firstNonEmptyString(field?.seededSource);
  const showSeed = field?.seeded === true;
  const showReset = !showSeed && field?.seededValue !== undefined;
  const seedTitle =
    source === ""
      ? `Auto-filled (${label}); edit to override`
      : `Auto-filled from ${source} (${label}); edit to override`;
  const resetTitle = source === "" ? "Reset to the auto-filled value" : `Reset to ${source}`;
  return { showSeed, showReset, seedTitle, resetTitle, resetSymbol };
}

/**
 * Discriminate a readout-table cell into its render variant.
 *
 * @param {unknown} cell
 * @returns {"text"|"number"|"empty"}
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function cellKind(cell) {
  if (!cell || typeof cell !== "object") return "empty";
  if (cell.text !== undefined && cell.text !== null) return "text";
  if (cell.display !== undefined && cell.display !== null) return "number";
  return "empty";
}

/**
 * True when any cell in any row carries `holds === false`.
 *
 * @param {unknown} rowValidations
 * @returns {boolean}
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function hasInvalidCells(rowValidations) {
  if (!Array.isArray(rowValidations)) return false;
  return rowValidations.some(
    (row) =>
      row &&
      typeof row === "object" &&
      Object.values(row).some((cell) => cell && cell.holds === false)
  );
}

/**
 * True when any row is missing a finite number at `key`.
 *
 * @param {unknown} rows
 * @param {unknown} key
 * @returns {boolean}
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function hasMissingNumber(rows, key) {
  if (!Array.isArray(rows) || typeof key !== "string") return false;
  return rows.some((row) => toFiniteOrNull(row?.[key]) === null);
}

/**
 * True for a `std:` representative catalog entry (accepts an item or a bare id).
 *
 * @param {unknown} itemOrId
 * @returns {boolean}
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function isRepresentative(itemOrId) {
  const id = itemOrId && typeof itemOrId === "object" ? itemOrId.id : itemOrId;
  return typeof id === "string" && id.startsWith("std:");
}

/**
 * Resolve a preferred unit id from the unit-mode map.
 *
 * @param {unknown} unitMode
 * @param {string} dimension
 * @param {string|null} [fallback=null]
 * @returns {string|null}
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function preferredUnit(unitMode, dimension, fallback = null) {
  if (!unitMode || typeof unitMode !== "object" || typeof dimension !== "string") {
    return fallback;
  }
  const picked = unitMode[dimension];
  return typeof picked === "string" && picked !== "" ? picked : fallback;
}

/**
 * Resolve a unit symbol from a `UNIT_SYMBOLS` table, falling back to the unit id.
 *
 * @param {unknown} symbols
 * @param {string} dimension
 * @param {unknown} unitId
 * @param {string|null} [fallback=null]
 * @returns {string|null}
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function unitSymbol(symbols, dimension, unitId, fallback = null) {
  const table =
    symbols && typeof symbols === "object" && typeof dimension === "string"
      ? symbols[dimension]
      : null;
  const symbol =
    table && typeof table === "object" && typeof unitId === "string" ? table[unitId] : null;
  if (typeof symbol === "string" && symbol !== "") return symbol;
  if (typeof unitId === "string" && unitId !== "") return unitId;
  return fallback;
}
