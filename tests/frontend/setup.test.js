import test from "node:test";
import assert from "node:assert/strict";

import { createSetupStore } from "../../frontend/src/store/setup.js";
import { createPersistenceManager } from "../../frontend/src/store/persistence.js";
import { createReferenceCache } from "../../frontend/src/store/referenceCache.js";
import { createLibrary } from "../../frontend/src/store/library.js";
import { CATALOG_KINDS } from "../../frontend/src/store/userCatalog.js";
import { createTestApp } from "./appHelpers.js";

function fakeClient() {
  const docs = new Map();
  let clock = 1;
  return {
    docs,
    async listBatches() {
      return [...docs.values()];
    },
    async upsertBatch(id, payload) {
      const rec = { id, ...payload, status: "draft", updated_at: clock++ };
      docs.set(id, rec);
      return { ...rec };
    },
    async getBatch(id) {
      return { ...docs.get(id) };
    },
  };
}

function fakeApp() {
  const app = {
    loaded: null,
    draftState() {
      return {
        identity: app.loaded?.identity ?? {},
        roots: {},
        collections: {},
        selections: {},
        schema_version: 4,
      };
    },
    async loadState(state) {
      app.loaded = state;
    },
  };
  return app;
}

test("identity() snapshots the chosen triplet", () => {
  const store = createSetupStore({});
  const styleId = store.styleOptions()[0].value;
  const equipmentId = store.equipmentOptions()[0].value;

  store.state.styleId = styleId;
  store.state.equipmentId = equipmentId;
  store.state.waterId = "unknown";
  store.state.name = "House Pale";

  const identity = store.identity();
  assert.equal(identity.style.id, styleId);
  assert.equal(identity.equipment.id, equipmentId);
  assert.equal(identity["water.source"].laboratory, "Unknown source");
  assert.equal(identity["water.source"].calcium_ca, 0);
});

test("canCreate requires a name, a style, a rig, and a water source", () => {
  const store = createSetupStore({});
  store.openModal();
  assert.equal(store.canCreate(), false);

  store.state.name = "House Pale";
  assert.equal(store.canCreate(), true);

  store.state.styleId = "";
  assert.equal(store.canCreate(), false);
  store.state.styleId = store.styleOptions()[0].value;

  store.state.equipmentId = "";
  assert.equal(store.canCreate(), false);
  store.state.equipmentId = store.equipmentOptions()[0].value;

  store.state.waterId = "";
  assert.equal(store.canCreate(), false);
});

test("store mutations are observable through store.state", () => {
  const store = createSetupStore({});
  const writes = [];
  store.state = new Proxy(store.state, {
    set(target, key, value) {
      writes.push(String(key));
      return Reflect.set(target, key, value);
    },
  });

  store.openModal();

  assert.equal(store.state.modalOpen, true);
  assert.ok(writes.includes("modalOpen"));
  assert.ok(writes.includes("name"));
});

test("prerequisiteStatus names every missing identity source", () => {
  const store = createSetupStore({});
  assert.deepEqual(store.prerequisiteStatus(), { ready: true, missing: [] });
});

test("create() persists a batch carrying the identity snapshot", async () => {
  const app = fakeApp();
  const persistence = createPersistenceManager({ client: fakeClient(), app });

  let created = null;
  const store = createSetupStore({
    persistence,
    onCreated: (active) => (created = active),
  });
  store.openModal();
  store.state.name = "House Pale";

  const active = await store.create();

  assert.ok(active.id);
  assert.equal(active.name, "House Pale");
  assert.equal(created?.id, active.id);
  assert.equal(app.loaded.identity.style.id, store.state.styleId);
  assert.equal(app.loaded.identity["water.source"].calcium_ca, 0);
  assert.equal(store.state.modalOpen, false);
});

test("openModal seeds the dialog from the first asset of each kind", () => {
  const store = createSetupStore({});
  store.state.name = "stale";
  store.state.error = "previous";
  store.state.busy = true;

  store.openModal();

  assert.equal(store.state.modalOpen, true);
  assert.equal(store.state.error, "");
  assert.equal(store.state.busy, false);
  assert.equal(store.state.name, "");
  assert.equal(store.state.equipmentId, store.equipmentOptions()[0].value);
  assert.equal(store.state.styleId, store.styleOptions()[0].value);
  assert.equal(store.state.waterId, "unknown");

  store.closeModal();
  assert.equal(store.state.modalOpen, false);
});

test("equipment and style options are sorted by label", () => {
  const store = createSetupStore({});
  for (const options of [store.equipmentOptions(), store.styleOptions()]) {
    const labels = options.map((option) => option.label);
    assert.deepEqual(labels, [...labels].sort((a, b) => a.localeCompare(b)));
    assert.ok(options.every((option) => option.value !== ""));
  }
});

