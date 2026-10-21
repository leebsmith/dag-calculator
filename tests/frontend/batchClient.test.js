import test from "node:test";
import assert from "node:assert/strict";

import * as batchClient from "../../frontend/src/adapters/batchClient.js";

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function recordFetch(response, t) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return response;
  };
  t.after(() => {
    delete globalThis.fetch;
  });
  return calls;
}

test("listBatches issues a GET on /batches", async (t) => {
  const calls = recordFetch(jsonResponse([{ id: "b1" }]), t);

  assert.deepEqual(await batchClient.listBatches(), [{ id: "b1" }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/batches");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.body, undefined);
});

test("upsertBatch omits base_updated_at when no baseline is given", async (t) => {
  const calls = recordFetch(jsonResponse({ id: "b1" }), t);

  await batchClient.upsertBatch("b1", { name: "A", roots: {} });

  assert.equal(calls[0].url, "/batches/b1");
  assert.equal(calls[0].init.method, "PUT");
  assert.deepEqual(JSON.parse(calls[0].init.body), { name: "A", roots: {} });
  assert.equal("base_updated_at" in JSON.parse(calls[0].init.body), false);
});

test("upsertBatch carries the observed baseline for optimistic concurrency", async (t) => {
  const calls = recordFetch(jsonResponse({ id: "b1" }), t);

  await batchClient.upsertBatch("b1", { name: "A" }, 42.5);

  assert.deepEqual(JSON.parse(calls[0].init.body), { name: "A", base_updated_at: 42.5 });
});

test("setTrashed patches the trash flag", async (t) => {
  const calls = recordFetch(jsonResponse({ id: "b1", trashed: true }), t);

  await batchClient.setTrashed("b1", true);

  assert.equal(calls[0].url, "/batches/b1");
  assert.equal(calls[0].init.method, "PATCH");
  assert.deepEqual(JSON.parse(calls[0].init.body), { trashed: true });
});

test("deleteBatch returns null for the 204 response", async (t) => {
  const calls = recordFetch({ ok: true, status: 204, json: async () => null }, t);

  assert.equal(await batchClient.deleteBatch("b1"), null);
  assert.equal(calls[0].init.method, "DELETE");
  assert.equal(calls[0].url, "/batches/b1");
});

test("freezeBatch posts the frozen payload to the freeze route", async (t) => {
  const calls = recordFetch(jsonResponse({ id: "f1", status: "frozen" }, 201), t);
  const payload = { valuation: { "batch.target_abv": 5.5 }, provenance: {} };

  const frozen = await batchClient.freezeBatch("b1", payload);

  assert.equal(frozen.id, "f1");
  assert.equal(calls[0].url, "/batches/b1/freeze");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), payload);
});

test("getBatch reads one batch", async (t) => {
  const calls = recordFetch(jsonResponse({ id: "b1" }), t);

  assert.deepEqual(await batchClient.getBatch("b1"), { id: "b1" });
  assert.equal(calls[0].url, "/batches/b1");
  assert.equal(calls[0].init.method, "GET");
});

test("a 409 becomes a CONFLICT SolverError the persistence layer can reconcile", async (t) => {
  recordFetch(
    jsonResponse({ code: "CONFLICT", message: "Batch changed elsewhere", details: { reason: "stale" } }, 409),
    t
  );

  await assert.rejects(
    () => batchClient.upsertBatch("b1", { name: "A" }, 1.0),
    (err) => {
      assert.equal(err.name, "SolverError");
      assert.equal(err.code, "CONFLICT");
      assert.deepEqual(err.details, { reason: "stale" });
      return true;
    }
  );
});
