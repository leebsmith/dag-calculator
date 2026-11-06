// Shared constants and normalizers for the display formatters. Not re-exported
// by the `utils.js` barrel: these are implementation details of the format
// group, not public helpers.

export const DASH = "—";
export const MAX_DECIMALS = 20;
export const DEFAULT_VALUE_DECIMALS = 3;
export const DEFAULT_TIGHT_UNITS = ["%"];
export const DEFAULT_TIGHT_SET = new Set(DEFAULT_TIGHT_UNITS);

// Clamp a decimal count to a value `Number.prototype.toFixed` accepts. Booleans,
// arrays and objects are not decimal counts, so they fall back.
export function normalizeDecimals(decimals, fallback = DEFAULT_VALUE_DECIMALS) {
  let n;
  if (typeof decimals === "number") n = decimals;
  else if (typeof decimals === "string" && decimals.trim() !== "") n = Number(decimals);
  else n = Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_DECIMALS, Math.max(0, Math.trunc(n)));
}

// Normalize a symbol list into a Set of symbols rendered without a space.
export function normalizeTightUnits(tightUnits) {
  if (tightUnits === DEFAULT_TIGHT_UNITS) return DEFAULT_TIGHT_SET;
  if (typeof tightUnits === "string") return new Set([tightUnits]);
  if (Array.isArray(tightUnits)) {
    return new Set(tightUnits.filter((unit) => typeof unit === "string" && unit !== ""));
  }
  return DEFAULT_TIGHT_SET;
}
