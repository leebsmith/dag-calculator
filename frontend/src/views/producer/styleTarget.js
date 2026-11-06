// Fermentation-target state: the style's feasible OE/AE region, its safest
// point, the batch's extract point projected into it, and the scale-pin
// mirrors the input binds. Pure over the engine/fermentation.js primitives; the
// card owns the engine reads.

import {
  chebyshevCenter,
  edgeMargin,
  extractFromTarget,
  feasibleVertices,
  pointInRegion,
  polygonCentroid,
  raySegment,
  sgToPlato,
} from "../../engine/fermentation.js";
import { isFiniteNumber } from "../../utils.js";

// ABV is the control; the OE/AE point is its inverse on the fixed-AA ray. The
// region comes from the envelope (batch.style_* roots) so it tracks envelope
// edits (WYSIWYG).
export function styleRegionState(envelope = {}) {
  const complete =
    envelope.ogMin < envelope.ogMax &&
    envelope.fgMin < envelope.fgMax &&
    envelope.abvMin < envelope.abvMax;
  const region = complete ? feasibleVertices(envelope) : [];
  return {
    styleEnvelope: complete ? envelope : null,
    styleRegion: region,
    styleSafestPoint: region.length >= 3 ? chebyshevCenter(region) : null,
  };
}

// The solved batch is the graph marker for every pin; the target inverse is
// only the pre-solve fallback.
export function styleExtractPoint({ region, solvedOg, solvedAa, fallbackAa, targetAbv }) {
  if (isFiniteNumber(solvedOg) && solvedOg > 1.0 && isFiniteNumber(solvedAa)) {
    const oe = sgToPlato(solvedOg);
    return { oe, ae: oe * (1 - solvedAa) };
  }
  const inverse = isFiniteNumber(targetAbv)
    ? extractFromTarget(fallbackAa, targetAbv)
    : null;
  if (
    inverse &&
    (pointInRegion(region, inverse.oe, inverse.ae) ||
      edgeMargin(region, inverse.oe, inverse.ae) < 1e-6)
  ) {
    return inverse;
  }
  const ray = Number.isFinite(fallbackAa) ? raySegment(region, fallbackAa) : null;
  if (ray) {
    const oe = (ray.oeMin + ray.oeMax) / 2;
    return { oe, ae: oe * (1 - fallbackAa) };
  }
  const centroid = polygonCentroid(region);
  return centroid ? { oe: centroid[0], ae: centroid[1] } : null;
}
