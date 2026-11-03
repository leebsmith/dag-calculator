// The shared catalog chrome under the browser's reactive proxy.
//
// `main.js` wraps the adapter's app in `Alpine.reactive`; the raw-app suites
// never do. These tests run through `alpineReactive` so a binding that throws
// only under the proxy fails here instead of in the browser. The regression
// this pins: the entry store was a non-configurable object-valued symbol, and
// @vue/reactivity's proxy invariant refused to return it — every `draft*`
// binding threw, leaving the editors' add buttons dead.

import test from "node:test";
import assert from "node:assert/strict";

import { createTestApp } from "./appHelpers.js";
import { alpineReactive } from "./alpineProxy.js";
import { createReferenceCache } from "../../frontend/src/store/referenceCache.js";
import { CATALOG_CHROME_KEYS } from "../../frontend/src/adapters/cards/catalogChrome.js";

const cache = createReferenceCache();

// Every collection the shared catalog pane drives. The behavioural checks run
// against each editor, not just malt: the chrome is shared, so a proxy-hostile
// member breaks all six.
const EDITORS = [
  { nodeId: "grist.major_malts", open: "openMaltEditor" },
  { nodeId: "grist.trace_malts", open: "openTraceEditor" },
  { nodeId: "batch.sugars", open: "openSugarEditor" },
  { nodeId: "batch.boil_hops", open: "openHopEditor" },
  { nodeId: "batch.whirlpool_hops", open: "openWhirlpoolHopEditor" },
  { nodeId: "batch.dry_hops", open: "openDryHopEditor" },
];

async function proxyApp(styleId = "22A") {
  const app = await alpineReactive(createTestApp());
  const water = Object.values(cache.references.water_report ?? {})[0] ?? {};
  await app.loadState({
    identity: {
      style: cache.references.style[styleId] ?? {},
      equipment: cache.references.equipment?.["herms-30l"] ?? {},
      "water.source": water,
    },
    roots: {},
    collections: {},
    selections: {},
  });
  await app.boot();
  app.compute();
  return app;
}

test("every declared chrome binding reads through the browser proxy", async () => {
  const app = await proxyApp();
  app.openMaltEditor();

  for (const key of CATALOG_CHROME_KEYS) {
    assert.doesNotThrow(() => app[key], `app.${key} must read through the proxy`);
  }
});

test("object-valued symbol stores survive the browser proxy", async () => {
  const app = await proxyApp();
  const stores = Object.getOwnPropertySymbols(app).filter((symbol) => {
    const descriptor = Object.getOwnPropertyDescriptor(app, symbol);
    return (
      descriptor && "value" in descriptor && descriptor.value && typeof descriptor.value === "object"
    );
  });

  assert.ok(stores.length > 0, "the app carries at least the catalog entry store");
  for (const symbol of stores) {
    assert.doesNotThrow(() => app[symbol], `${String(symbol)} must read through the proxy`);
  }
});

test("the malt editor toolbar renders through the browser proxy", async () => {
  const app = await proxyApp();

  app.openMaltEditor();
  assert.equal(app.maltEditorOpen, true);
  assert.equal(app.draftNodeId, "grist.major_malts");
  assert.equal(app.draftAddLabel, "＋ Add Malt from Catalog");
  assert.equal(app.draftAtLimit, false);
  assert.equal(app.draftDrawer, null);
  assert.match(app.draftTotals.value, /100\.0%/);
});

test("the catalog drawer opens and adds a malt through the browser proxy", async () => {
  const app = await proxyApp();

  app.openMaltEditor();
  const before = app.draftRows.length;

  app.openDraftSearch();
  assert.equal(app.maltDrawer, "search", "the editor's own drawer state");
  assert.equal(app.draftDrawer, "search", "the shared chrome binding");
  assert.ok(app.draftStandardGroups.length > 0, "the standard-first browser fills");

  app.selectDraftStandard(app.draftStandardGroups[0].id);
  assert.ok(app.draftStandardName.length > 0);
  const item = app.draftVisibleCatalog[0];
  assert.ok(item, "the drill-down lists malts");

  app.addCatalogItem(item.id);
  assert.equal(app.draftRows.length, before + 1);
  assert.equal(app.maltDrawer, null, "adding closes the drawer");
  assert.match(app.draftTotals.value, /100\.0%/);
});

test("every collection editor opens its drawer and adds through the browser proxy", async () => {
  const app = await proxyApp();

  for (const editor of EDITORS) {
    app[editor.open]();
    assert.equal(app.draftNodeId, editor.nodeId, editor.open);
    assert.notEqual(app.draftAddLabel, "", `${editor.nodeId}: the add label renders`);
    assert.equal(app.draftAtLimit, false, `${editor.nodeId}: the add button is enabled`);

    app.openDraftSearch();
    assert.equal(app.draftDrawer, "search", `${editor.nodeId}: the drawer opens`);

    let item = app.draftVisibleCatalog[0];
    if (app.draftHasStandard) {
      const group = app.draftStandardGroups[0];
      assert.ok(group, `${editor.nodeId}: the standard browser fills`);
      app.selectDraftStandard(group.id);
      item = app.draftVisibleCatalog[0];
    }
    assert.ok(item, `${editor.nodeId}: the catalog offers an entry`);

    const before = app.draftRows.length;
    app.addCatalogItem(item.id);
    assert.equal(app.draftRows.length, before + 1, `${editor.nodeId}: the row is added`);
    assert.equal(app.draftDrawer, null, `${editor.nodeId}: adding closes the drawer`);

    app.closeDraft();
  }
});
