import test from "node:test";
import assert from "node:assert/strict";

import {
  abvBoundsFor,
  abvTargetFor,
  gravityReadoutsFor,
  styleExtractPoint,
  stylePreviewModel,
  styleRegionState,
  targetInfoFor,
  targetNearestText,
  targetRiskFor,
} from "../../frontend/src/views/styleNavigatorLogic.js";

const ENVELOPE = {
  ogMin: 1.056,
  ogMax: 1.075,
  fgMin: 1.01,
  fgMax: 1.018,
  abvMin: 5.5,
  abvMax: 7.5,
};

const GRAVITY = {
  fromSg: (value) => (value - 1) * 1000,
  decimals: 1,
  symbol: "°P",
};

const PLOT_GRAVITY = {
  fromPlato: (value) => value,
  toPlato: (value) => value,
  decimals: 1,
  symbol: "°P",
  step: "0.1",
};

test("styleRegionState returns the exact feasible region and safest point", () => {
  const state = styleRegionState(ENVELOPE);
  assert.equal(state.styleEnvelope, ENVELOPE);
  assert.deepEqual(state.styleRegion, [
    [13.804682033152062, 2.5607778970000936],
    [16.21863847274, 2.5607778970000936],
    [17.93990962170908, 4.5803400905040235],
    [14.648660507510284, 4.5803400905040235],
    [13.804682033152062, 3.626436627706151],
  ]);
  assert.deepEqual(state.styleSafestPoint, {
    oe: 15.596613988193436,
    ae: 3.5705589937520585,
    radius: 1.009781096751965,
  });
});

test("styleRegionState treats an incomplete envelope as empty", () => {
  assert.deepEqual(styleRegionState({ ...ENVELOPE, ogMax: undefined }), {
    styleEnvelope: null,
    styleRegion: [],
    styleSafestPoint: null,
  });
});

test("styleExtractPoint uses the solved gravity before the target inverse", () => {
  const { styleRegion } = styleRegionState(ENVELOPE);
  assert.deepEqual(
    styleExtractPoint({
      region: styleRegion,
      solvedOg: 1.062,
      solvedAa: 0.75,
      fallbackAa: 0.75,
      targetAbv: 6.5,
    }),
    { oe: 15.207357729016053, ae: 3.801839432254013 }
  );
  assert.deepEqual(
    styleExtractPoint({ region: styleRegion, fallbackAa: 0.75, targetAbv: 6.5 }),
    { oe: 15.75799624377008, ae: 3.93949906094252 }
  );
});

test("stylePreviewModel selects the plot model and the placeholder", () => {
  const state = styleRegionState(ENVELOPE);
  const point = styleExtractPoint({
    region: state.styleRegion,
    solvedOg: 1.062,
    solvedAa: 0.75,
  });
  const model = stylePreviewModel({
    region: state.styleRegion,
    point,
    safestPoint: state.styleSafestPoint,
    pin: "abv",
    target: 6.5,
    unsolved: false,
    gravity: PLOT_GRAVITY,
    envelope: state.styleEnvelope,
  });
  assert.equal(model.pinLabel, "ABV 6.5%");
  assert.equal(
    model.summary,
    "Fermentation space: OG 15.2 °P, FG 3.8 °P, ABV 6.2%. " +
      "Contours are iso-ABV every 1%; the line is this batch's composition."
  );

  assert.deepEqual(
    stylePreviewModel({
      region: [],
      point: null,
      safestPoint: null,
      pin: "abv",
      target: null,
      unsolved: true,
      gravity: PLOT_GRAVITY,
      envelope: ENVELOPE,
    }),
    {
      width: 376,
      height: 366,
      viewBox: "0 0 376 366",
      center: { x: "204.0", y: "172.0" },
      placeholder: "Blocked/Unsolved",
      summary: "Fermentation space: blocked/unsolved.",
    }
  );
});

test("abvBoundsFor, targetInfoFor, and targetRiskFor derive the solved readouts", () => {
  const state = styleRegionState(ENVELOPE);
  const extract = styleExtractPoint({
    region: state.styleRegion,
    solvedOg: 1.062,
    solvedAa: 0.75,
  });
  assert.deepEqual(abvBoundsFor({ extract, aa: 0.75, region: state.styleRegion }), [
    5.590879264685127, 7.5001365181833375,
  ]);
  assert.deepEqual(targetInfoFor({ extract }), {
    oe: 15.207357729016053,
    ae: 3.801839432254013,
    og: 1.0620023599923103,
    fg: 1.0149054414154746,
    aa: 0.75,
    abv: 6.240714067312736,
  });
  assert.deepEqual(
    targetRiskFor({
      extract,
      safestPoint: state.styleSafestPoint,
      region: state.styleRegion,
      envelope: state.styleEnvelope,
    }),
    {
      safety: 0.7709598256039005,
      nearest: {
        label: "OG min",
        headroom: 0.006002359992310247,
        range: 0.018999999999999906,
        unit: "SG",
        value: 1.0620023599923103,
        boundary: 1.056,
      },
    }
  );
  assert.equal(targetInfoFor({ extract: null }), null);
  assert.equal(
    targetRiskFor({
      extract: null,
      safestPoint: state.styleSafestPoint,
      region: state.styleRegion,
      envelope: state.styleEnvelope,
    }),
    null
  );
});

test("abvTargetFor prefers an explicit target over the realized readout", () => {
  assert.equal(abvTargetFor(6.2, { abv: 6.2 }), 6.2);
  assert.equal(abvTargetFor(null, { abv: 6.2 }), 6.2);
  assert.equal(abvTargetFor(null, null), null);
});

test("gravityReadoutsFor formats both ends of the extract and handles absence", () => {
  const info = { og: 1.0620023599923103, fg: 1.0149054414154746 };
  assert.deepEqual(gravityReadoutsFor({ info, gravity: GRAVITY }), {
    og: "62.0 °P",
    fg: "14.9 °P",
  });
  assert.deepEqual(gravityReadoutsFor({ info: null, gravity: GRAVITY }), {
    og: "—",
    fg: "—",
  });
});

test("targetNearestText formats gravity and non-gravity headroom", () => {
  assert.equal(
    targetNearestText({
      nearest: { unit: "SG", value: 1.062, boundary: 1.056, headroom: 0.006, label: "OG" },
      gravity: GRAVITY,
    }),
    "OG (6.0 °P)"
  );
  assert.equal(
    targetNearestText({
      nearest: { unit: "IBU", value: 50, boundary: 40, headroom: 10, label: "IBU" },
      gravity: GRAVITY,
    }),
    "IBU (10.000 IBU)"
  );
  assert.equal(targetNearestText({ nearest: null, gravity: GRAVITY }), "—");
});
