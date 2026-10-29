// App harness for the suites.
//
// `createTestApp()` builds and returns a fresh app. The shared helpers boot one
// app per suite process and put it back on that boot's baseline before every
// test, so a suite pays for one boot instead of one per test.
//
// The reset is the adapter's sign-out `teardown()` (runner, session, input
// drafts, navigation, compute) plus the two creation-time steps it deliberately
// leaves alone: `teardown()` keeps device-local unit prefs, so `resetUnits()`
// clears them, and the water strategy root is derived by `boot()`'s
// `syncWaterTargets()`, so it is re-derived. The seeded yeast is re-applied last,
// exactly as `createTestApp()` applies it.
//
// What a reset does NOT clear is card-local draft state — `maltDraft`,
// `catalogDraft`, `rowMenu`, `sortOpen`, open drawers and dialogs. A suite that
// opens one of those keeps a per-test `createTestApp()`; that is the boundary,
// not something to discover when a test starts depending on the previous one.

import { createStepApp } from "../../frontend/src/adapters/stepAdapter.js";

export const TEST_YEAST_ID = "fermentis-safale-american-ale-us-05";

function seedYeast(app) {
  app.selectYeast(TEST_YEAST_ID);
}

function wrapLoadState(app, options) {
  const loadState = app.loadState.bind(app);
  app.loadState = async (state) => {
    await loadState(state);
    if (!app.engine.get("batch.yeast_id")) {
      seedYeast(app);
      if (options.useHttp) await app.solveNow();
      else app.compute();
    } else {
      app.compute();
    }
  };
}

export function createTestApp(options = {}) {
  const app = createStepApp(options);
  seedYeast(app);
  wrapLoadState(app, options);
  return app;
}

let shared = null;
let booted = null;

async function bootSharedApp() {
  if (!shared) {
    shared = createTestApp();
    booted = shared.boot();
  }
  await booted;
  return shared;
}

function resetToBaseline(app) {
  app.teardown();
  app.syncWaterTargets();
  // `teardown()` keeps device-local unit prefs on purpose (sign-out preserves
  // them); the reset must not, so clear them when the previous test left any.
  if (Object.keys(app.unitMode).length > 0) app.resetUnits();
  seedYeast(app);
}

// The suite's one app, back on its baseline. Every call resets, so a test never
// inherits the previous test's roots, collections, selections or unit prefs.
export async function sharedTestApp() {
  const app = await bootSharedApp();
  resetToBaseline(app);
  return app;
}

// Test wrapper for a suite that mutates: `test("...", withFreshApp(async (app) => {...}))`.
// A reset costs a teardown and two re-renders; a fresh boot costs an app build
// and a boot, so the wrapper is the cheaper way to start each test from the
// same state.
export function withFreshApp(fn) {
  return async (t) => {
    const app = await sharedTestApp();
    return fn(app, t);
  };
}
