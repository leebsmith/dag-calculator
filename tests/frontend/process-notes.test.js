import test from "node:test";
import assert from "node:assert/strict";

import { sharedTestApp } from "./appHelpers.js";

function processField(app) {
  return app.fieldsBySlice.process.find((field) => field.id === "batch.process_notes");
}

test("the process-notes add button waits for the last note to be written", async () => {
  const app = await sharedTestApp();
  app.engine.setCollection("batch.process_notes", []);
  app.compute();

  assert.equal(app.collectionCanAdd(processField(app)), true);
  assert.equal(app.collectionAddLabel(processField(app)), "Add note");

  app.runCollectionAdd(processField(app));
  app.compute();

  assert.equal(app.collectionCanAdd(processField(app)), false);
  assert.equal(app.collectionAddLabel(processField(app)), "Add another note");

  app.editCell(processField(app), 0, "text", "A written note");
  app.compute();

  assert.equal(app.collectionCanAdd(processField(app)), true);
  assert.equal(app.collectionAddLabel(processField(app)), "Add another note");
});
