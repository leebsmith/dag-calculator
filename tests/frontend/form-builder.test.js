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
