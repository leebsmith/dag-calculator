// Host-side SO4:Cl readout: no DAG node. The ratio is the sulfate-to-chloride
// ratio of the kettle ion vector (computed by the water card), compared against
// the batch's declared intent. Presentation-only.

import { formatWithDecimals } from "../utils.js";

export function sulfateChloride(kettle) {
  const so4 = kettle?.sulfate_so4;
  const cl = kettle?.chloride_cl;
  if (typeof so4 !== "number" || typeof cl !== "number" || cl <= 0) return null;
  return so4 / cl;
}

function ratioText(value) {
  return value == null ? "—" : `${formatWithDecimals(value, 1)} : 1`;
}

export function ratioReadout(kettle, intentMode, intentRatio) {
  const asSolved = sulfateChloride(kettle);
  const specified = intentMode === "specified";
  const intent = specified && typeof intentRatio === "number" && Number.isFinite(intentRatio)
    ? intentRatio
    : null;
  const deltaFactor =
    asSolved != null && intent != null && intent > 0 ? asSolved / intent : null;

  return {
    asSolved,
    asSolvedText: ratioText(asSolved),
    intent,
    intentText: intent == null ? null : ratioText(intent),
    deltaFactor,
    deltaFactorText: deltaFactor == null ? null : `${formatWithDecimals(deltaFactor, 2)}×`,
  };
}
