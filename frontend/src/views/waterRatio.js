// Host-side SO4:Cl readout: no DAG node. Both ratios are sulfate-to-chloride
// ratios of ion vectors: the kettle blend (computed by the water card) and the
// target roots the solver consumes. Presentation-only.

import { formatWithDecimals } from "../utils.js";

export function sulfateChloride(vector) {
  const so4 = vector?.sulfate_so4;
  const cl = vector?.chloride_cl;
  if (typeof so4 !== "number" || typeof cl !== "number" || cl <= 0) return null;
  return so4 / cl;
}

function ratioText(value) {
  return value == null ? "—" : `${formatWithDecimals(value, 1)} : 1`;
}

export function ratioReadout(kettle, target) {
  const asSolved = sulfateChloride(kettle);
  const targetRatio = sulfateChloride(target);
  const deltaFactor =
    asSolved != null && targetRatio != null && targetRatio > 0 ? asSolved / targetRatio : null;

  return {
    asSolved,
    asSolvedText: ratioText(asSolved),
    target: targetRatio,
    targetText: targetRatio == null ? null : ratioText(targetRatio),
    deltaFactor,
    deltaFactorText: deltaFactor == null ? null : `${formatWithDecimals(deltaFactor, 2)}×`,
  };
}
