import test from "node:test";
import assert from "node:assert/strict";

import { createHopStrategy } from "../../frontend/src/adapters/cards/hopsStrategy.js";
import { createCoolingCurvePicker } from "../../frontend/src/adapters/cards/hopsCoolingCurve.js";

function picker() {
  return createCoolingCurvePicker(
    {
      engine: { get: () => null, resolve: () => null },
      artifact: { nodes: {} },
      cache: { seeds: {}, references: {} },
      getView: () => ({ notify() {}, compute() {} }),
      observability: { reportError() {} },
    },
    { formatTemp: (value) => String(value) }
  );
}

function whirlpoolApp() {
  const field = (id, label, display, unit = "°C") => ({
    id,
    label,
    unit,
    display,
    hint: `${label} hint`,
  });
  const knockout = field("knockout", "Knockout", "5");
  const start = field("start", "Start", "95");
  const ambient = field("ambient", "Ambient", "20");
  const cooling = field("cooling", "Time constant", "108.7");
  const calls = [];
  return {
    calls,
    whirlpoolKnockoutField: knockout,
    whirlpoolStartTempField: start,
    whirlpoolAmbientField: ambient,
    whirlpoolCoolingField: cooling,
    edit: (...args) => calls.push(["edit", ...args]),
    editWhirlpoolCooling: (value) => calls.push(["cooling", value]),
    coolingCurveValue: "__custom__",
    customCoolingCurveValue: "__custom__",
    selectCoolingCurve: (value) => calls.push(["curve", value]),
    coolingCurveIsCustom: true,
    coolingCurveOptions: [{ id: "a", name: "Curve A" }],
    coolingCurveMissing: true,
    coolingCurveId: "gone",
    openCoolingCurveLibrary: () => calls.push(["library"]),
    coolingCurveSummary: "fits 3 points",
    coolingCurveWarnings: ["too short"],
  };
}

test("the hop strategy schema binds the textarea to the app member", () => {
  const view = { hopStrategy: "", notify() {} };
  const strategy = createHopStrategy({ getView: () => view });
  const context = { hopStrategy: "seed", setHopStrategy: strategy.setHopStrategy.bind(strategy) };
  const [field] = strategy.hopStrategyFields.call(context);

  assert.equal(field.id, "hop-strategy");
  assert.equal(field.read(), "seed");
  field.write("changed");
  assert.equal(view.hopStrategy, "changed");
  assert.equal(field.attrs.maxlength, 4000);
});

test("the whirlpool schema keeps the five fields in order", () => {
  const fields = picker().whirlpoolFields.call(whirlpoolApp());

  assert.deepEqual(
    fields.map((field) => field.id),
    [
      "whirlpool-knockout",
      "whirlpool-start-temp",
      "whirlpool-ambient",
      "whirlpool-cooling-time-constant",
      "whirlpool-cooling-curve",
    ]
  );
});

test("the number fields share the label, read, when and hint shape", () => {
  const fields = picker().whirlpoolFields.call(whirlpoolApp());
  const knockout = fields[0];

  assert.equal(knockout.type, "number");
  assert.equal(knockout.label(), "Knockout (°C)");
  assert.equal(knockout.read(), "5");
  assert.equal(knockout.when(), true);
  assert.equal(knockout.step, 1);
  assert.equal(knockout.min, 0);
  assert.equal(knockout.hint(), "Knockout hint");
});

test("a missing field hides itself instead of rendering an empty label", () => {
  const context = whirlpoolApp();
  context.whirlpoolAmbientField = null;
  const ambient = picker().whirlpoolFields.call(context)[2];

  assert.equal(ambient.when(), false);
  assert.equal(ambient.label(), "");
  assert.equal(ambient.read(), undefined);
});

test("write routes through edit, except the cooling constant", () => {
  const context = whirlpoolApp();
  const fields = picker().whirlpoolFields.call(context);

  fields[0].write("6");
  fields[3].write("120");
  assert.deepEqual(context.calls, [
    ["edit", context.whirlpoolKnockoutField, "6"],
    ["cooling", "120"],
  ]);
});

test("the cooling-curve options order default, custom, curves, then missing", () => {
  const fields = picker().whirlpoolFields.call(whirlpoolApp());

  assert.deepEqual(fields[4].options(), [
    { value: "", label: "Default cooling" },
    { value: "__custom__", label: "Custom (manual time constant)" },
    { value: "a", label: "Curve A" },
    { value: "gone", label: "Missing curve — gone" },
  ]);
  assert.equal(fields[4].actions[0].label, "Manage library");
  assert.equal(fields[4].hint(), "fits 3 points");
  assert.deepEqual(fields[4].hints(), [{ text: "too short", class: "text-warning" }]);
});
