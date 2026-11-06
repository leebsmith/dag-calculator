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
