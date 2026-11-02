import test from "node:test";
import assert from "node:assert/strict";

import {
  catalogDraftKeys,
  installCatalogDraft,
} from "../../frontend/src/adapters/cards/catalogDraft.js";
import { CATALOG_CHROME_KEYS } from "../../frontend/src/adapters/cards/catalogChrome.js";

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
  installCatalogDraft(
    app,
    { cache: { seeds: {} } },
    {
      prefix,
      Cap,
      nodeId: `batch.${prefix}`,
      seedKey: "unused",
      idField: "id",
      makeRow: () => ({ id: "row" }),
    }
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
