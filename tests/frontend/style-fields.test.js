import test from "node:test";
import assert from "node:assert/strict";

import { createStyleDeclaration } from "../../frontend/src/adapters/cards/style/declaration.js";
import { styleTargetFieldActions } from "../../frontend/src/adapters/cards/style/targetFields.js";

const actions = styleTargetFieldActions();

function app() {
  return {
    scalePin: "abv",
    scalePinOptions: [{ value: "abv", label: "ABV" }],
    setScalePin() {},
    styleSrmSliderBounds: [2, 40],
    styleIbuSliderBounds: [20, 40],
    styleIbuBounds: [20, 40],
    targetSrm: 8,
    targetIbu: 30,
    whirlpoolFraction: 0.25,
    setTargetSrm() {},
    setTargetIbu() {},
    setWhirlpoolFraction() {},
    srmTargetDisplay: "8 SRM",
    styleSrmHint: "style 2 – 40 SRM",
    srmTargetProvenance: { showSeed: true, seedTitle: "seed", showReset: true, resetTitle: "reset" },
    ibuTargetProvenance: { showSeed: false, seedTitle: "", showReset: false, resetTitle: "" },
    srmTargetField: { id: "srm" },
    ibuTargetField: { id: "ibu" },
    srmTargetOutside: false,
    srmTargetNote: "outside",
    ibuTargetOutside: true,
    ibuTargetNote: "ibu outside",
    resetField() {},
    boilIbuDisplay: "18.0",
    whirlpoolPctDisplay: "25",
    whirlpoolIbuDisplay: "12.0",
    styleEnvelopeFields: [
      { id: "og", field: { label: "OG", display: "1.050", unit: "SG", toggleable: true } },
      { id: "ibu", field: { label: "IBU", display: "30" } },
    ],
  };
}

test("the scale-pin selector binds its option list and setter", () => {
  const context = app();
  const [field] = actions.styleScalePinFields.call(context);

  assert.equal(field.id, "style-scale-pin");
  assert.equal(field.read(), "abv");
  assert.deepEqual(field.options(), [{ value: "abv", label: "ABV" }]);
});

test("the SRM slider takes its bounds, seed badge, reset and warning from the app", () => {
  const context = app();
  const [field] = actions.styleSrmFields.call(context);

  assert.equal(field.id, "target-srm");
  assert.equal(field.step, 0.5);
  assert.equal(field.min(), 2);
  assert.equal(field.max(), 40);
  assert.equal(field.when(), true);
  assert.equal(field.read(), 8);
  assert.equal(field.readout(), "8 SRM");
  assert.deepEqual(field.badge(), { text: "seed", title: "seed" });
  const reset = field.reset();
  assert.equal(reset.show, true);
  assert.equal(reset.title, "reset");
  assert.equal(typeof reset.run, "function");
  assert.equal(field.warning(), null);
});

test("the SRM slider hides itself and warns when the envelope has no range", () => {
  const context = app();
  context.styleSrmSliderBounds = null;
  context.srmTargetOutside = true;
  const [field] = actions.styleSrmFields.call(context);

  assert.equal(field.when(), false);
  assert.equal(field.warning(), "outside");
});

test("the IBU slider formats its readout and style hint", () => {
  const context = app();
  const [field] = actions.styleIbuFields.call(context);

  assert.equal(field.readout(), "30.0 IBU");
  assert.equal(field.hint(), "Style 20–40 IBU");
  assert.equal(field.warning(), "ibu outside");
  assert.equal(field.badge(), null);
});

test("the whirlpool split readout names both pools and the percentage", () => {
  const context = app();
  const [field] = actions.whirlpoolFractionFields.call(context);

  assert.equal(field.id, "whirlpool-fraction");
  assert.equal(field.min, 0);
  assert.equal(field.max, 1);
  assert.equal(field.readout(), "Boil 18.0 IBU · 25% whirlpool · 12.0 IBU");
});

test("the envelope readouts carry units only when the field is toggleable", () => {
  const declaration = createStyleDeclaration({ cache: { references: {} }, getView: () => ({}) });
  const context = app();
  const fields = declaration.styleEnvelopeReadouts.call(context);

  assert.deepEqual(
    fields.map((field) => field.id),
    ["og", "ibu"]
  );
  assert.equal(fields[0].label(), "OG");
  assert.equal(fields[0].read(), "1.050 SG");
  assert.equal(fields[1].read(), "30");
  assert.equal(fields[0].type, "readout");
});
