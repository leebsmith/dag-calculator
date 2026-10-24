import test from "node:test";
import assert from "node:assert/strict";

import { createLibrary, LEGACY_STORAGE_KEY } from "../../frontend/src/store/library.js";
import { createReferenceCache } from "../../frontend/src/store/referenceCache.js";
import { createTestApp } from "./appHelpers.js";
import { CATALOGS } from "../../frontend/src/store/userCatalog.js";

function makeClient(initial = {}) {
  const docs = {};
  for (const [kind, records] of Object.entries(initial)) {
    docs[kind] = Object.fromEntries(records.map((record) => [record.id, record]));
  }
  const calls = [];
  let auto = 0;
  return {
    calls,
    async listCatalog(kind) {
      calls.push({ op: "list", kind });
      return Object.values(docs[kind] ?? {});
    },
    async createCatalog(kind, component) {
      calls.push({ op: "create", kind, component });
      const id = `rec-${++auto}`;
      const record = {
        id,
        kind,
        component: { ...component, [CATALOGS[kind].idField]: id },
        created_at: auto,
        schema_version: 4,
      };
      docs[kind] = { ...docs[kind], [id]: record };
      return record;
    },
    async deleteCatalog(kind, itemId) {
      calls.push({ op: "delete", kind, itemId });
      delete docs[kind]?.[itemId];
      return null;
    },
    docs,
  };
}

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    dump: () => Object.fromEntries(map),
  };
}

test("refresh loads records by kind and create/remove mutate the local view", async () => {
  const client = makeClient({
    yeast: [{ id: "y1", kind: "yeast", component: { id: "y1", name: "House Yeast" } }],
  });
  let changes = 0;
  const library = createLibrary({ client, onChange: () => (changes += 1) });

  await library.refresh();
  assert.deepEqual(library.list("yeast").map((item) => item.id), ["y1"]);

  await library.create("malt", { name: "House Malt", category: "BASE" });
  assert.equal(library.list("malt")[0].name, "House Malt");
  assert.ok(library.has("malt", "rec-1"));

  await library.remove("malt", "rec-1");
  assert.equal(library.list("malt").length, 0);
  assert.ok(changes >= 3);
});

test("a failed fetch is library-local state and preserves loaded items", async () => {
  const client = makeClient({
    yeast: [{ id: "y1", kind: "yeast", component: { id: "y1", name: "House Yeast" } }],
  });
  const library = createLibrary({ client });
  await library.refresh();

  client.listCatalog = async (kind) => {
    if (kind === "hop") throw new Error("offline");
    return [];
  };
  await library.refresh();

  assert.equal(library.error().message, "offline");
  assert.equal(library.list("yeast").length, 1);
  assert.doesNotThrow(() => library.list("malt"));
});

test("a failed library fetch does not break a loaded batch", async () => {
  const cache = createReferenceCache();
  const [yeastId, yeast] = Object.entries(cache.references.yeast)[0];
  const failing = {
    listCatalog: async () => {
      throw new Error("offline");
    },
    createCatalog: async () => ({}),
    deleteCatalog: async () => null,
  };

  const app = createTestApp({ libraryClient: failing });
  await app.boot();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(app.libraryError.message, "offline");

  await app.loadState({
    roots: { "batch.yeast_id": yeastId },
    collections: {},
    selections: { "batch.yeast": yeast },
  });
  assert.equal(app.selectedYeast.name, yeast.name);
});

test("library records overlay seeds and removing them reveals the seed again", () => {
  const cache = createReferenceCache();
  const [seedId, seed] = Object.entries(cache.references.yeast)[0];

  cache.syncLibraryItems({
    yeast: { [seedId]: { ...seed, name: "My House Version" } },
  });
  assert.equal(cache.references.yeast[seedId].name, "My House Version");
  assert.equal(cache.isLibraryItem(seedId), true);

  cache.syncLibraryItems({});
  assert.equal(cache.references.yeast[seedId].name, seed.name);
  assert.equal(cache.isLibraryItem(seedId), false);
});

test("legacy localStorage items are posted once and the key is removed", async () => {
  const client = makeClient();
  const library = createLibrary({ client });
  const storage = memoryStorage({
    [LEGACY_STORAGE_KEY]: JSON.stringify({
      schema_version: 4,
      catalogs: {
        malt: { "u:house-malt": { id: "u:house-malt", name: "House Malt", category: "BASE" } },
        water_report: {
          "u:my-water": { report_id: "u:my-water", laboratory: "My Tap", calcium_ca: 40 },
        },
      },
    }),
  });

  const { imported } = await library.importLegacy({ storage });

  assert.equal(imported, 2);
  const creates = client.calls.filter((c) => c.op === "create");
  assert.deepEqual(creates.map((c) => c.kind), ["malt", "water_report"]);
  assert.equal("id" in creates[0].component, false);
  assert.equal("report_id" in creates[1].component, false);
  assert.equal(storage.getItem(LEGACY_STORAGE_KEY), null);
});

test("legacy import logs and continues past a failed component", async (t) => {
  const client = makeClient();
  let attempts = 0;
  const original = client.createCatalog;
  client.createCatalog = async (kind, component) => {
    attempts += 1;
    if (attempts === 1) throw new Error("bad component");
    return original(kind, component);
  };
  const errors = [];
  t.mock.method(console, "error", (...args) => errors.push(args[0]));

  const library = createLibrary({ client });
  const storage = memoryStorage({
    [LEGACY_STORAGE_KEY]: JSON.stringify({
      catalogs: {
        malt: {
          "u:one": { name: "One", category: "BASE" },
          "u:two": { name: "Two", category: "BASE" },
        },
      },
    }),
  });

  const { imported } = await library.importLegacy({ storage });

  assert.equal(imported, 1);
  assert.equal(errors.length, 1);
  assert.equal(storage.getItem(LEGACY_STORAGE_KEY), null);
});
