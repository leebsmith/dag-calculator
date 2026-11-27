// Every scalar the wall renders needs a label in `data/labels.json` (generated
// into `views/registry/generated.js`); without one the row prints the raw dotted
// path. Collections render through their table definitions and are exempt.
//
// Sectioned steps (equipment) also declare display groups; the union of the
// groups must be the field list, so a field cannot be added to one and forgotten
// in the other.

import test from "node:test";
import assert from "node:assert/strict";

import { registry } from "../../frontend/src/views/registry/index.js";
import { steps } from "../../frontend/src/views/steps.js";
import { fieldsets } from "../../frontend/src/views/fieldsets.js";

const AUTHORABLE = new Set(["root", "choice"]);

test("every authored wall scalar has a registry label", () => {
  const missing = [];
  for (const fieldset of fieldsets) {
    for (const block of fieldset.blocks) {
      if (block.render !== "fields") continue;
      for (const id of block.fields) {
        if (!AUTHORABLE.has(registry[id]?.kind)) continue;
        if (!registry[id]?.label) missing.push(`${fieldset.id}/${block.id}: ${id}`);
      }
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
