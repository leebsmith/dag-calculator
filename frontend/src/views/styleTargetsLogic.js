// Pure style-target helpers: the scale-pin mirrors, the envelope allowance
// bounds, the SRM/IBU drift readouts, and the planned bitterness figures. The
// card adapter owns the engine reads and reactive mirrors; nothing here uses
// `this` or reads app state.

import { TAU, statusFor } from "../engine/styleConformance.js";
import {
  bitternessRatio,
  boundsOf,
  formatRange,
  formatWithDecimals,
  isFiniteNumber,
  toPercentValue,
} from "../utils.js";
import { displayValue } from "./producer.js";
import { gravityDisplay } from "./producer/gravityDisplay.js";

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

export function styleBounds(fieldsById, minId, maxId) {
  return boundsOf(fieldsById, minId, maxId);
}

export function srmSliderBounds(bounds) {
  return allowanceBounds(bounds, TAU.srm);
}

export function ibuSliderBounds(bounds) {
  return allowanceBounds(bounds, TAU.ibu);
}

export function srmHint({ field, bounds, artifact, nl }) {
  if (!field?.unitId || !bounds) return "";
  const format = (value) =>
    formatWithDecimals(
      displayValue(artifact, "beer_color", field.unitId, value, nl),
      field.decimals
    );
  return `Style ${formatRange(bounds[0], bounds[1], format)} ${field.unit}`;
}

export function srmDisplay({ field, target, artifact, nl }) {
  if (!field?.unitId) return "";
  const shown = displayValue(artifact, "beer_color", field.unitId, target, nl);
  return `${formatWithDecimals(shown, field.decimals)} ${field.unit}`;
}

// A colour deviation converts like a value because every colour unit is
// linear; the exact factor comes from the artifact, not from a constant.
export function srmDeltaScale({ field, artifact, nl }) {
  const value = (base) =>
    field?.unitId ? displayValue(artifact, "beer_color", field.unitId, base, nl) : base;
  const scale = value(1) - value(0);
  return (deviation) => deviation * scale;
}

export function srmDrift({ target, bounds, field, toDisplay }) {
  return targetDrift(target, bounds, TAU.srm, {
    unit: field.unit,
    decimals: field.decimals,
    toDisplay,
  });
}

export function ibuDrift({ target, bounds }) {
  return targetDrift(target, bounds, TAU.ibu, { unit: "IBU", decimals: 0 });
}

export function plannedIbuGu(targetIbu, og) {
  return bitternessRatio(targetIbu, og);
}

export function formatIbuGu(value) {
  return formatWithDecimals(value, 2, { dash: "—" });
}

export function whirlpoolPercent(fraction) {
  return typeof fraction === "number" ? toPercentValue(fraction, 0) : 0;
}

export function formatIbu(value) {
  return typeof value === "number" ? formatWithDecimals(value, 1) : "—";
}
