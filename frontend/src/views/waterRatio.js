// Host-side SO4:Cl readout formatting. The ratios themselves are artifact
// derived nodes (`water.kettle_blend.sulfate_chloride_ratio`,
// `water.target.sulfate_chloride_ratio`).

import { formatWithDecimals } from "../utils.js";

function ratioText(value) {
  return value == null ? "—" : `${formatWithDecimals(value, 1)} : 1`;
}

export function ratioReadout(asSolved, targetRatio) {
  const target = typeof targetRatio === "number" ? targetRatio : null;
  const deltaFactor =
    asSolved != null && target != null && target > 0 ? asSolved / target : null;

  return {
    asSolved,
    asSolvedText: ratioText(asSolved),
    target,
    targetText: target == null ? null : ratioText(target),
    deltaFactor,
    deltaFactorText: deltaFactor == null ? null : `${formatWithDecimals(deltaFactor, 2)}×`,
  };
}
