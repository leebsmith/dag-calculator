// The bract floor: a mass-composition check, not a sensory one.
//
// YCH's benchmark for adapting a T-90 recipe is that for every 100 g of original
// T-90 you convert the bulk of the lupulin load to 40 g of Cryo and keep 25 g of
// T-90 (or 15 g of American Noble) to preserve the vegetative polyphenol and
// tannin structure. As a ratio against lupulin mass that is 25/40 = 0.625.
//
// The rule is advisory: it names the shortfall and the two ways to fix it, and
// never rewrites the authored shares. The card shows the composition whenever
// the bill carries lupulin, so the brewer sees the headroom before it fails.

import { formatWithDecimals, isFiniteNumber } from "../../utils.js";

/**
 * The hot-side bract-floor readout, or "" when the bill has no lupulin.
 * @pure
 * @param {{ readonly bractKg?: number|null, readonly lupulinKg?: number|null, readonly floorKg?: number|null, readonly shortfallKg?: number|null, readonly ratio?: number|null, readonly unit?: string, readonly formatMass: (kg: number, unit: string) => string }} args
 */
export function bractFloorLine({
  bractKg,
  lupulinKg,
  floorKg,
  shortfallKg,
  ratio,
  unit = "g",
  formatMass,
}) {
  if (!isFiniteNumber(lupulinKg) || lupulinKg <= 0) return "";
  if (!isFiniteNumber(bractKg) || !isFiniteNumber(floorKg) || !isFiniteNumber(shortfallKg)) {
    return "";
  }
  if (!isFiniteNumber(ratio) || ratio <= 0) return "";
  const composition = [
    `Hot-side bract ${formatMass(bractKg, unit)}`,
    `lupulin ${formatMass(lupulinKg, unit)}`,
    `floor ${formatMass(floorKg, unit)} (${formatWithDecimals(ratio, 3)} × lupulin)`,
  ].join(" \u00b7 ");
  if (shortfallKg <= 0) return `${composition}.`;
  const convert = shortfallKg / (1 + ratio);
  return (
    `${composition}. Short ${formatMass(shortfallKg, unit)}: ` +
    `add \u2265 ${formatMass(shortfallKg, unit)} T-90, or convert ` +
    `${formatMass(convert, unit)} lupulin to T-90.`
  );
}

/**
 * Whether the floor is short. A missing shortfall never warns.
 * @pure
 * @param {number|null|undefined} shortfallKg
 */
export function bractFloorShort(shortfallKg) {
  return isFiniteNumber(shortfallKg) && shortfallKg > 0;
}
