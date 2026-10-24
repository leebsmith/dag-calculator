import test from "node:test";
import assert from "node:assert/strict";

import { conversionSegments, predictMashAttenuation } from "../../frontend/src/views/mashAttenuation.js";

const BASE = {
  aaRef: 0.75,
  tempCoefficient: 0.029,
  refTempC: 65,
  lowC: 60,
  highC: 72,
  rampRateCPerMin: 1,
};

const rest = (restId, tempC, durationMin, enabled = true) => ({
  rest_id: restId,
  enabled,
  use_temp_c: tempC,
  duration_min: durationMin,
});

function predict(rests, overrides = {}) {
  return predictMashAttenuation({ ...BASE, rests, ...overrides });
}

test("a 60-minute rest at the reference temperature returns the yeast baseline", () => {
  const result = predict([rest("beta_alpha_amylase", 65, 60)]);
  assert.ok(Math.abs(result.aa - 0.75) < 1e-12);
  assert.equal(result.effectiveTempC, 65);
  assert.equal(result.minutes, 60);
});

test("cooler and warmer single-infusion rests move attenuation in opposite directions", () => {
  const cool = predict([rest("beta_alpha_amylase", 62, 60)]);
  const warm = predict([rest("beta_alpha_amylase", 72, 60)]);
  assert.ok(Math.abs(cool.aa - 0.75 * (1 + 0.029 * 3)) < 1e-12);
  assert.ok(Math.abs(warm.aa - 0.75 * (1 - 0.029 * 7)) < 1e-12);
  assert.ok(cool.aa > 0.75 && warm.aa < 0.75);
});

test("non-conversion rests are dropped but their ramp through the window counts", () => {
  const segments = conversionSegments(
    [rest("protein", 52, 20), rest("beta_amylase", 63, 30)],
    1,
    60,
    72
  );
  assert.equal(segments.length, 2);
  assert.equal(segments[0].temperatureC, 61.5);
  assert.equal(segments[0].minutes, 3);
  assert.equal(segments[1].temperatureC, 63);
  assert.equal(segments[1].minutes, 30);

  const result = predict([rest("protein", 52, 20), rest("beta_amylase", 63, 30)]);
  assert.ok(Math.abs(result.effectiveTempC - (3 * 61.5 + 30 * 63) / 33) < 1e-12);
});

test("ramps above the conversion window are clipped and hot rests are dropped", () => {
  const segments = conversionSegments(
    [rest("beta_amylase", 68, 20), rest("alpha_amylase", 75, 10)],
    1,
    60,
    72
  );
  assert.equal(segments.length, 2);
  assert.equal(segments[1].temperatureC, 70);
  assert.equal(segments[1].minutes, 4);
});

test("mash-out never contributes to the conversion estimate", () => {
  const without = predict([rest("beta_alpha_amylase", 67, 60)]);
  const withMashOut = predict([
    rest("beta_alpha_amylase", 67, 60),
    rest("mash_out", 76, 10),
  ]);
  assert.ok(Math.abs(withMashOut.aa - without.aa) < 1e-12);
  assert.ok(Math.abs(withMashOut.effectiveTempC - without.effectiveTempC) < 1e-12);
});

test("equal-temperature rests accumulate duration without a ramp segment", () => {
  const segments = conversionSegments(
    [rest("beta_amylase", 63, 30), rest("alpha_amylase", 63, 30)],
    1,
    60,
    72
  );
  assert.equal(segments.length, 2);
  assert.ok(segments.every((s) => s.temperatureC === 63));
});

test("input order does not change the estimate", () => {
  const forward = predict([rest("beta_amylase", 63, 30), rest("alpha_amylase", 70, 20)]);
  const reversed = predict([rest("alpha_amylase", 70, 20), rest("beta_amylase", 63, 30)]);
  assert.ok(Math.abs(forward.aa - reversed.aa) < 1e-12);
});

test("a missing duration on a conversion rest makes the estimate unresolved", () => {
  assert.equal(predict([rest("beta_alpha_amylase", 65, null)]), null);
  assert.equal(predict([rest("beta_alpha_amylase", 65, NaN)]), null);
});

test("no conversion rests or no elapsed time yields no estimate", () => {
  assert.equal(predict([]), null);
  assert.equal(predict([rest("protein", 52, 20)]), null);
  assert.equal(predict([rest("beta_alpha_amylase", 65, 0)]), null);
});

test("a missing or non-positive ramp rate makes a needed ramp unresolved", () => {
  assert.equal(predict([rest("beta_amylase", 63, 30), rest("alpha_amylase", 70, 20)], { rampRateCPerMin: 0 }), null);
  assert.equal(predict([rest("beta_amylase", 63, 30), rest("alpha_amylase", 70, 20)], { rampRateCPerMin: NaN }), null);
});

test("an invalid yeast baseline yields no estimate", () => {
  assert.equal(predict([rest("beta_alpha_amylase", 65, 60)], { aaRef: 0 }), null);
  assert.equal(predict([rest("beta_alpha_amylase", 65, 60)], { aaRef: 1.5 }), null);
});
