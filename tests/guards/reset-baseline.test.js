// Reset baseline: a suite's shared app must come back to the state a fresh boot
// produces. The reset is the adapter's sign-out `teardown()` plus the two
// creation-time steps it deliberately leaves alone (unit prefs, the derived
// water strategy), so this guard mutates the three stores a test touches —
// roots, collections and selections — along with unit prefs and navigation, and
// deep-equals the snapshot against both the boot baseline and a second app's
// fresh boot.

import test from "node:test";
import assert from "node:assert/strict";

import { createTestApp, sharedTestApp } from "../frontend/appHelpers.js";

// Every node's value, so a stale engine shows up even when no field renders it.
function snapshot(app) {
  const draft = app.draftState();
  const payload = app.freezePayload();
  const fields = {};
  for (const [slice, list] of Object.entries(app.fieldsBySlice)) {
    fields[slice] = list.map((field) => ({
      id: field.id,
      value: field.value,
      display: field.display,
      unit: field.unit,
      unitId: field.unitId,
      customized: field.customized,
      decimals: field.decimals,
      status: field.status,
    }));
  }
  return {
    identity: draft.identity,
    roots: draft.roots,
    collections: draft.collections,
    selections: draft.selections,
    valuation: payload.valuation,
    provenance: payload.provenance,
    fields,
    unitMode: { ...app.unitMode },
    findings: app.findings,
    activeIndex: app.activeIndex,
    highwater: app.highwater,
    activeStep: app.activeStep?.id ?? null,
    boundaryStatuses: app.boundaryStatuses,
    boundaryBlocked: app.boundaryBlocked,
  };
}

function mutate(app) {
  app.setRoot("mash.grain_temp_c", 25);
  app.setRoot("water.target.sulfate_so4", 120);
  app.editCell(
    app.fieldsBySlice.fermentables.find((field) => field.control === "collection-table"),
    0,
    "parts",
    "30"
  );
  app.addRow(app.fieldsBySlice["dry-hops"].find((field) => field.control === "collection-table"));
  app.clearYeastSelection();
  app.setUnit("temperature", "degF");
  app.toggleFieldUnit(app.fieldsBySlice.mash.find((field) => field.id === "mash.grain_temp_c"));
  app.next();
  app.compute();
}

test("a reset restores the boot baseline", async () => {
  const app = await sharedTestApp();
  const baseline = snapshot(app);

  mutate(app);
  assert.notDeepEqual(snapshot(app), baseline, "the mutations must move the state");

  assert.equal(await sharedTestApp(), app, "a suite shares one app");
  assert.deepEqual(snapshot(app), baseline);
});

test("the reset baseline is what a fresh boot produces", async () => {
  const fresh = createTestApp();
  await fresh.boot();

  const app = await sharedTestApp();
  assert.deepEqual(snapshot(app), snapshot(fresh));
});
