// Mash card readouts: the rest catalogue labels and recommended band, the
// canonical row defaults, and the time / thickness summaries the card prints.
// Pure `(id|row|value) => …`; the card owns unit conversion, the field models,
// and the engine refresh.

import { formatWithDecimals } from "../../utils.js";
import { CANONICAL_RESTS, MASH_OUT_REST, getCanonicalRest } from "../mash.js";

export function restDefinition(restId) {
  return getCanonicalRest(restId);
}

// An unknown id falls back to itself so the table still names its row.
export function restLabel(restId) {
  const def = getCanonicalRest(restId);
  return def ? def.name : restId;
}

export function restPurposeLabel(restId) {
  const def = getCanonicalRest(restId);
  return def ? def.purpose : "";
}

// The canon band is advice, never a gate: an id with no band, or a row with no
// temperature, is simply in range.
export function isRestOutsideBand(restId, useTempC) {
  const rest = getCanonicalRest(restId);
  if (!rest || rest.temp_min_c == null || rest.temp_max_c == null) return false;
  if (typeof useTempC !== "number" || Number.isNaN(useTempC)) return false;
  return useTempC < rest.temp_min_c || useTempC > rest.temp_max_c;
}

// Every canonical rest in schedule order: an authored row is copied as-is, and
// a missing one starts blank with mash-out enabled at its default duration.
export function materializeMashRests(rows) {
  const byId = new Map(
    (rows ?? []).filter((r) => r.rest_id !== "dough_in").map((r) => [r.rest_id, r])
  );
  const order = [...CANONICAL_RESTS.map((r) => r.rest_id), MASH_OUT_REST.rest_id];
  return order.map((id) => {
    const existing = byId.get(id);
    if (existing) return { ...existing };
    const isMashOut = id === MASH_OUT_REST.rest_id;
    return {
      rest_id: id,
      enabled: isMashOut,
      use_temp_c: null,
      duration_min: isMashOut ? MASH_OUT_REST.default_duration_min : null,
    };
  });
}

// The canon's rows joined to the authored schedule, so the card can render a
// rest the batch has not configured yet.
export function canonicalRestRows(rows) {
  const byId = new Map((rows ?? []).map((r) => [r.rest_id, r]));
  return [...CANONICAL_RESTS, MASH_OUT_REST].map((def) => {
    const row = byId.get(def.rest_id);
    return {
      ...def,
      enabled: row ? !!row.enabled : def.rest_id === MASH_OUT_REST.rest_id,
      use_temp_c: row ? row.use_temp_c : null,
      duration_min: row ? row.duration_min : null,
    };
  });
}

// A value already in its display unit, or "" when the engine has none.
export function temperatureLabel(value) {
  return Number.isFinite(value) ? formatWithDecimals(value, 1) : "";
}

export function thicknessLabel(value) {
  return Number.isFinite(value) ? formatWithDecimals(value, 2) : "";
}

// Whole display units, the way the modal prints a rest's bounds.
export function wholeTemperature(value) {
  return Number.isFinite(value) ? Math.round(value) : "";
}

export function restTempRangeLabel(min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "";
  return `${Math.round(min)}–${Math.round(max)}`;
}

// The ramp is ΔT ÷ heating rate, so the total is fractional; the readout is
// whole minutes, matching the rest durations and the report.
export function mashTimeLabel(total) {
  return Number.isFinite(total) ? String(Math.round(total)) : "";
}

export function restMinutes(total, ramp) {
  if (!Number.isFinite(total) || !Number.isFinite(ramp)) return total;
  return Math.max(0, total - ramp);
}

export function mashTimeSummaryLabel(ramp, rests) {
  if (!Number.isFinite(ramp) || !Number.isFinite(rests)) return "";
  return `incl. ${Math.round(ramp)} min ramp (${Math.round(rests)} min rests)`;
}

export function isLgrBelowFloor(thickness, minimum) {
  return Number.isFinite(thickness) && Number.isFinite(minimum) && thickness < minimum;
}

export function lgrSummary(thickness, unit, minimum) {
  if (!thickness) return "";
  return minimum
    ? `Mash thickness ${thickness} ${unit} · equipment minimum ${minimum} ${unit}`
    : `Mash thickness ${thickness} ${unit}`;
}
