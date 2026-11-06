import test from "node:test";
import assert from "node:assert/strict";

import {
  catalogDraftKeys,
  catalogDraftLayer,
  createCatalogDraft,
} from "../../frontend/src/adapters/cards/catalogDraft.js";
import {
  CATALOG_CHROME_KEYS,
  catalogChromeLayer,
  createCatalogChrome,
  createCatalogRegistry,
} from "../../frontend/src/adapters/cards/catalogChrome.js";
import { createMaltLayers, KEYS as MALT_KEYS } from "../../frontend/src/adapters/cards/malt.js";
import {
  createTraceMaltsLayers,
  KEYS as TRACE_KEYS,
} from "../../frontend/src/adapters/cards/trace-malts.js";
import {
  createDryHopLayers,
  KEYS as DRY_HOP_KEYS,
} from "../../frontend/src/adapters/cards/dry-hops.js";
import {
  createLateAdditionsLayers,
  KEYS as LATE_ADDITIONS_KEYS,
} from "../../frontend/src/adapters/cards/late-additions.js";
import { createHopLayers, KEYS as HOP_KEYS } from "../../frontend/src/adapters/cards/hops.js";

const COLLECTIONS = [
  ["malt", "Malt"],
  ["trace", "Trace"],
  ["hop", "Hop"],
  ["whirlpoolHop", "WhirlpoolHop"],
  ["sugar", "Sugar"],
  ["dryHop", "DryHop"],
];

function install(prefix, Cap) {
  const app = {};
  const registry = createCatalogRegistry();
  const getView = () => app;
  const ctx = { cache: { seeds: {} }, getView, registry };
  const draft = createCatalogDraft(
    ctx,
    {
      prefix,
      Cap,
      nodeId: `batch.${prefix}`,
      seedKey: "unused",
      idField: "id",
      makeRow: () => ({ id: "row" }),
    },
    registry
  );
  Object.defineProperties(
    app,
    Object.getOwnPropertyDescriptors(catalogDraftLayer(draft))
  );
  Object.defineProperties(
    app,
    Object.getOwnPropertyDescriptors(catalogChromeLayer(createCatalogChrome({ registry, getView })))
  );
  return app;
}

test("the declared keys are exactly what the installer installs", () => {
  for (const [prefix, Cap] of COLLECTIONS) {
    const app = install(prefix, Cap);
    const declared = new Set([...catalogDraftKeys(prefix, Cap), ...CATALOG_CHROME_KEYS]);
    const installed = new Set(Object.getOwnPropertyNames(app));
    assert.deepEqual(
      [...installed].filter((key) => !declared.has(key)),
      [],
      `${prefix}: undeclared members`
    );
    assert.deepEqual(
      [...declared].filter((key) => !installed.has(key)),
      [],
      `${prefix}: declared but not installed`
    );
  }
});

test("a collection's key list has no duplicate names", () => {
  for (const [prefix, Cap] of COLLECTIONS) {
    const keys = catalogDraftKeys(prefix, Cap);
    assert.equal(new Set(keys).size, keys.length, `${prefix}: duplicate key`);
  }
});

function layerContext() {
  return {
    artifact: { nodes: {}, primitive_schemas: {}, taxonomies: {}, dimensions: {} },
    cache: { seeds: {}, references: {} },
    engine: { get: () => undefined, resolve: () => undefined, call: () => 0 },
    ui: { unitMode: {} },
    observability: { reportError() {} },
    getView: () => ({}),
    registry: createCatalogRegistry(),
  };
}

function layerKeys(layers) {
  return new Set(layers.flatMap((layer) => Object.getOwnPropertyNames(layer)));
}

const CATALOG_CARDS = [
  ["malt", createMaltLayers, MALT_KEYS, "grist.major_malts"],
  ["trace", createTraceMaltsLayers, TRACE_KEYS, "grist.trace_malts"],
  ["dryHop", createDryHopLayers, DRY_HOP_KEYS, "batch.dry_hops"],
  ["sugar", createLateAdditionsLayers, LATE_ADDITIONS_KEYS, "batch.sugars"],
  ["hop", createHopLayers, HOP_KEYS, "batch.boil_hops"],
];

test("each catalog card factory covers exactly its declared surface", () => {
  for (const [name, factory, keys, nodeId] of CATALOG_CARDS) {
    const ctx = layerContext();
    const layers = factory(ctx);

    assert.ok(Array.isArray(layers), `${name}: returns a layer list`);
    assert.ok(layers.length >= 2, `${name}: draft layer plus card layer`);
    assert.deepEqual(
      [...layerKeys(layers)].sort(),
      [...keys].sort(),
      `${name}: layers cover the declared surface`
    );
    assert.ok(ctx.registry.get(nodeId), `${name}: draft entry registered`);
  }
});
