import test from "node:test";
import assert from "node:assert/strict";

import {
  correctObservation,
  hydrometerCorrected,
  refractometerCorrected,
} from "../../frontend/src/store/observationCorrections.js";

test("hydrometer correction is a no-op at the calibration temperature", () => {
  assert.ok(Math.abs(hydrometerCorrected(1.05, 20) - 1.05) < 1e-9);
});

test("hydrometer correction raises a hot reading and lowers a cold one", () => {
  assert.ok(hydrometerCorrected(1.05, 80) > 1.05);
  assert.ok(hydrometerCorrected(1.05, 0) < 1.05);
});

test("refractometer correction returns a plausible gravity", () => {
  const value = refractometerCorrected(6.0, 12.0);
  assert.ok(Number.isFinite(value));
  assert.ok(value > 0.95 && value < 1.1);
});

test("correctObservation keeps raw for no-correction and ATC metrics", () => {
  assert.deepEqual(
    correctObservation({ kind: "none", raw: 5.4, rawUnit: "pH" }),
    { value: 5.4, unit: "pH" }
  );
  assert.deepEqual(
    correctObservation({ kind: "instrument_atc", raw: 5.4, rawUnit: "pH" }),
    { value: 5.4, unit: "pH" }
  );
});

test("correctObservation refuses an uncorrectable metric", () => {
  assert.equal(
    correctObservation({ kind: "refractometer_alcohol", raw: 1.02, rawUnit: "SG" }),
    null
  );
});
