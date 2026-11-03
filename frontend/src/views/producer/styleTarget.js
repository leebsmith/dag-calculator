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
import { statusFor } from "../../engine/styleConformance.js";
import { formatWithDecimals, isFiniteNumber } from "../../utils.js";
import { gravityDisplay } from "./gravityDisplay.js";

// The pin's own unit: ABV is free percent, OG/FG are the gravity display unit.
export const SCALE_PINS = [
  { value: "abv", label: "ABV" },
  { value: "og", label: "OG" },
  { value: "fg", label: "FG" },
];

export function scaleTargetLabel(pin, value, gravity = gravityDisplay("SG")) {
  return pin === "abv"
    ? `${formatWithDecimals(value, 1)}%`
    : `${formatWithDecimals(gravity.fromSg(value), gravity.decimals)} ${gravity.symbol}`;
}

// The style sliders may move two just-noticeable differences beyond the envelope:
// enough for a deliberate deviation, and still on the assessor's scale so the note
// can name the band the score will use. Scoring itself is unchanged — it grades
// the realized value against the absolute envelope.
export const ALLOWANCE_JND = 2;

export function allowanceBounds(bounds, tau) {
  if (!Array.isArray(bounds) || !isFiniteNumber(tau)) return null;
  const [low, high] = bounds;
  if (!isFiniteNumber(low) || !isFiniteNumber(high)) return null;
  return [Math.max(0, low - ALLOWANCE_JND * tau), high + ALLOWANCE_JND * tau];
}

export function targetDrift(value, bounds, tau, { unit, decimals, toDisplay } = {}) {
  if (!Array.isArray(bounds) || !isFiniteNumber(value)) return { outside: false, text: "" };
  const drift = statusFor(value, bounds[0], bounds[1], tau);
  if (drift.status === "within") return { outside: false, text: "" };
  const direction = value < bounds[0] ? "below" : "above";
  const shown = typeof toDisplay === "function" ? toDisplay(drift.deviation) : drift.deviation;
  return {
    outside: true,
    text: `${formatWithDecimals(shown, decimals)} ${unit} ${direction} style — ${drift.status}`,
  };
}

// Reactive mirrors of the active pin, its target root, and the target itself.
// `gravity` is the display context; the stored target stays SG.
export function scalePinState({ pin, root, value, gravity = gravityDisplay("SG") } = {}) {
  const label = SCALE_PINS.find((entry) => entry.value === pin)?.label ?? "ABV";
  const known = isFiniteNumber(value);
  return {
    scalePin: pin,
    scalePinLabel: label,
    activeScaleTargetRoot: root,
    activeScaleTarget: known ? value : null,
    activeScaleTargetLabel: `Target ${label}`,
    activeScaleTargetUnit: pin === "abv" ? "%" : gravity.symbol,
    activeScaleTargetStep: pin === "abv" ? "0.1" : gravity.step,
    activeScaleTargetDisplay: known
      ? pin === "abv"
        ? formatWithDecimals(value, 1)
        : formatWithDecimals(gravity.fromSg(value), gravity.decimals)
      : "",
  };
}

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

// A pinned target the solve missed by more than the pin's display tolerance.
export function scaleTargetMismatch({
  pin,
  target,
  info,
  status = "unknown",
  gravity = gravityDisplay("SG"),
} = {}) {
  if (target == null || !info) return "";
  const realized = pin === "abv" ? info.abv : pin === "og" ? info.og : info.fg;
  const tolerance = pin === "abv" ? 0.15 : 0.002;
  if (!Number.isFinite(realized) || Math.abs(realized - target) <= tolerance) return "";
  return (
    `Target ${scaleTargetLabel(pin, target, gravity)} vs realized ` +
    `${scaleTargetLabel(pin, realized, gravity)} — solve ${status}.`
  );
}
