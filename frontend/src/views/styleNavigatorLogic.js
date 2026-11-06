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
/**
 * Build the feasible OE/AE region and its safest point.
 *
 * @pure
 * @param {Readonly<{ readonly ogMin?: number, readonly ogMax?: number, readonly fgMin?: number, readonly fgMax?: number, readonly abvMin?: number, readonly abvMax?: number }>} [envelope]
 * @returns {{ readonly styleEnvelope: object|null, readonly styleRegion: ReadonlyArray<readonly [number, number]>, readonly styleSafestPoint: object|null }}
 */
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
/**
 * Project the solved batch or target inverse into the OE/AE plane.
 *
 * @pure
 * @param {{ readonly region: ReadonlyArray<readonly [number, number]>, readonly solvedOg?: number, readonly solvedAa?: number, readonly fallbackAa?: number, readonly targetAbv?: number }} args
 * @returns {{ readonly oe: number, readonly ae: number }|null}
 */
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

/**
 * Convert a ray's OE/AE endpoints into an ABV interval.
 *
 * @pure
 * @param {{ readonly oeMin: number, readonly aeMin: number, readonly oeMax: number, readonly aeMax: number }|null} ray
 * @returns {[number, number]|null}
 */
function abvInterval(ray) {
  if (!ray) return null;
  const a = cutaiaAbv(ray.oeMin, ray.aeMin);
  const b = cutaiaAbv(ray.oeMax, ray.aeMax);
  return isFiniteNumber(a) && isFiniteNumber(b) ? [Math.min(a, b), Math.max(a, b)] : null;
}

/**
 * Select the plot model for the current region and batch point.
 *
 * @pure
 * @param {{ readonly region: ReadonlyArray<readonly [number, number]>, readonly point: Readonly<{ readonly oe: number, readonly ae: number }>|null, readonly safestPoint: object|null, readonly pin: string, readonly target: number|null, readonly unsolved: boolean, readonly gravity: object, readonly envelope: object|null }} args
 * @returns {object|null}
 */
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

/**
 * Bound the ABV targets reachable at the batch's attenuation.
 *
 * @pure
 * @param {{ readonly extract: Readonly<{ readonly oe: number, readonly ae: number }>|null, readonly aa: number|null, readonly region: ReadonlyArray<readonly [number, number]> }} args
 * @returns {[number, number]|null}
 */
export function abvBoundsFor({ extract, aa, region }) {
  if (!extract) return null;
  if (!isFiniteNumber(aa) || aa >= 1) return null;
  return abvInterval(raySegment(region, aa));
}

/**
 * Convert an extract point into the target readout.
 *
 * @pure
 * @param {{ readonly extract: Readonly<{ readonly oe: number, readonly ae: number }>|null }} args
 * @returns {object|null}
 */
export function targetInfoFor({ extract }) {
  if (!extract) return null;
  return targetFromExtract(extract.oe, extract.ae);
}

/**
 * Measure the target's safety margin and nearest limit.
 *
 * @pure
 * @param {{ readonly extract: Readonly<{ readonly oe: number, readonly ae: number }>|null, readonly safestPoint: Readonly<{ readonly radius: number }>|null, readonly region: ReadonlyArray<readonly [number, number]>, readonly envelope: object|null }} args
 * @returns {{ readonly safety: number|null, readonly nearest: object|null }|null}
 */
export function targetRiskFor({ extract, safestPoint, region, envelope }) {
  if (!extract || !safestPoint) return null;
  const margin = edgeMargin(region, extract.oe, extract.ae);
  const radius = safestPoint.radius;
  const safety = radius > 0 ? clamp(margin / radius, 0, 1) : null;
  const nearest = limitHeadroom(envelope, extract.oe, extract.ae);
  return { safety, nearest };
}

/**
 * Choose the explicit ABV target or the target readout's ABV.
 *
 * @pure
 * @param {number|null} target
 * @param {Readonly<{ readonly abv?: number }>|null} info
 * @returns {number|null}
 */
export function abvTargetFor(target, info) {
  if (isFiniteNumber(target)) return target;
  return info?.abv ?? null;
}

/**
 * Format the OG/FG readouts in the active gravity unit.
 *
 * @pure
 * @param {{ readonly info: Readonly<{ readonly og: number, readonly fg: number }>|null, readonly gravity: Readonly<{ readonly fromSg: (value: number) => number, readonly decimals: number, readonly symbol: string }> }} args
 * @returns {{ readonly og: string, readonly fg: string }}
 */
export function gravityReadoutsFor({ info, gravity }) {
  if (!info) return { og: "—", fg: "—" };
  const format = (value) =>
    `${formatWithDecimals(gravity.fromSg(value), gravity.decimals)} ${gravity.symbol}`;
  return { og: format(info.og), fg: format(info.fg) };
}

/**
 * Format the nearest limit's headroom.
 *
 * @pure
 * @param {{ readonly nearest: Readonly<{ readonly unit: string, readonly value: number, readonly boundary: number, readonly headroom: number, readonly label: string }>|null, readonly gravity: Readonly<{ readonly fromSg: (value: number) => number, readonly decimals: number, readonly symbol: string }> }} args
 * @returns {string}
 */
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
