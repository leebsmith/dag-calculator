import test from "node:test";
import assert from "node:assert/strict";
import { sharedTestApp } from "../frontend/appHelpers.js";
import { artifact } from "./util.js";

// A4: the master store holds only root/choice ids — never derived/selection/
// collection ids. Collections live outside the roots store.
test("A4: roots-only master store", async () => {
  const app = await sharedTestApp();

  app.edit(app.fieldsBySlice.mash.find((f) => f.id === "mash.grain_temp_c"), "22");
  app.edit(app.fieldsBySlice.batch.find((f) => f.id === "batch.topology"), "runoff_ratio");
  const grist = app.fieldsBySlice.fermentables.find((f) => f.control === "collection-table");
  app.editCell(grist, 0, "pct", "0.9");

  const a = artifact();
  for (const id of Object.keys(app.master.allRoots())) {
    assert.ok(["root", "choice"].includes(a.nodes[id]?.kind), `store holds non-root "${id}"`);
  }
});

// A4b: a draft that predates a root→derived migration must not carry the stale
// key into the store. `batch.total_water_used` is derived, not a root.
test("A4b: stale non-root draft keys are filtered on load", async () => {
  const app = await sharedTestApp();
  await app.loadState({ roots: { "batch.total_water_used": 15.0 } });
  assert.ok(!("batch.total_water_used" in app.master.allRoots()));
});
