// Pure navigator math: the feasible style region, the batch's extract point,
// the plot model selection, ABV bounds, target risk, and the gravity readouts.
// The card adapter owns the engine reads, reactive mirrors, and preview cache;
// nothing here uses `this` or mutates state.

import {
  chebyshevCenter,
  cutaiaAbv,
  edgeMargin,
  extractFromTarget,
  feasibleVertices,
  limitHeadroom,
  pointInRegion,
  polygonCentroid,
  raySegment,
  sgToPlato,
  targetFromExtract,
} from "../engine/fermentation.js";
import { clamp, formatWithDecimals, isFiniteNumber } from "../utils.js";
import { stylePlaceholderModel, stylePlotModel } from "./producer/stylePlot.js";

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

function abvInterval(ray) {
  if (!ray) return null;
  const a = cutaiaAbv(ray.oeMin, ray.aeMin);
  const b = cutaiaAbv(ray.oeMax, ray.aeMax);
  return isFiniteNumber(a) && isFiniteNumber(b) ? [Math.min(a, b), Math.max(a, b)] : null;
}

export function stylePreviewModel({
  region,
  point,
  safestPoint,
  pin,
  target,
  unsolved,
  gravity,
  envelope,
}) {
  const band = envelope ? { min: envelope.abvMin, max: envelope.abvMax } : null;
  return (
    stylePlotModel({ region, point, safestPoint, pin, target, gravity, band }) ??
    (unsolved && envelope ? stylePlaceholderModel() : null)
  );
}

export function abvBoundsFor({ extract, aa, region }) {
  if (!extract) return null;
  if (!isFiniteNumber(aa) || aa >= 1) return null;
  return abvInterval(raySegment(region, aa));
}

export function targetInfoFor({ extract }) {
  if (!extract) return null;
  return targetFromExtract(extract.oe, extract.ae);
}

export function targetRiskFor({ extract, safestPoint, region, envelope }) {
  if (!extract || !safestPoint) return null;
  const margin = edgeMargin(region, extract.oe, extract.ae);
  const radius = safestPoint.radius;
  const safety = radius > 0 ? clamp(margin / radius, 0, 1) : null;
  const nearest = limitHeadroom(envelope, extract.oe, extract.ae);
  return { safety, nearest };
}

export function abvTargetFor(target, info) {
  if (isFiniteNumber(target)) return target;
  return info?.abv ?? null;
}

export function gravityReadoutsFor({ info, gravity }) {
  if (!info) return { og: "—", fg: "—" };
  const format = (value) =>
    `${formatWithDecimals(gravity.fromSg(value), gravity.decimals)} ${gravity.symbol}`;
  return { og: format(info.og), fg: format(info.fg) };
}

export function targetNearestText({ nearest, gravity }) {
  if (!nearest) return "—";
  // The headroom is a delta in the limit's native unit. A gravity delta is only
  // linear in SG, so convert the two endpoints and difference them in the
  // display unit rather than scaling the delta itself.
  if (nearest.unit === "SG") {
    const headroom = gravity.fromSg(nearest.value) - gravity.fromSg(nearest.boundary);
    return `${nearest.label} (${formatWithDecimals(headroom, gravity.decimals)} ${gravity.symbol})`;
  }
  const headroom = formatWithDecimals(nearest.headroom, 3);
  return `${nearest.label} (${headroom} ${nearest.unit})`;
}
