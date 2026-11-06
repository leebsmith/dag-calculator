import test from "node:test";
import assert from "node:assert/strict";

import {
  COOLING_AMBIENT_WARNING_C,
  coolingCeilingTable,
  coolingCurveWarnings,
  fitCoolingCurve,
} from "../../frontend/src/views/coolingCurve.js";

const START = 100;
const AMBIENT = 20;
const SPAN = START - AMBIENT;

function newtonPoints(kPerMin, times, noise = []) {
  return times.map((time, index) => ({
    time_min: time,
    temp_c: AMBIENT + SPAN * Math.exp(-kPerMin * time) + (noise[index] ?? 0),
  }));
}

test("an exact Newton curve recovers k and tau", () => {
  const fit = fitCoolingCurve({
    startTempC: START,
    ambientTempC: AMBIENT,
    points: newtonPoints(0.02, [5, 10, 15, 20]),
  });

  assert.equal(fit.valid, true);
  assert.ok(Math.abs(fit.kPerMin - 0.02) < 1e-9, `k=${fit.kPerMin}`);
  assert.ok(Math.abs(fit.tauMin - 50) < 1e-6, `tau=${fit.tauMin}`);
  assert.equal(fit.pointCount, 4);
  assert.equal(fit.ignored, 0);
  assert.ok(fit.r2 > 0.999999, `r2=${fit.r2}`);
});

test("a noisy curve recovers k within tolerance", () => {
  const fit = fitCoolingCurve({
    startTempC: START,
    ambientTempC: AMBIENT,
    points: newtonPoints(0.02, [5, 10, 15, 20, 25, 30], [0.2, -0.3, 0.1, -0.2, 0.3, -0.1]),
  });

  assert.equal(fit.valid, true);
  assert.ok(Math.abs(fit.kPerMin - 0.02) / 0.02 < 0.01, `k=${fit.kPerMin}`);
});

test("fewer than two usable points is invalid", () => {
  const fit = fitCoolingCurve({
    startTempC: START,
    ambientTempC: AMBIENT,
    points: [{ time_min: 10, temp_c: 80 }],
  });

  assert.equal(fit.valid, false);
  assert.match(fit.reason, /two points/);
  assert.equal(fit.kPerMin, null);
});

test("points at or below ambient are ignored, not fitted", () => {
  const fit = fitCoolingCurve({
    startTempC: START,
    ambientTempC: AMBIENT,
    points: [
      { time_min: 5, temp_c: 80 },
      { time_min: 10, temp_c: AMBIENT },
      { time_min: 15, temp_c: 60 },
    ],
  });

  assert.equal(fit.valid, true);
  assert.equal(fit.ignored, 1);
  assert.equal(fit.pointCount, 2);

  const none = fitCoolingCurve({
    startTempC: START,
    ambientTempC: AMBIENT,
    points: [
      { time_min: 5, temp_c: AMBIENT - 1 },
      { time_min: 10, temp_c: AMBIENT - 2 },
    ],
  });
  assert.equal(none.valid, false);
});

test("non-increasing or duplicate times are rejected", () => {
  const fit = fitCoolingCurve({
    startTempC: START,
    ambientTempC: AMBIENT,
    points: [
      { time_min: 15, temp_c: 70 },
      { time_min: 10, temp_c: 80 },
    ],
  });

  assert.equal(fit.valid, false);
  assert.match(fit.reason, /strictly increasing/);
});

test("a non-positive slope is rejected", () => {
  const fit = fitCoolingCurve({
    startTempC: START,
    ambientTempC: AMBIENT,
    points: [
      { time_min: 5, temp_c: 70 },
      { time_min: 10, temp_c: 80 },
    ],
  });

  assert.equal(fit.valid, false);
  assert.match(fit.reason, /do not show cooling/);
});

test("start and ambient must be finite and start above ambient", () => {
  assert.equal(
    fitCoolingCurve({ startTempC: AMBIENT, ambientTempC: AMBIENT, points: [] }).valid,
    false
  );
  assert.equal(
    fitCoolingCurve({ startTempC: START, ambientTempC: AMBIENT, points: null }).valid,
    false
  );
  assert.equal(
    fitCoolingCurve({ startTempC: Number.NaN, ambientTempC: AMBIENT, points: [] }).valid,
    false
  );
});

test("the cooling ceiling samples the returned segments", () => {
  const segments = [
    { start_min: 0, end_min: 10, temp_c: 99 },
    { start_min: 10, end_min: 30, temp_c: 76.7 },
  ];
  const rows = coolingCeilingTable({
    segments,
    ambientC: AMBIENT,
    kPerMin: 1 / 108.7,
    knockoutMin: 30,
  });

  assert.equal(rows.length, 31);
  assert.equal(rows[0].minute, 0);
  assert.equal(rows[0].tempC, 99);
  assert.equal(rows[10].tempC, 76.7);
  assert.ok(
    Math.abs(rows[5].tempC - (AMBIENT + 79 * Math.exp(-5 / 108.7))) < 1e-9,
    `temp=${rows[5].tempC}`
  );
  assert.equal(rows.at(-1).minute, 30);
});

test("the cooling ceiling needs usable segments and cooling inputs", () => {
  assert.deepEqual(
    coolingCeilingTable({ segments: [], ambientC: AMBIENT, kPerMin: 0.01, knockoutMin: 30 }),
    []
  );
  assert.deepEqual(
    coolingCeilingTable({
      segments: [{ start_min: 0, end_min: 30, temp_c: 99 }],
      ambientC: AMBIENT,
      kPerMin: 0,
      knockoutMin: 30,
    }),
    []
  );
  assert.deepEqual(
    coolingCeilingTable({
      segments: [{ start_min: 0, end_min: 30, temp_c: 99 }],
      ambientC: AMBIENT,
      kPerMin: 0.01,
      knockoutMin: 0,
    }),
    []
  );
});

test("R² reflects a poor fit", () => {
  const fit = fitCoolingCurve({
    startTempC: START,
    ambientTempC: AMBIENT,
    points: [80, 70, 79, 60].map((temp, index) => ({
      time_min: (index + 1) * 5,
      temp_c: temp,
    })),
  });

  assert.equal(fit.valid, true);
  assert.ok(fit.r2 < 0.98, `r2=${fit.r2}`);
});

test("warnings cover poor fits and material ambient differences", () => {
  const fit = fitCoolingCurve({
    startTempC: START,
    ambientTempC: AMBIENT,
    points: [80, 70, 79, 60].map((temp, index) => ({
      time_min: (index + 1) * 5,
      temp_c: temp,
    })),
  });
  const warnings = coolingCurveWarnings({
    fit,
    curveAmbientC: AMBIENT,
    batchAmbientC: AMBIENT + COOLING_AMBIENT_WARNING_C,
    formatTemp: (value) => `${value} °C`,
  });

  assert.ok(warnings.some((warning) => warning.includes("Poor fit")));
  assert.ok(warnings.some((warning) => warning.includes("measured at")));
});
