// Newton cooling fit for authored curve records. Pure and host-side: the
// record keeps its raw points, and the card copies only the fitted time
// constant into the batch.

const INVALID = {
  valid: false,
  reason: "The curve has no usable cooling points.",
  kPerMin: null,
  tauMin: null,
  r2: null,
  pointCount: 0,
  ignored: 0,
};

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function invalid(reason, pointCount, ignored) {
  return { ...INVALID, reason, pointCount, ignored };
}

function usablePoints(points, ambientTempC) {
  const usable = [];
  let ignored = 0;
  for (const point of points) {
    const time = point?.time_min;
    const temp = point?.temp_c;
    if (!finite(time) || !finite(temp) || time <= 0 || temp <= ambientTempC) {
      ignored += 1;
      continue;
    }
    usable.push({ time, temp });
  }
  return { usable, ignored };
}

function strictlyIncreasing(points) {
  for (let index = 1; index < points.length; index += 1) {
    if (points[index].time <= points[index - 1].time) return false;
  }
  return true;
}

function leastSquares(points, startTempC, ambientTempC) {
  const span = startTempC - ambientTempC;
  const rows = points.map((point) => ({
    time: point.time,
    y: Math.log((point.temp - ambientTempC) / span),
  }));
  const meanTime = rows.reduce((sum, row) => sum + row.time, 0) / rows.length;
  const meanY = rows.reduce((sum, row) => sum + row.y, 0) / rows.length;
  let sxx = 0;
  let sxy = 0;
  for (const row of rows) {
    sxx += (row.time - meanTime) ** 2;
    sxy += (row.time - meanTime) * (row.y - meanY);
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = meanY - slope * meanTime;
  let residual = 0;
  let total = 0;
  for (const row of rows) {
    residual += (row.y - (intercept + slope * row.time)) ** 2;
    total += (row.y - meanY) ** 2;
  }
  return { slope, r2: total === 0 ? 0 : 1 - residual / total };
}

export function fitCoolingCurve({ startTempC, ambientTempC, points } = {}) {
  if (!finite(startTempC) || !finite(ambientTempC)) {
    return invalid("Start and ambient temperatures must be numbers.", 0, 0);
  }
  if (startTempC <= ambientTempC) {
    return invalid("Start temperature must be above ambient.", 0, 0);
  }
  if (!Array.isArray(points)) {
    return invalid("Points must be a list.", 0, 0);
  }
  const { usable, ignored } = usablePoints(points, ambientTempC);
  if (usable.length < 2) {
    return invalid("At least two points above ambient are required.", usable.length, ignored);
  }
  if (!strictlyIncreasing(usable)) {
    return invalid("Point times must be strictly increasing and unique.", usable.length, ignored);
  }
  const { slope, r2 } = leastSquares(usable, startTempC, ambientTempC);
  if (!(slope < 0)) {
    return invalid("The points do not show cooling toward ambient.", usable.length, ignored);
  }
  const kPerMin = -slope;
  if (!finite(kPerMin) || kPerMin <= 0) {
    return invalid("The fitted decay constant is not positive.", usable.length, ignored);
  }
  return {
    valid: true,
    reason: "",
    kPerMin,
    tauMin: 1 / kPerMin,
    r2,
    pointCount: usable.length,
    ignored,
  };
}

export const COOLING_R2_WARNING = 0.98;
export const COOLING_AMBIENT_WARNING_C = 5;

function segmentAt(segments, minute) {
  let found = null;
  for (const segment of segments) {
    const start = Number(segment?.start_min);
    const end = Number(segment?.end_min);
    const temp = Number(segment?.temp_c);
    if (!finite(start) || !finite(end) || !finite(temp)) continue;
    if (minute < start - 1e-9 || minute > end + 1e-9) continue;
    found = { start_min: start, temp_c: temp };
  }
  return found;
}

function ceilingEnd(segments, ambientC, kPerMin, knockoutMin) {
  if (!Array.isArray(segments) || segments.length === 0) return null;
  if (!finite(ambientC) || !finite(kPerMin) || kPerMin <= 0) return null;
  if (!finite(knockoutMin) || knockoutMin <= 0) return null;
  const last = segments[segments.length - 1];
  const end = Math.min(knockoutMin, Number(last?.end_min));
  return finite(end) && end >= 0 ? end : null;
}

export function coolingCeilingTable({
  segments,
  ambientC,
  kPerMin,
  knockoutMin,
  stepMin = 1,
} = {}) {
  const end = ceilingEnd(segments, ambientC, kPerMin, knockoutMin);
  if (end === null) return [];
  const step = finite(stepMin) && stepMin > 0 ? stepMin : 1;
  const rows = [];
  const count = Math.floor(end / step + 1e-9);
  for (let index = 0; index <= count; index += 1) {
    const minute = index * step;
    const segment = segmentAt(segments, minute);
    if (!segment) continue;
    const offset = Math.max(0, minute - segment.start_min);
    const tempC = ambientC + (segment.temp_c - ambientC) * Math.exp(-kPerMin * offset);
    rows.push({ minute, tempC });
  }
  return rows;
}

export function coolingCurveWarnings({ fit, curveAmbientC, batchAmbientC, formatTemp }) {
  const warnings = [];
  if (fit && !fit.valid) warnings.push(fit.reason);
  if (fit?.valid && fit.r2 < COOLING_R2_WARNING) {
    warnings.push(`Poor fit: R² ${fit.r2.toFixed(3)}. Check the measured points.`);
  }
  if (
    finite(curveAmbientC) &&
    finite(batchAmbientC) &&
    Math.abs(curveAmbientC - batchAmbientC) >= COOLING_AMBIENT_WARNING_C
  ) {
    warnings.push(
      `The curve was measured at ${formatTemp(curveAmbientC)}; ` +
        `the batch ambient is ${formatTemp(batchAmbientC)}.`
    );
  }
  return warnings;
}
