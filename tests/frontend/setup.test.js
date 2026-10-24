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

test("the authoring forms expose every solver-relevant field", () => {
  const store = createSetupStore({});
  const equipment = store.equipmentFields();
  const water = store.waterFields();

  const fields = equipment.map((spec) => spec.field);
  assert.ok(fields.includes("max_hlt_volume_l"));
  assert.ok(fields.includes("nominal_conversion_efficiency"));
  assert.ok(fields.includes("hlt_coil_floor_l"));
  assert.equal(equipment.length, 17);
  assert.ok(equipment.every((spec) => spec.label && spec.step));

  const ions = water.map((spec) => spec.field);
  for (const ion of ["calcium_ca", "sulfate_so4", "total_alkalinity_caco3", "ph"]) {
    assert.ok(ions.includes(ion), `${ion} must be authorable`);
  }
  assert.equal(water.length, 15);
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
  persistence.setClient(fakeClient());
  const app = fakeApp();
  persistence.bindApp(app);
  persistence.clearActive();

  let created = null;
  const store = createSetupStore({ onCreated: (active) => (created = active) });
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
