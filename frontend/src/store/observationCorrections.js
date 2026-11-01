// Observation corrections. These are approximations, versioned by the caller;
// the raw reading is never replaced in the log.

function waterFactor(tempF) {
  return (
    1.00130346 -
    0.000134722124 * tempF +
    0.00000204052596 * tempF * tempF -
    0.00000000232820948 * tempF * tempF * tempF
  );
}

export function hydrometerCorrected(rawSg, sampleTempC) {
  if (!Number.isFinite(rawSg) || !Number.isFinite(sampleTempC)) return null;
  const tempF = (sampleTempC * 9) / 5 + 32;
  return rawSg * (waterFactor(tempF) / waterFactor(68));
}

// Terrill's refractometer alcohol correction. `brix` is the current reading and
// `originalBrix` the wort's original Brix; the result is specific gravity.
export function refractometerCorrected(brix, originalBrix) {
  if (!Number.isFinite(brix) || !Number.isFinite(originalBrix)) return null;
  return (
    1.0 -
    0.0044993 * brix +
    0.011774 * originalBrix +
    0.00027581 * brix * brix -
    0.0012717 * originalBrix * originalBrix -
    0.00000728 * brix * brix * brix +
    0.000063293 * originalBrix * originalBrix * originalBrix
  );
}

export function correctObservation({
  kind,
  raw,
  rawUnit,
  sampleTempC,
  brix,
  originalBrix,
}) {
  if (kind === "none" || kind === "instrument_atc") {
    return { value: raw, unit: rawUnit };
  }
  if (kind === "hydrometer_temp") {
    const value = hydrometerCorrected(raw, sampleTempC);
    return value == null ? null : { value, unit: rawUnit };
  }
  if (kind === "refractometer_alcohol") {
    const value = refractometerCorrected(brix, originalBrix);
    return value == null ? null : { value, unit: "SG" };
  }
  return null;
}
