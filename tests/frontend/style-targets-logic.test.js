import test from "node:test";
import assert from "node:assert/strict";

import {
  allowanceBounds,
  formatIbu,
  formatIbuGu,
  ibuDrift,
  ibuSliderBounds,
  plannedIbuGu,
  scalePinState,
  scaleTargetLabel,
  scaleTargetMismatch,
  srmDeltaScale,
  srmDisplay,
  srmDrift,
  srmHint,
  srmSliderBounds,
  styleBounds,
  targetDrift,
  whirlpoolPercent,
} from "../../frontend/src/views/styleTargetsLogic.js";

const GRAVITY = {
  fromSg: (value) => (value - 1) * 1000,
  decimals: 1,
  symbol: "°P",
  step: "0.1",
};

const ARTIFACT = {
  dimensions: {
    beer_color: {
      base_unit: "SRM",
      kind: "linear",
      units: { EBC: { factor: 0.5 } },
    },
  },
};

const COLOR_FIELD = { unitId: "EBC", decimals: 1, unit: "EBC" };

test("scaleTargetLabel formats ABV and gravity targets in their own units", () => {
  assert.equal(scaleTargetLabel("abv", 6.04), "6.0%");
  assert.equal(scaleTargetLabel("og", 1.0616, GRAVITY), "61.6 °P");
});

test("allowanceBounds widens both ends and rejects unusable inputs", () => {
  assert.deepEqual(allowanceBounds([6, 14], 1.5), [3, 17]);
  assert.equal(allowanceBounds([6, 14], null), null);
  assert.equal(allowanceBounds(null, 1.5), null);
});

test("targetDrift describes the direction, display deviation, and status", () => {
  assert.deepEqual(
    targetDrift(2, [6, 14], 1.5, {
      unit: "EBC",
      decimals: 1,
      toDisplay: (deviation) => deviation * 2,
    }),
    { outside: true, text: "8.0 EBC below style — severe" }
  );
  assert.deepEqual(targetDrift(10, [6, 14], 1.5, { unit: "EBC", decimals: 1 }), {
    outside: false,
    text: "",
  });
  assert.deepEqual(targetDrift(20, [6, 14], 1.5, { unit: "EBC", decimals: 1 }), {
    outside: true,
    text: "6.0 EBC above style — severe",
  });
});

test("scalePinState mirrors the active pin, root, target, and display unit", () => {
  assert.deepEqual(
    scalePinState({
      pin: "og",
      root: "batch.target_og",
      value: 1.0616,
      gravity: GRAVITY,
    }),
    {
      scalePin: "og",
      scalePinLabel: "OG",
      activeScaleTargetRoot: "batch.target_og",
      activeScaleTarget: 1.0616,
      activeScaleTargetLabel: "Target OG",
      activeScaleTargetUnit: "°P",
      activeScaleTargetStep: "0.1",
      activeScaleTargetDisplay: "61.6",
    }
  );
  assert.equal(
    scalePinState({ pin: "fg", root: "batch.target_fg", value: undefined, gravity: GRAVITY })
      .activeScaleTarget,
    null
  );
});

test("scaleTargetMismatch names the pin's display unit and solve status", () => {
  const info = { og: 1.062, fg: 1.014, abv: 6.4 };
  assert.equal(
    scaleTargetMismatch({ pin: "abv", target: 6.0, info, status: "ok" }),
    "Target 6.0% vs realized 6.4% — solve ok."
  );
  assert.equal(
    scaleTargetMismatch({ pin: "og", target: 1.067, info, status: "stale", gravity: GRAVITY }),
    "Target 67.0 °P vs realized 62.0 °P — solve stale."
  );
  assert.equal(scaleTargetMismatch({ pin: "abv", target: 6.0, info: null }), "");
});

test("styleBounds reads an ordered field pair and rejects unordered pairs", () => {
  assert.deepEqual(styleBounds({ min: { value: 6 }, max: { value: 14 } }, "min", "max"), [6, 14]);
  assert.equal(styleBounds({ min: { value: 14 }, max: { value: 6 } }, "min", "max"), null);
  assert.equal(styleBounds({}, "min", "max"), null);
});

test("slider bounds add the colour and bitterness allowances", () => {
  assert.deepEqual(srmSliderBounds([6, 14]), [3, 17]);
  assert.deepEqual(ibuSliderBounds([40, 70]), [34, 76]);
});

test("SRM readouts convert through the colour unit and preserve precision", () => {
  assert.equal(srmHint({ field: COLOR_FIELD, bounds: [6, 14], artifact: ARTIFACT, nl: {} }), "Style 12.0–28.0 EBC");
  assert.equal(srmDisplay({ field: COLOR_FIELD, target: 6.5, artifact: ARTIFACT, nl: {} }), "13.0 EBC");
  const scale = srmDeltaScale({ field: COLOR_FIELD, artifact: ARTIFACT, nl: {} });
  assert.equal(scale(3), 6);
  assert.deepEqual(
    srmDrift({ target: 2, bounds: [6, 14], field: COLOR_FIELD, toDisplay: scale }),
    { outside: true, text: "8.0 EBC below style — severe" }
  );
});

test("IBU readouts and drift use the whole-number display policy", () => {
  assert.deepEqual(ibuDrift({ target: 76, bounds: [40, 70] }), {
    outside: true,
    text: "6 IBU above style — drift",
  });
  assert.deepEqual(ibuDrift({ target: 50, bounds: [40, 70] }), { outside: false, text: "" });
  assert.ok(Math.abs(plannedIbuGu(40, 1.06) - 40 / 60) < 1e-12);
  assert.equal(formatIbuGu(2 / 3), "0.67");
  assert.equal(formatIbuGu(null), "—");
  assert.equal(formatIbu(12.34), "12.3");
  assert.equal(formatIbu(null), "—");
});

test("whirlpoolPercent converts fractions and tolerates missing values", () => {
  assert.equal(whirlpoolPercent(0.25), 25);
  assert.equal(whirlpoolPercent(1), 100);
  assert.equal(whirlpoolPercent(null), 0);
});
