import test from "node:test";
import assert from "node:assert/strict";

import { createTestApp } from "./appHelpers.js";
import { fieldsets, homes } from "../../frontend/src/views/fieldsets.js";
import { read } from "../guards/util.js";

const FROZEN = JSON.parse(read("tests/fixtures/field-index.json")).fields;

const app = createTestApp();
await app.boot();

test("the producer's field index is unchanged", () => {
  assert.deepEqual(Object.keys(app.fieldsById).sort(), FROZEN);
});

test("every authored block field resolves to a produced field model", () => {
  const missing = [];
  for (const fieldset of fieldsets) {
    for (const block of fieldset.blocks) {
      if (block.render !== "fields") continue;
      for (const id of block.fields) {
        if (!app.fieldsById[id]) missing.push(`${fieldset.id}/${block.id}: ${id}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test("every produced field with a wall home is declared by that fieldset", () => {
  const undeclared = [];
  for (const [id, fieldsetId] of Object.entries(homes)) {
    if (!fieldsets.some((fieldset) => fieldset.id === fieldsetId)) continue;
    const fieldset = fieldsets.find((candidate) => candidate.id === fieldsetId);
    const declared = fieldset.blocks.flatMap((block) => block.fields);
    if (!declared.includes(id)) undeclared.push(`${fieldsetId}: ${id}`);
  }
  assert.deepEqual(undeclared, []);
});

// The scale pin renders its residual axis as a readout, and the topology choice
// renders the inactive liquor ratio as one. Nothing else on the wall is a readout.
const CONDITIONAL_READOUTS = new Set([
  "batch.target_abv",
  "batch.target_og",
  "batch.target_fg",
  "batch.mash_thickness_l_per_kg",
  "batch.runoff_ratio",
]);

test("readout models are confined to the pin residual and the topology pair", () => {
  const readouts = [];
  for (const fieldset of fieldsets) {
    for (const block of fieldset.blocks) {
      for (const id of block.fields) {
        const field = app.fieldsById[id];
        if (field?.control === "readout" && !CONDITIONAL_READOUTS.has(id)) {
          readouts.push(`${fieldset.id}: ${id}`);
        }
      }
    }
  }
  assert.deepEqual(readouts, []);
});
