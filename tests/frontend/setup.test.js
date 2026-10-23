import test from "node:test";
import assert from "node:assert/strict";

import { createSetupStore } from "../../frontend/src/store/setup.js";
import * as persistence from "../../frontend/src/store/persistence.js";

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
  const equipmentId = store.equipmentOptions()[0].value;

  store.state.equipmentId = equipmentId;
  store.state.waterId = "unknown";
  store.state.styleMode = "experimental";
  store.state.name = "House Pale";

  const identity = store.identity();
  assert.equal(identity.equipment.id, equipmentId);
  assert.equal(identity["water.source"].laboratory, "Unknown source");
  assert.equal(identity["water.source"].calcium_ca, 0);
  assert.equal(identity.style.name, "Experimental");
  assert.equal(identity.style.og_min, 1.04);
});

test("canCreate requires a name, a rig, a water source, and a style", () => {
  const store = createSetupStore({});
  store.openModal();
  assert.equal(store.canCreate(), false);

  store.state.name = "House Pale";
  assert.equal(store.canCreate(), true);

  store.state.styleMode = "experimental";
  assert.equal(store.canCreate(), true);

  store.state.customStyle.og_min = Number.NaN;
  assert.equal(store.canCreate(), false);
});

test("create() persists a batch carrying the identity snapshot", async () => {
  persistence.setClient(fakeClient());
  const app = fakeApp();
  persistence.bindApp(app);
  persistence.clearActive();

  let created = null;
  const store = createSetupStore({ onCreated: (active) => (created = active) });
  store.openModal();
  store.state.name = "House Pale";
  store.state.styleMode = "experimental";

  const active = await store.create();

  assert.ok(active.id);
  assert.equal(active.name, "House Pale");
  assert.equal(created?.id, active.id);
  assert.equal(app.loaded.identity.style.name, "Experimental");
  assert.equal(app.loaded.identity["water.source"].calcium_ca, 0);
  assert.equal(store.state.modalOpen, false);
});
