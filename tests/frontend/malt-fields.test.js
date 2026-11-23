import test from "node:test";
import assert from "node:assert/strict";

import { createMaltCard } from "../../frontend/src/adapters/cards/malt.js";
import { traceEditorFieldActions } from "../../frontend/src/adapters/cards/traceEditor.js";

const trace = traceEditorFieldActions();

function app() {
  const calls = [];
  return {
    calls,
    maltValidation: { label: "balanced", class: "text-ok", type: "balanced" },
    cancelMaltEditor: () => calls.push("cancel"),
    saveMaltEditor: () => calls.push("save"),
    handleMaltEscape: () => calls.push("escape"),
    setMaltField: (...args) => calls.push(["field", ...args]),
    maltActiveIndex: 2,
    maltActiveRow: { yield_fraction: 0.79, color_lovibond: 3.5 },
    maltCategories: ["base", "crystal"],
    fmt: { toPercentValue: (value) => String(Math.round(value * 100)) },
    colorUnit: () => "SRM",
    colorDisplay: (value) => `${value} SRM`,
    setColorField: (...args) => calls.push(["color", ...args]),
    traceDraftMassDisplay: "2.0 kg",
    traceActiveIndex: 3,
    traceActiveRow: { yield_fraction: 0.8, color_lovibond: 2.5 },
    cancelTraceEditor: () => calls.push("trace-cancel"),
    saveTraceEditor: () => calls.push("trace-save"),
    handleTraceEscape: () => calls.push("trace-escape"),
  };
}

test("the malt editor shell maps the validation and draft callbacks", () => {
  const context = app();
  const card = createMaltCard({ getView: () => ({ fieldsBySlice: {} }) });
  const config = card.maltEditorConfig.call(context);

  assert.equal(config.id, "malt-editor");
  assert.equal(config.title, "Grain Bill Editor");
  assert.equal(config.badge(), "balanced");
  assert.equal(config.saveDisabled(), false);
  config.cancel();
  config.save();
  config.escape();
  assert.deepEqual(context.calls, ["cancel", "save", "escape"]);
});

test("the malt row fields carry a single schema entry and an index-bound onChange", () => {
  const context = app();
  const card = createMaltCard({ getView: () => ({ fieldsBySlice: {} }) });

  const name = card.maltRowNameField.call(context);
  assert.equal(name.schema[0].id, "malt-row-name");
  assert.equal(name.schema[0].modelKey, "name");
  name.onChange(name.schema[0], "Munich");
  assert.deepEqual(context.calls, [["field", 2, "name", "Munich"]]);

  const category = card.maltRowCategoryField.call(context);
  assert.deepEqual(category.schema[0].options, [
    { value: "base", label: "base" },
    { value: "crystal", label: "crystal" },
  ]);

  const yieldField = card.maltRowYieldField.call(context);
  assert.equal(yieldField.schema[0].read(), "79");
  yieldField.onChange(yieldField.schema[0], "80");
  assert.deepEqual(context.calls.at(-1), ["field", 2, "yield_fraction", "80", 0.01]);

  const color = card.maltRowColorField.call(context);
  assert.equal(color.schema[0].label(), "Color (SRM)");
  assert.equal(color.schema[0].read(), "3.5 SRM");
  color.onChange(color.schema[0], 4);
  assert.deepEqual(context.calls.at(-1), ["color", 2, 4]);

  const notes = card.maltRowNotesField.call(context);
  assert.equal(notes.schema[0].type, "textarea");
  assert.equal(notes.schema[0].rows, 3);
});

test("the trace editor shell maps its own draft callbacks", () => {
  const context = app();
  const config = trace.traceEditorConfig.call(context);

  assert.equal(config.id, "trace-malt-editor");
  assert.equal(config.badge(), "2.0 kg");
  assert.equal(config.badgeClass, "badge-info");
  config.cancel();
  config.save();
  assert.deepEqual(context.calls, ["trace-cancel", "trace-save"]);
});

test("the trace row fields bind to the trace index", () => {
  const context = app();
  const yieldField = trace.traceRowYieldField.call(context);

  assert.equal(yieldField.schema[0].id, "trace-row-yield");
  assert.equal(yieldField.schema[0].read(), "80");
  yieldField.onChange(yieldField.schema[0], "81");
  assert.deepEqual(context.calls.at(-1), ["field", 3, "yield_fraction", "81", 0.01]);

  const color = trace.traceRowColorField.call(context);
  color.onChange(color.schema[0], 3);
  assert.deepEqual(context.calls.at(-1), ["color", 3, 3]);

  const notes = trace.traceRowNotesField.call(context);
  assert.equal(notes.schema[0].modelKey, "notes");
  assert.equal(notes.onChange(notes.schema[0], "hi")[1], undefined);
  assert.deepEqual(context.calls.at(-1), ["field", 3, "notes", "hi"]);
});
