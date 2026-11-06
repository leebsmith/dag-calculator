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

/**
 * Format a scale-pin target in the pin's display unit.
 *
 * @pure
 * @param {string} pin
 * @param {number} value
 * @param {Readonly<{ fromSg: (value: number) => number, decimals: number, symbol: string }>} [gravity]
 * @returns {string}
 */
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

/**
 * Widen an envelope by the slider's allowed just-noticeable differences.
 *
 * @pure
 * @param {ReadonlyArray<number>|null} bounds
 * @param {number} tau
 * @returns {[number, number]|null}
 */
export function allowanceBounds(bounds, tau) {
  if (!Array.isArray(bounds) || !isFiniteNumber(tau)) return null;
  const [low, high] = bounds;
  if (!isFiniteNumber(low) || !isFiniteNumber(high)) return null;
  return [Math.max(0, low - ALLOWANCE_JND * tau), high + ALLOWANCE_JND * tau];
}

/**
 * Describe how far a target sits outside its style envelope.
 *
 * @pure
 * @param {number|null} value
 * @param {ReadonlyArray<number>|null} bounds
 * @param {number} tau
 * @param {{ readonly unit?: string, readonly decimals?: number, readonly toDisplay?: (deviation: number) => number }} [options]
 * @returns {{ readonly outside: boolean, readonly text: string }}
 */
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
/**
 * Build the reactive mirrors for the active scale pin and its target.
 *
 * @pure
 * @param {{ readonly pin?: string, readonly root?: string, readonly value?: number|null, readonly gravity?: Readonly<{ fromSg: (value: number) => number, decimals: number, symbol: string, step: string }> }} [options]
 * @returns {Readonly<Record<string, string|number|boolean|null>>}
 */
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
/**
 * Describe a pinned target the solve missed by more than the display tolerance.
 *
 * @pure
 * @param {{ readonly pin?: string, readonly target?: number|null, readonly info?: Readonly<{ readonly abv?: number, readonly og?: number, readonly fg?: number }>|null, readonly status?: string, readonly gravity?: Readonly<{ fromSg: (value: number) => number, decimals: number, symbol: string }> }} [options]
 * @returns {string}
 */
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

/**
 * Resolve a style envelope's numeric bounds from its projected fields.
 *
 * @pure
 * @param {Readonly<Record<string, { readonly value?: number }>>} fieldsById
 * @param {string} minId
 * @param {string} maxId
 * @returns {[number, number]|null}
 */
export function styleBounds(fieldsById, minId, maxId) {
  return boundsOf(fieldsById, minId, maxId);
}

/**
 * Widen the colour envelope to the slider range.
 *
 * @pure
 * @param {ReadonlyArray<number>|null} bounds
 * @returns {[number, number]|null}
 */
export function srmSliderBounds(bounds) {
  return allowanceBounds(bounds, TAU.srm);
}

/**
 * Widen the bitterness envelope to the slider range.
 *
 * @pure
 * @param {ReadonlyArray<number>|null} bounds
 * @returns {[number, number]|null}
 */
export function ibuSliderBounds(bounds) {
  return allowanceBounds(bounds, TAU.ibu);
}

/**
 * Format the style's colour range in the target field's display unit.
 *
 * @pure
 * @param {{ readonly field: Readonly<{ readonly unitId?: string, readonly decimals?: number, readonly unit?: string }>|null, readonly bounds: ReadonlyArray<number>|null, readonly artifact: object, readonly nl: object }} args
 * @returns {string}
 */
export function srmHint({ field, bounds, artifact, nl }) {
  if (!field?.unitId || !bounds) return "";
  const format = (value) =>
    formatWithDecimals(
      displayValue(artifact, "beer_color", field.unitId, value, nl),
      field.decimals
    );
  return `Style ${formatRange(bounds[0], bounds[1], format)} ${field.unit}`;
}

/**
 * Format the colour target in the target field's display unit.
 *
 * @pure
 * @param {{ readonly field: Readonly<{ readonly unitId?: string, readonly decimals?: number, readonly unit?: string }>|null, readonly target: number, readonly artifact: object, readonly nl: object }} args
 * @returns {string}
 */
export function srmDisplay({ field, target, artifact, nl }) {
  if (!field?.unitId) return "";
  const shown = displayValue(artifact, "beer_color", field.unitId, target, nl);
  return `${formatWithDecimals(shown, field.decimals)} ${field.unit}`;
}

// A colour deviation converts like a value because every colour unit is
// linear; the exact factor comes from the artifact, not from a constant.
/**
 * Build the colour-unit scale for converting a deviation.
 *
 * @pure
 * @param {{ readonly field: Readonly<{ readonly unitId?: string }>|null, readonly artifact: object, readonly nl: object }} args
 * @returns {(deviation: number) => number}
 */
export function srmDeltaScale({ field, artifact, nl }) {
  const value = (base) =>
    field?.unitId ? displayValue(artifact, "beer_color", field.unitId, base, nl) : base;
  const scale = value(1) - value(0);
  return (deviation) => deviation * scale;
}

/**
 * Describe the colour target's drift from the style envelope.
 *
 * @pure
 * @param {{ readonly target: number, readonly bounds: ReadonlyArray<number>|null, readonly field: Readonly<{ readonly unit: string, readonly decimals: number }>, readonly toDisplay: (deviation: number) => number }} args
 * @returns {{ readonly outside: boolean, readonly text: string }}
 */
export function srmDrift({ target, bounds, field, toDisplay }) {
  return targetDrift(target, bounds, TAU.srm, {
    unit: field.unit,
    decimals: field.decimals,
    toDisplay,
  });
}

/**
 * Describe the bitterness target's drift from the style envelope.
 *
 * @pure
 * @param {{ readonly target: number, readonly bounds: ReadonlyArray<number>|null }} args
 * @returns {{ readonly outside: boolean, readonly text: string }}
 */
export function ibuDrift({ target, bounds }) {
  return targetDrift(target, bounds, TAU.ibu, { unit: "IBU", decimals: 0 });
}

/**
 * Planned bitterness balance.
 *
 * @pure
 * @param {number|null} targetIbu
 * @param {number|null} og
 * @returns {number|null}
 */
export function plannedIbuGu(targetIbu, og) {
  return bitternessRatio(targetIbu, og);
}

/**
 * Format the planned bitterness balance.
 *
 * @pure
 * @param {number|null} value
 * @returns {string}
 */
export function formatIbuGu(value) {
  return formatWithDecimals(value, 2, { dash: "—" });
}

/**
 * Convert a whirlpool fraction to a whole percentage.
 *
 * @pure
 * @param {number|null} fraction
 * @returns {number}
 */
export function whirlpoolPercent(fraction) {
  return typeof fraction === "number" ? toPercentValue(fraction, 0) : 0;
}

/**
 * Format an IBU figure.
 *
 * @pure
 * @param {number|null} value
 * @returns {string}
 */
export function formatIbu(value) {
  return typeof value === "number" ? formatWithDecimals(value, 1) : "—";
}
