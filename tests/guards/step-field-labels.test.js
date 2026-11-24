// Every scalar a step card renders needs a label in `data/labels.json`
// (generated into `views/registry/generated.js`); without one the card prints
// the raw dotted path. Collections and readout tables are excluded: their labels
// come from the column/row definitions, not from a field id.
//
// Sectioned steps also declare their display groups; the union of the groups
// must be the step's field list, so a field cannot be added to one and forgotten
// in the other.

import test from "node:test";
import assert from "node:assert/strict";

import { registry, steps } from "../../frontend/src/views/steps.js";

const SHARED_CARD = "./src/partials/step-card.html";

function scalarIds(step) {
  return step.fields
    .map((field) => (typeof field === "string" ? field : field.id))
    .filter(Boolean);
}

test("every scalar the shared step card renders has a registry label", () => {
  const missing = [];
  for (const step of steps.filter((candidate) => candidate.partial === SHARED_CARD)) {
    for (const id of scalarIds(step)) {
      if (!registry[id]?.label) missing.push(`${step.id}: ${id}`);
    }
  }

  assert.deepEqual(missing, [], `fields without a label in data/labels.json:\n${missing.join("\n")}`);
});

test("a sectioned step's groups cover its field list exactly once", () => {
  const sectioned = steps.filter((candidate) => candidate.sections?.length);
  assert.ok(sectioned.length > 0, "no sectioned step found");

  for (const step of sectioned) {
    const declared = step.fields.filter((field) => typeof field === "string");
    const grouped = step.sections.flatMap((section) => section.fields);

    assert.deepEqual(
      [...grouped].sort(),
      [...declared].sort(),
      `${step.id}: sections and fields disagree`
    );
    assert.equal(new Set(grouped).size, grouped.length, `${step.id}: a field appears in two sections`);
    for (const section of step.sections) {
      assert.ok(section.title, `${step.id}: a section has no title`);
      assert.ok(section.fields.length > 0, `${step.id}: section "${section.title}" is empty`);
    }
  }
});
