// The builder keeps committed values and in-progress drafts apart, and every
// read/write receives the row context the field is bound to.

import test from "node:test";
import assert from "node:assert/strict";

import { formBuilder } from "../../frontend/src/components/formBuilder.js";

function build({ schema, model, onChange }) {
  const builder = formBuilder({ schema, model, onChange });
  builder.init();
  return builder;
}

test("live fields commit through the value setter", () => {
  const model = { name: "old" };
  const field = build({
    schema: [{ id: "name", type: "text", modelKey: "name" }],
    model,
  }).fields[0];

  assert.equal(field.value, "old");
  field.value = "new";
  assert.equal(model.name, "new");
});

test("staged fields keep a draft until commit", () => {
  const model = { name: "old" };
  const commits = [];
  const field = build({
    schema: [{ id: "name", type: "text", modelKey: "name", lazy: true }],
    model,
    onChange: (item, value) => commits.push(value),
  }).fields[0];

  assert.equal(field.commitMode, "change");
  field.setDraft("new");
  assert.equal(field.draftValue, "new");
  assert.deepEqual(commits, []);

  field.commit();
  assert.deepEqual(commits, ["new"]);
});

test("read and write receive model, index, key, and row", () => {
  const model = { value: 1 };
  const seen = [];
  const field = build({
    schema: [
      {
        id: "alpha",
        type: "number",
        read: (context) => {
          seen.push(context);
          return context.model.value;
        },
        write: (value, context) => {
          seen.push(context);
          context.model.value = value;
        },
      },
    ],
    model,
  }).fields[0];

  assert.equal(field.value, 1);
  field.commit(7);

  assert.equal(model.value, 7);
  assert.deepEqual(
    seen.map(({ model: current, index, key, row }) => ({ model: current, index, key, row })),
    [
      { model, index: null, key: "alpha", row: null },
      { model, index: null, key: "alpha", row: null },
    ]
  );
});

test("hidden fields do not evaluate their read callback", () => {
  let reads = 0;
  const field = build({
    schema: [
      {
        id: "hidden",
        type: "text",
        read: () => {
          reads += 1;
          return "value";
        },
        when: () => false,
      },
    ],
    model: {},
  }).fields[0];

  assert.equal(field.value, "");
  assert.equal(reads, 0);
});

test("describedBy lists the base hint and every visible extra hint", () => {
  const field = build({
    schema: [
      {
        id: "alpha",
        type: "number",
        modelKey: "alpha",
        hint: "Base hint",
        hints: [
          { text: "Visible hint" },
          { text: "Hidden hint", when: () => false },
        ],
      },
    ],
    model: { alpha: 1 },
  }).fields[0];

  assert.equal(field.hintId, "alpha-hint");
  assert.deepEqual(field.hints.map((hint) => hint.id), ["alpha-hint-0", "alpha-hint-1"]);
  assert.equal(field.describedBy, "alpha-hint alpha-hint-0");
});

test("setModel clears drafts only when the model identity changes", () => {
  const model = { name: "old" };
  const builder = build({
    schema: [{ id: "name", type: "text", modelKey: "name", lazy: true }],
    model,
  });
  const field = builder.fields[0];

  field.setDraft("draft");
  builder.setModel(model);
  assert.equal(field.draftValue, "draft");

  builder.setModel({ name: "other" });
  assert.equal(field.draftValue, "other");
});

test("range scalars and decorations resolve from functions", () => {
  const field = build({
    schema: [
      {
        id: "srm",
        type: "range",
        min: () => 1,
        max: () => 40,
        step: () => 0.5,
        readout: () => "12 SRM",
        badge: () => ({ text: "seed", title: "Seeded" }),
        reset: () => ({ show: true, title: "Reset", run: () => {} }),
        actions: () => [{ label: "All", run: () => {} }],
        warning: () => "Outside the style",
      },
    ],
    model: {},
  }).fields[0];

  assert.equal(field.min, 1);
  assert.equal(field.max, 40);
  assert.equal(field.step, 0.5);
  assert.equal(field.readout, "12 SRM");
  assert.deepEqual(field.badge, { text: "seed", title: "Seeded" });
  assert.equal(field.reset.show, true);
  assert.equal(field.actions[0].label, "All");
  assert.equal(field.warning, "Outside the style");
});

test("checkbox groups toggle the selection through write", () => {
  let selection = ["a"];
  let written = null;
  const field = build({
    schema: [
      {
        id: "sections",
        type: "checkbox-group",
        read: () => selection,
        write: (next) => {
          written = next;
          selection = next;
        },
      },
    ],
    model: {},
  }).fields[0];

  field.toggle("b");
  assert.deepEqual(written, ["a", "b"]);

  field.toggle("a");
  assert.deepEqual(written, ["b"]);
});

test("dynamic hints resolve through the context", () => {
  const field = build({
    schema: [
      {
        id: "curve",
        type: "select",
        modelKey: "curve",
        hints: () => [{ text: "Warning one", class: "text-warning" }],
      },
    ],
    model: { curve: "" },
  }).fields[0];

  assert.deepEqual(
    field.hints.map(({ id, text, when, class: hintClass }) => ({ id, text, when, class: hintClass })),
    [{ id: "curve-hint-0", text: "Warning one", when: true, class: "text-warning" }]
  );
  assert.equal(field.describedBy, "curve-hint-0");
});

test("repeat rows build scoped child fields and expose add/remove", () => {
  const items = [{ x: 1 }, { x: 2 }];
  const seen = [];
  const field = build({
    schema: [
      {
        id: "points",
        type: "repeat",
        items: () => items,
        key: (row, index) => String(index),
        rowClass: "metric-strip",
        cellClass: "metric-cell",
        schema: [
          {
            id: "point-x",
            type: "number",
            read: (context) => {
              seen.push(context);
              return context.model.x;
            },
            write: (value, context) => {
              context.model.x = Number(value);
            },
          },
        ],
        add: { label: "Add point", run: () => {} },
        remove: { label: "Remove", run: () => {} },
      },
    ],
    model: {},
  }).fields[0];

  assert.equal(field.rowClass, "metric-strip");
  assert.equal(field.cellClass, "metric-cell");
  assert.equal(field.add.label, "Add point");
  assert.equal(field.remove.label, "Remove");

  const rows = field.rows;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].fields[0].id, "point-x-0");
  assert.equal(rows[0].fields[0].value, 1);
  assert.equal(rows[1].fields[0].value, 2);

  rows[1].fields[0].commit(9);
  assert.equal(items[1].x, 9);
  assert.deepEqual(
    seen.map(({ model, index, key, row }) => ({ model, index, key, row })),
    [
      { model: items[0], index: 0, key: "0", row: items[0] },
      { model: items[1], index: 1, key: "1", row: items[1] },
    ]
  );
});