test("the water picker includes the unknown source with a label for every record", () => {
  const store = createSetupStore({});
  const options = store.waterOptions();

  assert.ok(options.some((option) => option.value === "unknown" && option.label === "Unknown source"));
  assert.ok(options.every((option) => option.value && option.label));
});

test("create() refuses an incomplete dialog without touching persistence", async () => {
  const persistence = createPersistenceManager({ client: fakeClient(), app: fakeApp() });
  const store = createSetupStore({ persistence });
  store.openModal();
  store.state.name = "   ";

  assert.equal(await store.create(), null);
  assert.equal(store.state.modalOpen, true);
});

test("create() re-entrancy is blocked while a create is in flight", async () => {
  const persistence = createPersistenceManager({ client: fakeClient(), app: fakeApp() });
  const store = createSetupStore({ persistence });
  store.openModal();
  store.state.name = "House Pale";
  store.state.busy = true;

  assert.equal(await store.create(), null);
});

test("a failed create surfaces the error and keeps the dialog open", async () => {
  const persistence = createPersistenceManager({
    client: {
      async upsertBatch() {
        throw new Error("backend is down");
      },
    },
    app: fakeApp(),
    retryDelays: [],
  });

  const store = createSetupStore({ persistence });
  store.openModal();
  store.state.name = "House Pale";

  const result = await store.create();

  assert.equal(result, null);
  assert.equal(store.state.error, "backend is down");
  assert.equal(store.state.modalOpen, true);
  assert.equal(store.state.busy, false);
});

test("a non-Error rejection falls back to the generic message", async () => {
  const persistence = createPersistenceManager({
    client: {
      async upsertBatch() {
        throw undefined;
      },
    },
    app: fakeApp(),
    retryDelays: [],
  });

  const store = createSetupStore({ persistence });
  store.openModal();
  store.state.name = "House Pale";

  await store.create();
  assert.equal(store.state.error, "Could not create the batch.");
});

test("refreshAssets re-reads the records and bumps the revision", async () => {
  const records = { style: [], equipment: [], water_report: [] };
  const client = {
    async listCatalog(kind) {
      return records[kind] ?? [];
    },
  };
  const store = createSetupStore({ client });
  const before = store.revision;

  await store.refreshAssets();
  assert.equal(store.revision, before + 1);

  records.equipment.push({
    id: "custom-rig",
    component: { name: "Custom rig", max_kettle_volume_l: 30 },
  });
  await store.refreshAssets();

  const options = store.equipmentOptions();
  assert.ok(options.some((option) => option.value === "custom-rig" && option.label === "Custom rig"));
});

test("the sign-in sequence fetches each catalogue kind once", async () => {
  const lists = [];
  const client = {
    async listCatalog(kind) {
      lists.push(kind);
      return [];
    },
    async createCatalog() {
      throw new Error("not used");
    },
    async deleteCatalog() {
      return null;
    },
  };
  const cache = createReferenceCache();
  const library = createLibrary({
    client,
    onChange: () => cache.syncLibraryItems(library.items()),
  });
  const app = createTestApp({ cache, library });
  const setup = createSetupStore({ client, cache, library });

  await setup.refreshAssets();
  await app.refreshLibraryItems();

  assert.deepEqual([...lists].sort(), [...CATALOG_KINDS].sort());
  assert.equal(lists.length, CATALOG_KINDS.length);
});

test("the setup store and the step app share one reference cache", async () => {
  const records = {};
  let auto = 0;
  const client = {
    async listCatalog(kind) {
      return records[kind] ?? [];
    },
    async createCatalog(kind, component) {
      const id = `rec-${++auto}`;
      const record = { id, kind, component: { ...component, id } };
      (records[kind] ??= []).push(record);
      return record;
    },
    async deleteCatalog() {
      return null;
    },
  };
  const cache = createReferenceCache();
  const library = createLibrary({
    client,
    onChange: () => cache.syncLibraryItems(library.items()),
  });
  const app = createTestApp({ cache, library });
  const setup = createSetupStore({ client, cache, library });

  const malt = await library.create("malt", { name: "Unified Malt", yield_fraction: 0.8 });
  const rig = await library.create("equipment", { name: "Unified Rig", max_kettle_volume_l: 30 });

  assert.equal(app.library, library, "the step app uses the injected library");
  assert.equal(setup.library, library, "the setup store uses the same library");
  assert.equal(app.catalogItem("malt", malt.id)?.name, "Unified Malt");
  assert.equal(setup.item("malt", malt.id)?.name, "Unified Malt");
  assert.ok(setup.items("malt").some((item) => item.id === malt.id));
  assert.ok(setup.equipmentOptions().some((option) => option.value === rig.id));
  assert.equal(app.catalogItem("equipment", rig.id)?.name, "Unified Rig");
});
