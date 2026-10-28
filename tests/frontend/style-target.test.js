import test from "node:test";
import assert from "node:assert/strict";

import {
  SCALE_PINS,
  scalePinState,
  scaleTargetMismatch,
  styleExtractPoint,
  styleRegionState,
} from "../../frontend/src/views/producer/styleTarget.js";

const ENVELOPE = {
  ogMin: 1.056,
  ogMax: 1.075,
  fgMin: 1.01,
  fgMax: 1.018,
  abvMin: 5.5,
  abvMax: 7.5,
};

test("styleTarget: the pin mirrors follow the pin's unit", () => {
  assert.deepEqual(
    SCALE_PINS.map((pin) => pin.value),
    ["abv", "og", "fg"]
  );

  const abv = scalePinState({ pin: "abv", root: "batch.target_abv", value: 6.04 });
  assert.equal(abv.scalePinLabel, "ABV");
  assert.equal(abv.activeScaleTarget, 6.04);
  assert.equal(abv.activeScaleTargetLabel, "Target ABV");
  assert.equal(abv.activeScaleTargetUnit, "%");
  assert.equal(abv.activeScaleTargetStep, "0.1");
  assert.equal(abv.activeScaleTargetDisplay, "6.0");

  const og = scalePinState({ pin: "og", root: "batch.target_og", value: 1.0616 });
  assert.equal(og.activeScaleTargetUnit, "SG");
  assert.equal(og.activeScaleTargetStep, "0.001");
  assert.equal(og.activeScaleTargetDisplay, "1.062");
});

test("styleTarget: an unset target reads as empty, and the root passes through", () => {
  const state = scalePinState({ pin: "fg", root: "batch.target_fg", value: undefined });
  assert.equal(state.activeScaleTargetRoot, "batch.target_fg");
  assert.equal(state.activeScaleTarget, null);
  assert.equal(state.activeScaleTargetDisplay, "");
  assert.equal(state.activeScaleTargetLabel, "Target FG");
});

test("styleTarget: an incomplete envelope has no region", () => {
  const state = styleRegionState({ ...ENVELOPE, ogMax: undefined });
  assert.equal(state.styleEnvelope, null);
  assert.deepEqual(state.styleRegion, []);
  assert.equal(state.styleSafestPoint, null);
});

test("styleTarget: a complete envelope has a region and a safest point", () => {
  const state = styleRegionState(ENVELOPE);
  assert.deepEqual(state.styleEnvelope, ENVELOPE);
  assert.ok(state.styleRegion.length >= 3);
  assert.ok(state.styleSafestPoint.radius > 0);
});

test("styleTarget: the solved batch is the extract point", () => {
  const { styleRegion } = styleRegionState(ENVELOPE);
  const point = styleExtractPoint({
    region: styleRegion,
    solvedOg: 1.062,
    solvedAa: 0.75,
    targetAbv: 6.5,
  });
  assert.ok(point.oe > 0);
  assert.ok(Math.abs(point.ae - point.oe * 0.25) < 1e-9);
});

test("styleTarget: a pre-solve batch falls back to the target inverse", () => {
  const { styleRegion } = styleRegionState(ENVELOPE);
  const preSolve = styleExtractPoint({
    region: styleRegion,
    fallbackAa: 0.75,
    targetAbv: 6.5,
  });
  assert.ok(preSolve);
  assert.ok(Math.abs(preSolve.ae - preSolve.oe * 0.25) < 1e-9);
});

test("styleTarget: an off-region target falls back inside the region", () => {
  const { styleRegion } = styleRegionState(ENVELOPE);
  const point = styleExtractPoint({
    region: styleRegion,
    fallbackAa: 0.95,
    targetAbv: 7.0,
  });
  assert.ok(point);
  assert.ok(point.ae < point.oe);
  assert.ok(point.oe > ENVELOPE.ogMin - 0.1);
});

test("styleTarget: the mismatch line speaks the pin's unit", () => {
  const info = { og: 1.062, fg: 1.014, abv: 6.4 };
  assert.equal(scaleTargetMismatch({ pin: "abv", target: 6.4, info }), "");
  assert.equal(
    scaleTargetMismatch({ pin: "abv", target: 6.0, info, status: "ok" }),
    "Target 6.0% vs realized 6.4% — solve ok."
  );
  assert.equal(
    scaleTargetMismatch({ pin: "og", target: 1.067, info, status: "stale" }),
    "Target 1.067 vs realized 1.062 — solve stale."
  );
  assert.equal(scaleTargetMismatch({ pin: "og", target: 1.0625, info }), "");
  assert.equal(scaleTargetMismatch({ pin: "abv", target: 6.0, info: null }), "");
  assert.equal(scaleTargetMismatch({ pin: "abv", target: null, info }), "");
});
