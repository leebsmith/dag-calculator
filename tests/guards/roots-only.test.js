import test from "node:test";
import assert from "node:assert/strict";
import { createStepApp } from "../../frontend/src/adapters/stepAdapter.js";
import { artifact } from "./util.js";

// A4: the master store holds only root/choice ids — never derived/selection/
// collection ids. Collections live outside the roots store.
test("A4: roots-only master store", () => {
  const app = createStepApp();
  app.init();

  app.edit(app.fieldsBySlice.mash.find((f) => f.id === "mash.grain_temp_c"), "22");
  app.edit(app.fieldsBySlice.batch.find((f) => f.id === "batch.topology"), "runoff_ratio");
  const grist = app.fieldsBySlice.fermentables.find((f) => f.control === "collection-table");
  app.editCell(grist, 0, "pct", "0.9");

  const a = artifact();
  for (const id of Object.keys(app.master.allRoots())) {
    assert.ok(["root", "choice"].includes(a.nodes[id]?.kind), `store holds non-root "${id}"`);
  }
});
