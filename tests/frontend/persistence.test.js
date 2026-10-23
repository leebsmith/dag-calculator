import test from "node:test";
import assert from "node:assert/strict";

import * as persistence from "../../frontend/src/store/persistence.js";

const DEFAULT_IDENTITY = {
  equipment: { id: "rig-1", name: "Test rig", max_hlt_volume_l: 30 },
  "water.source": { report_id: "w-1", laboratory: "Test lab", calcium_ca: 40 },
  style: { id: "21A", name: "American IPA", og_min: 1.05, og_max: 1.07 },
};

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
    async upsertBatch(id, payload, base, force = false) {
      calls.push({ op: "upsert", id, base, force });
      const existing = docs.get(id);
      if (!force && base !== undefined && existing && existing.updated_at !== base) {
        const err = new Error("conflict");
        err.code = "CONFLICT";
        err.details = { reason: "stale", current: { ...existing } };
        throw err;
      }
      const rec = {
        id,
        name: payload.name,
        status: "draft",
        trashed: false,
        roots: payload.roots ?? {},
        collections: payload.collections ?? {},
        selections: payload.selections ?? {},
        identity: payload.identity === null ? undefined : (payload.identity ?? DEFAULT_IDENTITY),
        provenance: payload.provenance ?? {},
        schema_version: payload.schema_version ?? 4,
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
    async renameBatch(id, name) {
      calls.push({ op: "rename", id, name });
      const d = docs.get(id);
      if (!d) throw new Error("not found");
      d.name = name;
      return { ...d };
    },
    async deleteBatch(id) {
      calls.push({ op: "delete", id });
      docs.delete(id);
    },
    async freezeBatch(id, payload) {
      calls.push({ op: "freeze", id, payload });
    },
  };
}

function fakeApp() {
  return {
    loaded: null,
    draftState: () => ({
      identity: DEFAULT_IDENTITY,
      roots: { "mash.grain_temp_c": 20 },
      collections: {},
      selections: {},
      schema_version: 4,
    }),
    async loadState(state) {
      this.loaded = state;
    },
    freezePayload: () => ({ valuation: {}, provenance: {} }),
  };
}

function setup() {
  const client = fakeClient();
  const app = fakeApp();
  persistence.setClient(client);
  persistence.bindApp(app);
  persistence.setStateObserver(null);
  persistence.setRetryDelays([0, 0, 0]);
  persistence.clearActive();
  return { client, app };
}

test("opening a pre-identity record fails loudly", async () => {
  const { client } = setup();
  await client.upsertBatch("legacy", { name: "Legacy", roots: {}, identity: null });
  await assert.rejects(() => persistence.open("legacy"), /predates the identity model/);
});

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

test("renameBatch persists any row and refreshes the active name", async () => {
  const { client } = setup();
  await client.upsertBatch("b1", { name: "Old", roots: {}, collections: {} });
  await persistence.open("b1");

  const renamed = await persistence.renameBatch("b1", "Session IPA");

  assert.equal(renamed.name, "Session IPA");
  assert.equal(persistence.getActive().name, "Session IPA");
  assert.ok(client.calls.some((c) => c.op === "rename" && c.id === "b1" && c.name === "Session IPA"));
});

test("renameBatch leaves another active batch's name alone", async () => {
  const { client } = setup();
  await client.upsertBatch("b1", { name: "One", roots: {}, collections: {} });
  await client.upsertBatch("b2", { name: "Two", roots: {}, collections: {} });
  await persistence.open("b2");

  await persistence.renameBatch("b1", "Renamed");

  assert.equal(persistence.getActive().name, "Two");
});

test("trashBatch soft-deletes a landing row and drops it from the active slot", async () => {
  const { client } = setup();
  await client.upsertBatch("b1", { name: "One", roots: {}, collections: {} });
  await persistence.open("b1");

  await persistence.trashBatch("b1");

  assert.ok(client.calls.some((c) => c.op === "trash" && c.id === "b1" && c.trashed === true));
  assert.equal(persistence.getActive(), null);
});

