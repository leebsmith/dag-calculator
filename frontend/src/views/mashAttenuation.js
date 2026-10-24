import { canonicalOrderIndex } from "./mash.js";

const NON_CONVERSION_RESTS = new Set(["mash_out", "dough_in"]);

function isTemperature(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isDuration(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function conversionSegments(rests, rampRateCPerMin, lowC, highC) {
  const rate = Number(rampRateCPerMin);
  const low = Number(lowC);
  const high = Number(highC);
  if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) return null;

  const ordered = (rests || [])
    .filter(
      (rest) =>
        rest &&
        rest.enabled &&
        !NON_CONVERSION_RESTS.has(rest.rest_id) &&
        isTemperature(rest.use_temp_c)
    )
    .sort(
      (a, b) =>
        a.use_temp_c - b.use_temp_c ||
        canonicalOrderIndex(a.rest_id) - canonicalOrderIndex(b.rest_id)
    );

  const segments = [];
  for (let i = 0; i < ordered.length; i += 1) {
    const rest = ordered[i];
    const tempC = rest.use_temp_c;
    if (tempC >= low && tempC <= high) {
      if (!isDuration(rest.duration_min)) return null;
      if (rest.duration_min > 0) segments.push({ temperatureC: tempC, minutes: rest.duration_min });
    }

    const next = ordered[i + 1];
    if (!next) continue;
    const from = Math.max(tempC, low);
    const to = Math.min(next.use_temp_c, high);
    if (to <= from) continue;
    if (!Number.isFinite(rate) || rate <= 0) return null;
    segments.push({ temperatureC: (from + to) / 2, minutes: (to - from) / rate });
  }

  return segments;
}

export function predictMashAttenuation({
  rests,
  rampRateCPerMin,
  aaRef,
  tempCoefficient,
  refTempC,
  lowC,
  highC,
}) {
  const reference = Number(aaRef);
  const coefficient = Number(tempCoefficient);
  const referenceTempC = Number(refTempC);
  if (!(reference > 0 && reference <= 1)) return null;
  if (!Number.isFinite(coefficient) || !Number.isFinite(referenceTempC)) return null;

  const segments = conversionSegments(rests, rampRateCPerMin, lowC, highC);
  if (!segments || segments.length === 0) return null;

  let minutes = 0;
  let weighted = 0;
  for (const segment of segments) {
    minutes += segment.minutes;
    weighted += segment.temperatureC * segment.minutes;
  }
  if (!(minutes > 0)) return null;

  const effectiveTempC = weighted / minutes;
  const factor = 1 - coefficient * (effectiveTempC - referenceTempC);
  const aa = Math.max(0, Math.min(1, reference * factor));
  return { aa, effectiveTempC, minutes, delta: aa - reference };
}
