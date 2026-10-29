// Reset baseline: a suite's shared app must come back to the state a fresh boot
// produces. The reset is the adapter's sign-out `teardown()` plus the two
// creation-time steps it deliberately leaves alone (unit prefs, the derived
// water strategy), so this guard mutates the three stores a test touches —
// roots, collections and selections — along with unit prefs and navigation, and
// deep-equals the whole app against both the boot baseline and a second app's
// fresh boot.

import test from "node:test";
import assert from "node:assert/strict";

import { createTestApp, sharedTestApp } from "../frontend/appHelpers.js";

// Reactive signals, not state: they only ever count up, so a reset cannot put
// them back and no assertion reads an absolute value.
const REVISIONS = new Set(["catalogRevision", "libraryRevision"]);

function isPlain(value) {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return true;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// Every enumerable app value a template can bind to: card-local state included,
// so a field model that renders correct HTML over a leaked draft still fails.
// Values are copied because card state is mutated in place (unit prefs live in
// the store object the app mirrors). A JSON copy keeps the bound data and drops
// the closures a store object carries, which no template binds to.
function surface(app) {
  const out = {};
  for (const key of Object.keys(app)) {
    if (REVISIONS.has(key) || typeof app[key] === "function") continue;
    if (!isPlain(app[key])) continue;
    out[key] = JSON.parse(JSON.stringify(app[key]));
  }
  return out;
}

// The engine side: every node's value, so a stale engine shows up even when no
// field renders it.
function state(app) {
  const draft = app.draftState();
  const payload = app.freezePayload();
  return {
    surface: surface(app),
    identity: draft.identity,
    roots: draft.roots,
    collections: draft.collections,
    selections: draft.selections,
    valuation: payload.valuation,
    provenance: payload.provenance,
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
  const baseline = state(app);

  mutate(app);
  assert.notDeepEqual(state(app), baseline, "the mutations must move the state");

  assert.equal(await sharedTestApp(), app, "a suite shares one app");
  assert.deepEqual(state(app), baseline);
});

test("the reset baseline is what a fresh boot produces", async () => {
  const fresh = createTestApp();
  await fresh.boot();

  const app = await sharedTestApp();
  assert.deepEqual(state(app), state(fresh));
});
