// A wall field is one narrow track (9rem). A hint longer than a sentence wraps
// into a paragraph and pushes the row down the fieldset, so the wall keeps a
// copy budget: long-form caveats belong in the report or the docs.

import test from "node:test";
import assert from "node:assert/strict";

import { fieldsets } from "../../frontend/src/views/fieldsets.js";
import { read } from "./util.js";

const BUDGET = 90;
const LABELS = JSON.parse(read("data/labels.json"));

test("every wall hint fits the copy budget", () => {
  const over = [];
  for (const fieldset of fieldsets) {
    for (const block of fieldset.blocks) {
      for (const id of block.fields) {
        const hint = LABELS[id]?.hint;
        if (hint && hint.length > BUDGET) over.push(`${id}: ${hint.length} chars`);
      }
    }
  }
  assert.deepEqual(over, [], `wall hints over ${BUDGET} characters`);
});