test("stale baseline conflicts preserve local edits and report conflict", async () => {
  const { client, app } = setup();
  await persistence.createUntitled();
  persistence.queueSave({ delay: 60000 });
  await persistence.flushSave();
  const baseline = persistence.getActive().updated_at;
  app.loaded = { marker: "local-state-preserved" };

  // another session writes, advancing updated_at
  await client.upsertBatch(persistence.getActive().id, { name: "Remote edit", roots: { "mash.grain_temp_c": 30 } }, baseline);

  persistence.queueSave({ delay: 60000 });
  await persistence.flushSave();

  assert.equal(persistence.getSaveState(), "conflict");
  assert.equal(persistence.getActive().name, "Untitled recipe");
  assert.equal(app.loaded.marker, "local-state-preserved");
  assert.equal(persistence.getConflictRemote().name, "Remote edit");
});

test("open hydrates the active batch and loads its state", async () => {
  const { client, app } = setup();
  const stored = await client.upsertBatch("b1", {
    name: "Stored",
    roots: { "mash.grain_temp_c": 18 },
    collections: { "grist.major_malts": [] },
    schema_version: 4,
  });

  const opened = await persistence.open("b1");

  assert.equal(opened.id, "b1");
  assert.deepEqual(persistence.getActive(), {
    id: "b1",
    name: "Stored",
    status: "draft",
    trashed: false,
    persisted: true,
    updated_at: stored.updated_at,
  });
  assert.deepEqual(app.loaded, {
    identity: DEFAULT_IDENTITY,
    roots: { "mash.grain_temp_c": 18 },
    collections: { "grist.major_malts": [] },
    selections: {},
  });
});

test("open propagates a missing batch instead of inventing one", async () => {
  setup();
  await assert.rejects(() => persistence.open("missing"), /not found/);
  assert.equal(persistence.getActive(), null);
});

test("fork copies the frozen batch into a new draft with lineage and selections", async () => {
  const { client, app } = setup();
  await client.upsertBatch("frozen-1", {
    name: "Saison",
    roots: { "mash.grain_temp_c": 20 },
    collections: {},
    selections: { "batch.yeast": { id: "y1", name: "Yeast" } },
    provenance: { "batch.yeast": { source_template_id: "y1" } },
    schema_version: 4,
  });
  client.calls.length = 0;

  const created = await persistence.fork("frozen-1");

  assert.equal(created.name, "Saison (copy)");
  assert.equal(created.status, "draft");
  assert.equal(persistence.getActive().id, created.id);
  assert.deepEqual(app.loaded, {
    identity: DEFAULT_IDENTITY,
    roots: { "mash.grain_temp_c": 20 },
    collections: {},
    selections: { "batch.yeast": { id: "y1", name: "Yeast" } },
  });
  const upsert = client.calls.find((c) => c.op === "upsert");
  assert.equal(upsert.id, created.id);
  assert.equal(upsert.base, undefined);
});

test("freezeActive posts the app's freeze payload, and only for drafts", async () => {
  const { client } = setup();
  await persistence.createUntitled();
  await persistence.flushSave();

  await persistence.freezeActive();

  const freeze = client.calls.find((c) => c.op === "freeze");
  assert.ok(freeze);
  assert.deepEqual(freeze.payload, { valuation: {}, provenance: {} });

  persistence.clearActive();
  await persistence.freezeActive();
  assert.equal(client.calls.filter((c) => c.op === "freeze").length, 1);
});

test("list, restore, and deletePermanent delegate to the client", async () => {
  const { client } = setup();
  await client.upsertBatch("b1", { name: "A", roots: {}, collections: {} });

  const listed = await persistence.list();
  assert.deepEqual(listed.map((record) => record.id), ["b1"]);

  client.calls.length = 0;
  await persistence.restore("b1");
  await persistence.deletePermanent("b1");

  assert.deepEqual(client.calls, [
    { op: "trash", id: "b1", trashed: false },
    { op: "delete", id: "b1" },
  ]);
});

