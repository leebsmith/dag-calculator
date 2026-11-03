// Gravity display context for the Style card.
//
// The solver keeps two native spaces: gravity roots are SG and the extract
// geometry (region, contours, locus) is °P. The unit control chooses which one
// the card *prints* and which one the plot's axes are linear in. This module is
// the single place those conversions are named: `fromSg`/`toSg` convert a
// gravity value, `fromPlato`/`toPlato` convert an extract coordinate.
//
// Cached by unit id so a getter can hand the same object to the plot model
// (its preview memo compares inputs by identity).

import { platoToSg, sgToPlato } from "../../engine/fermentation.js";
import { UNIT_SYMBOLS, unitDecimals } from "../registry/units.js";
import { unitSymbol } from "../../utils.js";

export const GRAVITY_DIMENSION = "gravity";

const CACHE = new Map();

export function gravityDisplay(unitId = "Plato") {
  const cached = CACHE.get(unitId);
  if (cached) return cached;

  const sg = unitId === "SG";
  const decimals = unitDecimals(GRAVITY_DIMENSION, unitId) ?? (sg ? 3 : 1);
  const display = {
    unitId,
    symbol: unitSymbol(UNIT_SYMBOLS, GRAVITY_DIMENSION, unitId),
    decimals,
    step: String(10 ** -decimals),
    fromSg: sg ? (value) => value : sgToPlato,
    toSg: sg ? (value) => value : platoToSg,
    fromPlato: sg ? platoToSg : (value) => value,
    toPlato: sg ? sgToPlato : (value) => value,
  };
  CACHE.set(unitId, display);
  return display;
}
