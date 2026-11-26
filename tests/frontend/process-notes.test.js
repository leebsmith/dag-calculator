import test from "node:test";
import assert from "node:assert/strict";

import { migrateProcessNotes } from "../../frontend/src/store/batchMigrations.js";
import { sharedTestApp } from "./appHelpers.js";

test("the process step is a prose field, not a collection", async () => {
  const app = await sharedTestApp();

  assert.deepEqual(app.fieldsBySlice.process, []);
  assert.equal(app.processNotesFields()[0].id, "process-notes");

  app.setProcessNotes("0.5 oz (14 g) lemon peel at flame-out");
  const rows = app.reportFormattedTables()["report.process_notes"];

  assert.deepEqual(
    rows.map((row) => row.text.text),
    ["0.5 oz (14 g) lemon peel at flame-out"]
  );
});

test("legacy process-note rows join into the prose field", () => {
  const { state, changed } = migrateProcessNotes({
    roots: {},
    collections: {
      "batch.process_notes": [{ text: "one" }, { text: "   " }, { text: "two" }],
    },
  });

  assert.equal(changed, true);
  assert.equal(state.process_notes, "one\n\ntwo");
  assert.ok(!("batch.process_notes" in state.collections));
});

test("an existing prose field wins over legacy rows", () => {
  const { state } = migrateProcessNotes({
    process_notes: "already written",
    collections: { "batch.process_notes": [{ text: "old" }] },
  });

  assert.equal(state.process_notes, "already written");
  assert.ok(!("batch.process_notes" in state.collections));
});

test("a draft without process notes is left alone", () => {
  const input = { roots: {}, collections: {} };
  const { state, changed } = migrateProcessNotes(input);

  assert.equal(changed, false);
  assert.equal(state, input);
});
