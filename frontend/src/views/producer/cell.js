// The one numeric readout rule. A value already converted into its display
// unit becomes the string a template, table, or report prints; the symbol is
// the one the registry resolved for that unit. Unit conversion stays in the
// producer (`displayValue` / `fromBase`) and never happens here.

import { formatValue, formatValueWithUnit, formatWithDecimals } from "../../utils.js";

// `decimals = null` trims to the canonical 3dp; a pinned precision pads.
export function formatCell(value, { decimals = null, symbol = null } = {}) {
  const display =
    decimals != null ? formatWithDecimals(value, decimals) : formatValue(value);
  return { display, unit: symbol ?? null };
}

// One label for surfaces that print the number and its symbol together. The
// util's tight-unit rule applies (`%` binds, everything else gets a space).
export function cellLabel(value, { decimals = null, symbol = null, dash = "—" } = {}) {
  if (value === null || value === undefined) return dash;
  const { display } = formatCell(value, { decimals });
  return formatValueWithUnit(display, symbol, { dash });
}
