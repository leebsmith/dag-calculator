// Late-addition scale previews: the sugar card's pin matrix and the caption
// under it. Pure over the resolved preview rows; the card owns the engine read,
// the active pin, and the dose's display unit.

import {
  scaleEnvelopeClass,
  scaleEnvelopeState,
  scalePinLabel,
} from "./lateAdditionRows.js";
import {
  formatGravity,
  formatPercent,
  formatPercentRange,
  formatWithDecimals,
  isFiniteNumber,
} from "../../utils.js";

const DASH = "—";

export function scalePreviewRows({ rows, style, pin } = {}) {
  const bounds = style ?? {};
  return (rows ?? []).map((row) => {
    const ogState = row.ok
      ? scaleEnvelopeState(row.og, bounds.og_min, bounds.og_max)
      : "out";
    const fgState = row.ok
      ? scaleEnvelopeState(row.fg, bounds.fg_min, bounds.fg_max)
      : "out";
    const abvState = row.ok
      ? scaleEnvelopeState(row.abv, bounds.abv_min, bounds.abv_max)
      : "out";
    return {
      pin: row.pin,
      pinLabel: scalePinLabel(row.pin),
      active: row.pin === pin,
      ok: row.ok === true,
      statusLabel: row.ok ? "" : row.reason || "unreachable",
      ogDisplay: row.ok ? formatGravity(row.og) : DASH,
      fgDisplay: row.ok ? formatGravity(row.fg) : DASH,
      abvDisplay: row.ok ? formatWithDecimals(row.abv, 1) : DASH,
      shareValue: row.ok ? row.sugar_extract_share : null,
      shareDisplay: row.ok ? formatPercent(row.sugar_extract_share, 1) : DASH,
      ogClass: scaleEnvelopeClass(ogState),
      fgClass: scaleEnvelopeClass(fgState),
      abvClass: scaleEnvelopeClass(abvState),
    };
  });
}

// The caption names the held quantity in the mode's own terms: the authored
// share, or the dose in the sugar table's display unit (`doseLabel`) plus the
// reachable share span.
export function scalePreviewCaption({ intent, share, doseLabel = "", rows } = {}) {
  if (intent === "share") {
    return `Previews hold ${formatPercent(Number(share) || 0, 1)} of extract`;
  }
  const shares = (rows ?? [])
    .map((row) => row.shareValue)
    .filter((value) => isFiniteNumber(value));
  const span = shares.length
    ? ` · ${formatPercentRange(Math.min(...shares), Math.max(...shares))} of extract`
    : "";
  return `Previews hold ${doseLabel} sugar extract${span}`;
}

export function scalePreviewState({ rows, style, pin, intent, share, doseLabel } = {}) {
  const previewRows = scalePreviewRows({ rows, style, pin });
  return {
    rows: previewRows,
    caption: scalePreviewCaption({ intent, share, doseLabel, rows: previewRows }),
  };
}
