import test from "node:test";
import assert from "node:assert/strict";

import { createTestApp } from "../frontend/appHelpers.js";
import { read, rel, walk } from "./util.js";

// The browser wraps the app in `Alpine.reactive`, so `this` inside every handler
// and getter is a Proxy over the install-time object. Two things break when code
// forgets that:
//
//   - state keyed by the app's *object identity* (a WeakMap, a Set of apps) is
//     registered against the raw object and missed by every lookup, which
//     silently falls back to defaults;
//   - a callback that captured the raw app reads and writes the target directly,
//     so the read registers no dependency and the write fires no trigger.
//
// This guard exercises the app through a proxy of the same shape — plain get/set
// forwarding plus a log of the keys touched — so both failures are visible.

const COLLECTIONS = [
  "grist.major_malts",
  "grist.trace_malts",
  "batch.sugars",
  "batch.boil_hops",
  "batch.whirlpool_hops",
  "batch.dry_hops",
];

const CHROME_FIELDS = [
  "draftAddLabel",
  "draftToolbarNote",
  "draftEmptyText",
  "draftDrawerId",
  "draftTableInspect",
];

function instrumented(app) {
  const reads = [];
  const writes = [];
  const proxy = new Proxy(app, {
    get(target, key, receiver) {
      reads.push(key);
      return Reflect.get(target, key, receiver);
    },
    set(target, key, value, receiver) {
      writes.push(key);
      return Reflect.set(target, key, value, receiver);
    },
  });
  // `main.js` registers the wrapper as the live view; the injected `getView`
  // seam reads it back, so the harness must bind the proxy it made.
  app.bindReactive(proxy);
  return { proxy, reads, writes };
}

test("the shared catalog chrome resolves through the reactive proxy", () => {
  const app = createTestApp();
  const { proxy } = instrumented(app);

  for (const nodeId of COLLECTIONS) {
    app.draftNodeId = nodeId;

    for (const field of CHROME_FIELDS) {
      assert.equal(
        proxy[field],
        app[field],
        `${nodeId}: ${field} falls back to a default behind the proxy`
      );
    }
    assert.deepEqual(proxy.draftTotals, app.draftTotals, `${nodeId}: draftTotals`);
    assert.notEqual(proxy.draftAddLabel, "", `${nodeId} has no add label`);
  }
});

test("a catalog-config callback runs against the live receiver", () => {
  const app = createTestApp();
  const { proxy, reads, writes } = instrumented(app);

  proxy.draftNodeId = "batch.boil_hops";
  proxy.setDraftCatalogForm("whole_cone");

  assert.equal(proxy.draftCatalogForm, "whole_cone");
  assert.ok(
    writes.includes("hopCatalogForm"),
    "the form handler wrote through the app instead of a captured reference"
  );

  reads.length = 0;
  void proxy.draftCatalog;
  assert.ok(
    reads.includes("hopCatalogForm"),
    "the catalog getter read the form through the app, so the view tracks it"
  );
});

test("adapters and stores key no state on the app's object identity", () => {
  const files = [
    ...walk("frontend/src/adapters", [".js"]),
    ...walk("frontend/src/store", [".js"]),
  ].map(rel);

  const offenders = [];
  for (const file of files) {
    const hits = read(file).match(/\bnew (?:WeakMap|WeakSet)\s*\(/g);
    if (hits) offenders.push(`${file}: ${hits.join(", ")}`);
  }

  assert.deepEqual(
    offenders,
    [],
    "the app is an Alpine proxy in the browser: key app state by a symbol or a " +
      "string, never by the install-time object's identity"
  );
});
