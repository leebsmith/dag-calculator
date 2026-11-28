import test from "node:test";
import assert from "node:assert/strict";

import { createDryHopCard } from "../../frontend/src/adapters/cards/dry-hops.js";
import { createYeastCard } from "../../frontend/src/adapters/cards/yeast.js";
import { reportPickerFieldActions } from "../../frontend/src/store/reportPickerFields.js";

function dryHopApp() {
  const calls = [];
  return {
    calls,
    dryHopDraftSummary: "3 charges",
    cancelDryHopEditor: () => calls.push("cancel"),
    saveDryHopEditor: () => calls.push("save"),
    handleDryHopEscape: () => calls.push("escape"),
    dryHopActiveIndex: 4,
    dryHopActiveRow: { contact_until: "keg" },
    dryHopContactMode: () => "keg",
    setDryHopContactMode: (...args) => calls.push(["mode", ...args]),
    dryHopProductOptions: [{ value: "t90_pellet", label: "T-90" }],
    dryHopUnitOptions: [{ value: "g", label: "g" }],
    dryHopEventOptions: [{ value: "day_3", label: "Day 3" }],
    dryHopContactUntilOptions: [{ value: "keg", label: "Kegging" }],
    dryHopContactHours: () => "48",
    setDryHopDraftContactHours: (...args) => calls.push(["hours", ...args]),
    setDryHopDraftContactUntil: (...args) => calls.push(["until", ...args]),
    setDryHopDraftNumber: (...args) => calls.push(["number", ...args]),
    setDryHopDraftField: (...args) => calls.push(["field", ...args]),
  };
}

test("the dry-hop editor shell maps the draft callbacks", () => {
  const card = createDryHopCard({ artifact: { taxonomies: {} }, getView: () => ({}) });
  const context = dryHopApp();
  const config = card.dryHopEditorConfig.call(context);

  assert.equal(config.id, "dry-hop-editor");
  assert.equal(config.badge(), "3 charges");
  config.cancel();
  config.save();
  config.escape();
  assert.deepEqual(context.calls, ["cancel", "save", "escape"]);
});

test("the dry-hop inspector keeps nine fields and dispatches writes by id and type", () => {
  const card = createDryHopCard({ artifact: { taxonomies: {} }, getView: () => ({}) });
  const context = dryHopApp();
  const config = card.dryHopInspectorFields.call(context);

  assert.deepEqual(
    config.schema.map((field) => field.id),
    [
      "dry-hop-row-variety",
      "dry-hop-row-type",
      "dry-hop-row-quantity",
      "dry-hop-row-unit",
      "dry-hop-row-event",
      "dry-hop-row-contact-mode",
      "dry-hop-row-contact",
      "dry-hop-row-detail",
      "dry-hop-row-notes",
    ]
  );
  assert.equal(config.schema[5].read(), "keg");
  assert.deepEqual(config.schema[5].options, [
    { value: "hours", label: "Hours" },
    { value: "keg", label: "Kegging" },
    { value: "", label: "No contact limit" },
  ]);
  assert.equal(config.schema[6].when(), false, "hours only show while that mode is chosen");
  assert.equal(config.schema[6].read(), "48");

  config.onChange(config.schema[5], "hours");
  assert.deepEqual(context.calls.at(-1), ["mode", 4, "hours"]);
  config.onChange(config.schema[6], "36");
  assert.deepEqual(context.calls.at(-1), ["hours", 4, "36"]);
  config.onChange(config.schema[2], "100");
  assert.deepEqual(context.calls.at(-1), ["number", 4, "quantity", "100"]);
  config.onChange(config.schema[8], "citrus");
  assert.deepEqual(context.calls.at(-1), ["field", 4, "notes", "citrus"]);
});

function yeastApp() {
  const calls = [];
  return {
    calls,
    selectedYeast: { name: "US-05" },
    closeYeastPicker: () => calls.push("close"),
    handleYeastEscape: () => calls.push("escape"),
  };
}

test("the yeast picker config reports the selected strain", () => {
  const card = createYeastCard({
    cache: { seeds: {}, references: {} },
    artifact: { nodes: {} },
    engine: { get: () => null, resolve: () => null },
    getView: () => ({}),
    observability: { reportError() {} },
  });
  const context = yeastApp();
  const config = card.yeastPickerConfig.call(context);

  assert.equal(config.id, "yeast-picker");
  assert.equal(config.title, "Choose Yeast");
  assert.equal(config.subtitle(), "US-05");
  assert.equal(config.cancelLabel, "Close");
  config.cancel();
  config.escape();
  assert.deepEqual(context.calls, ["close", "escape"]);

  context.selectedYeast = null;
  assert.equal(config.subtitle(), "No strain selected");
});

test("the report picker config closes the store dialog", () => {
  const context = { closeReportPicker() { this.closed = true; } };
  const config = reportPickerFieldActions().reportPickerConfig.call(context);

  assert.equal(config.id, "report-picker");
  assert.equal(config.variant, "plain");
  config.cancel();
  assert.equal(context.closed, true);
});

test("the report picker fields map sections, selection and mass format", () => {
  const context = {
    reportSections: [
      { id: "discussion", title: "Discussion" },
      { id: "hops", title: "Hops" },
    ],
    reportSelection: ["hops"],
    reportMassFormat: "display",
    selectAllReportSections() {
      this.reportSelection = ["discussion", "hops"];
    },
    clearReportSections() {
      this.reportSelection = [];
    },
  };
  const { schema } = reportPickerFieldActions().reportPickerFields.call(context);

  assert.deepEqual(
    schema.map((field) => field.id),
    ["report-sections", "report-mass-format"]
  );
  assert.deepEqual(schema[0].options(), [
    { value: "discussion", label: "Discussion" },
    { value: "hops", label: "Hops" },
  ]);
  assert.deepEqual(schema[0].read(), ["hops"]);
  schema[0].write(["discussion"]);
  assert.deepEqual(context.reportSelection, ["discussion"]);
  schema[0].actions[0].run();
  assert.deepEqual(context.reportSelection, ["discussion", "hops"]);
  schema[0].actions[1].run();
  assert.deepEqual(context.reportSelection, []);

  assert.deepEqual(schema[1].options(), [
    { value: "display", label: "Display units" },
    { value: "lb_oz", label: "Pounds & ounces" },
  ]);
});
