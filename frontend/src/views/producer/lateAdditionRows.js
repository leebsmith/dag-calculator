// Late-addition card readouts: the sugar table counter, the dose-effect block,
// and the scale-preview pins. Pure `(value|row) => string`; the card owns the
// engine reads, the display unit, and the refresh snapshot.

import {
  countLabel,
  formatPercent,
  formatWithDecimals,
  resultCounter,
} from "../../utils.js";

export const LATE_SCALE_PINS = [
  { value: "abv", label: "ABV" },
  { value: "og", label: "OG" },
  { value: "fg", label: "FG" },
];

export function sugarActive({ rows, intent, share } = {}) {
  const list = rows ?? [];
  if (!list.length) return false;
  if (intent === "share") {
    return (Number(share) || 0) > 0 && list.some((row) => (Number(row.parts) || 0) > 0);
  }
  return list.some((row) => (Number(row.mass_kg) || 0) > 0);
}

export function sugarTableCountLabel(count) {
  return count ? countLabel(count, "sugar") : "No sugars";
}

export function sugarCatalogCountLabel({ shown, total, truncated }) {
  return resultCounter({
    shown,
    total,
    noun: "sugar",
    truncated,
    truncatedHint: "refine search",
  });
}

// Templates bind these strings, so they are built once per refresh. A getter
// that reads the engine directly registers no Alpine dependency and never
// re-runs after its first read.
export function sugarEffectLabels(effect) {
  if (!effect?.active) return null;
  const signed = (value, decimals, suffix = "") =>
    `${value >= 0 ? "+" : ""}${formatWithDecimals(value, decimals)}${suffix}`;
  return {
    share: formatPercent(effect.share),
    og: signed(effect.ogPoints, 3),
    fg: "+0.000",
    abv: signed(effect.abvPoints, 2, "%"),
    grist:
      effect.gristKg == null ? "—" : `${formatWithDecimals(effect.gristKg, 2)} kg`,
  };
}

// The sugar table quotes a mass in its own display unit, not the canonical kg,
// so a caption or draft badge agrees with the column beside it.
export function columnValueLabel(shown, column, fallbackDecimals = null) {
  return `${formatWithDecimals(shown, column?.decimals ?? fallbackDecimals)}${
    column?.unit ? " " + column.unit : ""
  }`;
}

export function scaleEnvelopeState(value, min, max) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    typeof min !== "number" ||
    typeof max !== "number"
  ) {
    return "na";
  }
  return value >= min && value <= max ? "in" : "out";
}

export function scaleEnvelopeClass(state) {
  if (state === "out") return "text-danger";
  if (state === "in") return "status-badge-success";
  return "";
}

export function scalePinLabel(pin) {
  return LATE_SCALE_PINS.find((entry) => entry.value === pin)?.label ?? pin;
}
