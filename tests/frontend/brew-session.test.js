import test from "node:test";
import assert from "node:assert/strict";

import { createBrewSessionStore } from "../../frontend/src/store/brewSession.js";

const TABLE = [
  {
    kind: { text: "step" },
    step_id: { text: "mash-ph" },
    phase: { text: "Brew day" },
    section: { text: "Mash" },
    title: { text: "Mash pH" },
    text: { text: "Target 5.4." },
    done_when: { text: "The mash pH is in band." },
  },
  {
    kind: { text: "observation" },
    metric_id: { text: "mash.ph" },
    step_id: { text: "mash-ph" },
    title: { text: "Mash pH" },
    expected: { text: "5.4" },
    expected_number: { text: "5.4" },
    unit: { text: "pH" },
    method: { text: "pH meter, test strips" },
    tolerance: { text: '{"min":5.2,"max":5.6}' },
  },
];

function fakeClient() {
  let current = null;
  const sessions = [];
  return {
    async listSessions(batchId) {
      return sessions.filter((session) => session.batch_id === batchId);
    },
    async getSession(id) {
      return current ?? sessions.find((session) => session.id === id);
    },
    async createSession(payload) {
      current = {
        id: "s1",
        status: "planned",
        level: payload.level,
        started_at: payload.started_at ?? 1,
        plan_snapshot: payload.plan_snapshot,
        steps: {},
        observations: [],
        finalized_at: null,
        ...payload,
      };
      sessions.unshift(current);
      return current;
    },
    async patchSession(id, payload) {
      current = { ...current, ...payload };
      return current;
    },
    async addObservation(id, observation) {
      current = {
        ...current,
        observations: [
          ...current.observations,
          { ...observation, id: `o${current.observations.length + 1}`, recorded_at: 2 },
        ],
      };
      return current;
    },
    async patchObservation(id, observationId, payload) {
      current = {
        ...current,
        observations: current.observations.map((observation) =>
          observation.id === observationId ? { ...observation, ...payload } : observation
        ),
      };
      return current;
    },
    async finalizeSession() {
      current = { ...current, status: "sealed", finalized_at: 3 };
      return current;
    },
  };
}

function bundle() {
  return {
    bundle: {
      artifact: { hash: "sha256:test" },
      state: { valuation: { "batch.checklist_level": "info" } },
      formatted_tables: { "batch.brew_checklist": TABLE },
    },
  };
}

test("a session snapshots the frozen checklist and records steps", async () => {
  const store = createBrewSessionStore({ client: fakeClient(), loadBundle: async () => bundle() });
  await store.openFor({ id: "b1", name: "House Pale" });
  assert.equal(store.open, true);
  assert.equal(store.session, null);

  await store.startSession();
  assert.equal(store.session.batch_id, "b1");
  assert.equal(store.stepRows.length, 1);
  assert.equal(store.observationRows.length, 1);

  const step = store.stepRows[0];
  await store.setStep(step, { done: true, note: "5.3 at 20 C" });
  assert.equal(store.isStepDone(step), true);
  assert.equal(store.stepNote(step), "5.3 at 20 C");
  assert.deepEqual(store.summary, { total: 1, done: 1 });
});

test("observations become variance and a seal blocks new writes", async () => {
  const store = createBrewSessionStore({ client: fakeClient(), loadBundle: async () => bundle() });
  await store.openFor({ id: "b1", name: "House Pale" });
  await store.startSession();

  const row = store.observationRows[0];
  store.setDraft("mash.ph", "raw", "5.3");
  store.setDraft("mash.ph", "method", "pH meter");
  await store.addReading(row);

  assert.equal(store.observationsFor("mash.ph").length, 1);
  const variance = store.variance.find((entry) => entry.label === "Mash pH");
  assert.equal(variance.actual, "5.3");
  assert.equal(variance.verdict, "within");

  await store.finalize();
  assert.equal(store.sealed, true);
});

test("draftFor is read-only and createDraft performs the initialization", async () => {
  const store = createBrewSessionStore({ client: fakeClient(), loadBundle: async () => bundle() });
  await store.openFor({ id: "b1", name: "House Pale" });
  await store.startSession();

  const row = store.observationRows[0];
  const empty = store.draftFor(row);
  assert.deepEqual(empty, {
    raw: "",
    corrected: "",
    method: "",
    rawUnit: "",
    sampleTempC: "",
    brix: "",
    originalBrix: "",
    at: "",
    source: "live",
    note: "",
  });
  assert.deepEqual(store.observationDrafts, {}, "reading a draft never creates one");

  const draft = store.createDraft(row);
  assert.equal(store.observationDrafts["mash.ph"], draft);
  assert.equal(draft.method, "pH meter, test strips");
  assert.equal(draft.rawUnit, "pH");
  assert.match(draft.at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  assert.equal(draft.source, "live");
  assert.equal(store.draftFor(row), draft);
  assert.equal(store.createDraft(row), draft, "initialization is idempotent");
});

test("opening a batch reuses its most recent session", async () => {
  const client = fakeClient();
  const store = createBrewSessionStore({ client, loadBundle: async () => bundle() });
  await store.openFor({ id: "b1", name: "House Pale" });
  await store.startSession();
  const id = store.session.id;

  const reopened = createBrewSessionStore({ client, loadBundle: async () => bundle() });
  await reopened.openFor({ id: "b1", name: "House Pale" });
  assert.equal(reopened.session.id, id);
});