test("a failed autosave is reported and leaves the draft dirty", async (t) => {
  const { client } = setup();
  await persistence.createUntitled();
  const errors = [];
  t.mock.method(console, "error", (message) => errors.push(message));
  client.upsertBatch = async () => {
    throw new Error("offline");
  };

  persistence.queueSave({ delay: 1 });
  // Poll until the retry loop exhausts and the autosave reports, so the in-flight
  // saveNow does not leak into the next test.
  for (let i = 0; i < 200 && errors.length === 0; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  assert.deepEqual(errors, ["autosave failed"]);
  assert.equal(persistence.getActive().persisted, false);
});

test("a conflict reports state without re-reading the remote", async () => {
  const { client } = setup();
  await persistence.createUntitled();
  persistence.queueSave({ delay: 60000 });
  await persistence.flushSave();

  client.upsertBatch = async () => {
    const err = new Error("conflict");
    err.code = "CONFLICT";
    err.details = { reason: "stale", current: null };
    throw err;
  };

  persistence.queueSave({ delay: 60000 });
  await persistence.flushSave();

  assert.equal(persistence.getSaveState(), "conflict");
  assert.equal(persistence.getConflictRemote(), null);
  assert.equal(client.calls.filter((c) => c.op === "get").length, 0);
});

test("force save overwrites the remote and clears the conflict", async () => {
  const { client } = setup();
  await persistence.createUntitled();
  persistence.queueSave({ delay: 60000 });
  await persistence.flushSave();
  const baseline = persistence.getActive().updated_at;

  await client.upsertBatch(persistence.getActive().id, { name: "Remote edit", roots: {} }, baseline);

  persistence.queueSave({ delay: 60000 });
  await persistence.flushSave();
  assert.equal(persistence.getSaveState(), "conflict");

  await persistence.saveNow({ force: true });

  assert.equal(persistence.getSaveState(), "idle");
  assert.equal(persistence.getConflictRemote(), null);
  assert.equal(persistence.getActive().name, "Untitled recipe");
  const upserts = client.calls.filter((c) => c.op === "upsert");
  assert.equal(upserts.at(-1).force, true);
});

test("reload resolves a conflict by re-hydrating the remote record", async () => {
  const { client, app } = setup();
  await persistence.createUntitled();
  persistence.queueSave({ delay: 60000 });
  await persistence.flushSave();
  const baseline = persistence.getActive().updated_at;

  await client.upsertBatch(persistence.getActive().id, { name: "Remote edit", roots: { "mash.grain_temp_c": 30 } }, baseline);

  persistence.queueSave({ delay: 60000 });
  await persistence.flushSave();
  assert.equal(persistence.getSaveState(), "conflict");

  await persistence.resolveConflictByReload();

  assert.equal(persistence.getSaveState(), "idle");
  assert.equal(persistence.getActive().name, "Remote edit");
  assert.deepEqual(app.loaded.roots, { "mash.grain_temp_c": 30 });
});

test("saveState transitions dirty -> saving -> idle on a clean save", async () => {
  const { client } = setup();
  const states = [];
  persistence.setStateObserver(({ state }) => states.push(state));
  await persistence.createUntitled();
  states.length = 0;

  persistence.queueSave({ delay: 60000 });
  assert.deepEqual(states, ["dirty"]);

  await persistence.flushSave();
  assert.deepEqual(states, ["dirty", "saving", "idle"]);
  assert.equal(client.calls.filter((c) => c.op === "upsert").length, 1);
});

test("saveState reaches error after exhausting retries", async () => {
  const { client } = setup();
  const states = [];
  persistence.setStateObserver(({ state }) => states.push(state));
  await persistence.createUntitled();
  states.length = 0;

  let attempts = 0;
  client.upsertBatch = async () => {
    attempts += 1;
    throw new Error("offline");
  };

  persistence.queueSave({ delay: 60000 });
  await assert.rejects(() => persistence.flushSave(), /offline/);

  assert.equal(attempts, 4);
  assert.equal(persistence.getSaveState(), "error");
  assert.deepEqual(states, ["dirty", "saving", "saving", "saving", "saving", "error"]);
});

test("a transient failure recovers within the retry budget", async () => {
  const { client } = setup();
  await persistence.createUntitled();

  let attempts = 0;
  const original = client.upsertBatch;
  client.upsertBatch = async (...args) => {
    attempts += 1;
    if (attempts < 3) throw new Error("offline");
    return original(...args);
  };

  persistence.queueSave({ delay: 60000 });
  await persistence.flushSave();

  assert.equal(attempts, 3);
  assert.equal(persistence.getSaveState(), "idle");
  assert.ok(persistence.getActive().persisted);
});

