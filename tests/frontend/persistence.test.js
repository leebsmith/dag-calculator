import test from "node:test";
import assert from "node:assert/strict";

import * as persistence from "../../frontend/src/store/persistence.js";

function fakeClient() {
  const docs = new Map();
  const calls = [];
  let clock = 1;
  return {
    calls,
    async listBatches() {
      calls.push({ op: "list" });
      return [...docs.values()];
    },
    async upsertBatch(id, payload, base) {
      calls.push({ op: "upsert", id, base });
      const existing = docs.get(id);
      if (base !== undefined && existing && existing.updated_at !== base) {
        const err = new Error("conflict");
        err.code = "CONFLICT";
        throw err;
      }
      const rec = {
        id,
        name: payload.name,
        status: "draft",
        trashed: false,
        roots: payload.roots ?? {},
        collections: payload.collections ?? {},
        schema_version: payload.schema_version ?? 2,
        updated_at: clock++,
      };
      docs.set(id, rec);
      return { ...rec };
    },
    async getBatch(id) {
      calls.push({ op: "get", id });
      const d = docs.get(id);
      if (!d) {
        const err = new Error("not found");
        err.code = "HTTP_ERROR";
        throw err;
      }
      return { ...d };
    },
    async setTrashed(id, trashed) {
      calls.push({ op: "trash", id, trashed });
      const d = docs.get(id);
      d.trashed = trashed;
      return { ...d };
    },
    async deleteBatch(id) {
      calls.push({ op: "delete", id });
      docs.delete(id);
    },
    async freezeBatch() {
      calls.push({ op: "freeze" });
    },
  };
}

function fakeApp() {
  return {
    loaded: null,
    draftState: () => ({ roots: { "mash.grain_temp_c": 20 }, collections: {}, schema_version: 2 }),
    async loadState(state) {
      this.loaded = state;
    },
    detectDrift: () => [],
    freezePayload: () => ({ valuation: {}, provenance: {} }),
  };
}

function setup() {
  const client = fakeClient();
  const app = fakeApp();
  persistence.setClient(client);
  persistence.bindApp(app);
  persistence.clearActive();
  return { client, app };
}

test("createUntitled makes no network call and is unpersisted", async () => {
  const { client } = setup();
  const active = await persistence.createUntitled();
  assert.ok(active.id);
  assert.equal(active.name, "Untitled recipe");
  assert.equal(active.persisted, false);
  assert.equal(client.calls.length, 0);
});

test("first flushSave upserts and marks persisted", async () => {
  const { client } = setup();
  await persistence.createUntitled();
  persistence.queueSave({ delay: 60000 });
  await persistence.flushSave();
  assert.equal(client.calls.filter((c) => c.op === "upsert").length, 1);
  assert.equal(client.calls[0].base, undefined);
  assert.equal(persistence.getActive().persisted, true);
  assert.ok(persistence.getActive().updated_at);
});

test("later saves carry the observed updated_at baseline", async () => {
  const { client } = setup();
  await persistence.createUntitled();
  persistence.queueSave({ delay: 60000 });
  await persistence.flushSave();
  const baseline = persistence.getActive().updated_at;

  persistence.queueSave({ delay: 60000 });
  await persistence.flushSave();
  const upserts = client.calls.filter((c) => c.op === "upsert");
  assert.equal(upserts[1].base, baseline);
});

test("queueSave debounces into a single write", async () => {
  const { client } = setup();
  await persistence.createUntitled();
  persistence.queueSave({ delay: 5 });
  persistence.queueSave({ delay: 5 });
  persistence.queueSave({ delay: 5 });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(client.calls.filter((c) => c.op === "upsert").length, 1);
});

test("trashActive abandons an unedited unpersisted draft", async () => {
  const { client } = setup();
  await persistence.createUntitled();
  await persistence.trashActive();
  assert.equal(persistence.getActive(), null);
  assert.equal(client.calls.length, 0);
});

test("trashActive flushes then soft-deletes a persisted draft", async () => {
  const { client } = setup();
  await persistence.createUntitled();
  persistence.queueSave({ delay: 60000 });
  await persistence.flushSave();
  await persistence.trashActive();
  assert.ok(client.calls.some((c) => c.op === "trash" && c.trashed === true));
  assert.equal(persistence.getActive(), null);
});

test("renameActive persists the new name", async () => {
  const { client } = setup();
  await persistence.createUntitled();
  await persistence.renameActive("My Saison");
  const upsert = client.calls.find((c) => c.op === "upsert");
  assert.ok(upsert);
  assert.equal(persistence.getActive().name, "My Saison");
});

test("stale baseline conflicts then re-hydrates from remote", async () => {
  const { client, app } = setup();
  await persistence.createUntitled();
  persistence.queueSave({ delay: 60000 });
  await persistence.flushSave();
  const baseline = persistence.getActive().updated_at;

  // another session writes, advancing updated_at
  await client.upsertBatch(persistence.getActive().id, { name: "Remote edit", roots: { "mash.grain_temp_c": 30 } }, baseline);

  persistence.queueSave({ delay: 60000 });
  await persistence.flushSave();

  assert.equal(persistence.getActive().name, "Remote edit");
  assert.equal(persistence.getActive().updated_at, baseline + 1);
  assert.deepEqual(app.loaded.roots, { "mash.grain_temp_c": 30 });
});
