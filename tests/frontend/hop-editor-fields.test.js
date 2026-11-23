import test from "node:test";
import assert from "node:assert/strict";

import { hopEditorFieldActions } from "../../frontend/src/adapters/cards/hopEditorFields.js";

const actions = hopEditorFieldActions();

function app() {
  const calls = [];
  return {
    calls,
    hopDraftSummary: "3 charges",
    cancelHopEditor: () => calls.push("hop-cancel"),
    saveHopEditor: () => calls.push("hop-save"),
    handleHopEscape: () => calls.push("hop-escape"),
    whirlpoolHopDraftSummary: "2 charges",
    cancelWhirlpoolHopEditor: () => calls.push("wp-cancel"),
    saveWhirlpoolHopEditor: () => calls.push("wp-save"),
    handleWhirlpoolHopEscape: () => calls.push("wp-escape"),
    hopActiveIndex: 1,
    whirlpoolHopActiveIndex: 2,
    hopActiveRow: { alpha_acid_pct: 0.123, cone_utilization: null, product_form: "whole_cone" },
    whirlpoolHopActiveRow: { alpha_acid_pct: 0.11, product_form: "lupulin_pellet" },
    hopForms: [{ value: "t90_pellet", label: "T-90" }],
    whirlpoolHopForms: [{ value: "t90_pellet", label: "T-90" }],
    fmt: { toPercentValue: (value) => String(Math.round(value * 1000) / 10) },
    setMaltField: (...args) => calls.push(["field", ...args]),
    patchDraftRow: (...args) => calls.push(["patch", ...args]),
    whirlpoolStartBandValue: "90",
    whirlpoolStartBands: [{ value: "90", label: "90 °C" }],
    whirlpoolStartBandHint: "start band hint",
    setWhirlpoolStartBand: (value) => calls.push(["band", value]),
  };
}

test("the hop editor shell maps the draft callbacks", () => {
  const context = app();
  const config = actions.hopEditorConfig.call(context);

  assert.equal(config.id, "hop-editor");
  assert.equal(config.title, "Hop Schedule Editor");
  assert.equal(config.badge(), "3 charges");
  assert.equal(config.badgeClass, "badge-info");
  config.cancel();
  config.save();
  config.escape();
  assert.deepEqual(context.calls, ["hop-cancel", "hop-save", "hop-escape"]);
});

test("the hop inspector keeps four fields and a per-field write path", () => {
  const context = app();
  const config = actions.hopInspectorFields.call(context);

  assert.deepEqual(
    config.schema.map((field) => field.id),
    ["hop-row-name", "hop-row-alpha", "hop-row-cone", "hop-row-form"]
  );
  assert.equal(config.schema[1].read(), "12.3");
  assert.equal(config.schema[2].when(), true);

  config.onChange(config.schema[1], "13");
  assert.deepEqual(context.calls.at(-1), ["field", 1, "alpha_acid_pct", "13", 0.01]);
  config.onChange(config.schema[2], "");
  assert.deepEqual(context.calls.at(-1), ["patch", 1, { cone_utilization: null }]);
  config.onChange(config.schema[3], "flowable_extract");
  assert.deepEqual(context.calls.at(-1), ["patch", 1, { product_form: "flowable_extract" }]);
  config.onChange(config.schema[0], "Amarillo");
  assert.deepEqual(context.calls.at(-1), ["field", 1, "name", "Amarillo"]);
});

test("the whirlpool editor shell maps its own callbacks", () => {
  const context = app();
  const config = actions.whirlpoolHopEditorConfig.call(context);

  assert.equal(config.id, "whirlpool-hop-editor");
  assert.equal(config.badge(), "2 charges");
  config.cancel();
  assert.deepEqual(context.calls, ["wp-cancel"]);
});

test("the cone field only shows for whole cone and nulls an empty entry", () => {
  const context = app();
  const config = actions.whirlpoolHopRowConeField.call(context);

  assert.equal(config.schema[0].when(), false);
  context.whirlpoolHopActiveRow.product_form = "whole_cone";
  assert.equal(config.schema[0].when(), true);
  config.onChange(config.schema[0], "");
  assert.deepEqual(context.calls.at(-1), ["patch", 2, { cone_utilization: null }]);
  config.onChange(config.schema[0], "0.8");
  assert.deepEqual(context.calls.at(-1), ["patch", 2, { cone_utilization: 0.8 }]);
});

test("the start-temperature field appends the custom option and sets the band", () => {
  const context = app();
  const config = actions.whirlpoolHopRowStartField.call(context);

  assert.deepEqual(config.schema[0].options, [
    { value: "90", label: "90 °C" },
    { value: "custom", label: "Custom (edit the grid temperature)" },
  ]);
  assert.equal(config.schema[0].hint(), "start band hint");
  config.onChange(config.schema[0], "80");
  assert.deepEqual(context.calls.at(-1), ["band", "80"]);
});

test("the whirlpool alpha field warns only for lupulin pellets", () => {
  const context = app();
  const config = actions.whirlpoolHopRowAlphaField.call(context);

  assert.equal(config.schema[0].read(), "11");
  assert.equal(config.schema[0].hints[0].when(), true);
  config.onChange(config.schema[0], "11.5");
  assert.deepEqual(context.calls.at(-1), ["field", 2, "alpha_acid_pct", "11.5", 0.01]);
});
