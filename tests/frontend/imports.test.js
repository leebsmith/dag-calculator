import test from "node:test";
import assert from "node:assert/strict";

import { createImportsStore } from "../../frontend/src/store/imports.js";
import { createObservabilityManager } from "../../frontend/src/observability.js";

const ROWS = [
  { id: "open-1", status: "mapping" },
  { id: "failed-1", status: "failed" },
  { id: "committed-1", status: "committed", batch_id: "batch-1" },
  { id: "committed-2", status: "committed", batch_id: "batch-2" },
];

function makeStore(client = {}) {
  return createImportsStore({
    client: { list: async () => ROWS, ...client },
    readFile: async () => "",
    observability: createObservabilityManager(),
  });
}

test("committed imports are their own receipt strip", () => {
  const store = makeStore();
  store.rows = ROWS;

  assert.deepEqual(
    store.committedRows.map((row) => row.id),
    ["committed-1", "committed-2"]
  );
  assert.deepEqual(
    store.openRows.map((row) => row.id),
    ["open-1"]
  );
});

test("deleting a receipt removes it and refreshes the list", async () => {
  const calls = [];
  const store = makeStore({
    list: async () => {
      calls.push("list");
      return ROWS.filter((row) => row.id !== "committed-1");
    },
    remove: async (id) => {
      calls.push(["remove", id]);
    },
  });
  store.rows = ROWS;

  await store.remove("committed-1");

  assert.deepEqual(calls, [["remove", "committed-1"], "list"]);
  assert.deepEqual(
    store.committedRows.map((row) => row.id),
    ["committed-2"]
  );
});
