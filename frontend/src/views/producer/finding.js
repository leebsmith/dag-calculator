// Finding operand formatting: the one place a relation operand leaves its base
// unit for display. Reads the user's unit mode, like the scalar producer.

import { fromBase } from "../../engine/units.js";
import { UNIT_DIMENSIONS, UNIT_SYMBOLS, unitDecimals } from "../registry/units.js";
import { unitSymbol } from "../../utils.js";
import { nonlinearFns } from "./valuation.js";
import { formatCell, cellLabel } from "./cell.js";

export function createFindingFormatter(artifact, engine, ui) {
  const unitMode = ui?.unitMode ?? {};
  const nl = nonlinearFns(artifact, engine);
  return ({ value, dimension }) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return "—";
    const dim = UNIT_DIMENSIONS.find((entry) => entry.id === dimension);
    const unitId = dim ? unitMode[dimension] ?? dim.default ?? dim.units[0][0] : null;
    if (!unitId) return formatCell(value).display;
    const shown = fromBase(artifact, dimension, unitId, value, nl);
    const decimals = unitDecimals(dimension, unitId);
    const symbol = unitSymbol(UNIT_SYMBOLS, dimension, unitId);
    return cellLabel(shown, { decimals, symbol });
  };
}
