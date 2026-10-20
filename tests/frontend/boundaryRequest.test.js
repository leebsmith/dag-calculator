import test from "node:test";
import assert from "node:assert/strict";

import { buildBatchRequest } from "../../frontend/src/adapters/boundaryRequest.js";

function stubEngine(rows, fallback) {
  return {
    resolve(path) {
      return path === "batch.grain_moisture_fraction" ? fallback : 0;
    },
    get(id) {
      return id === "grist.major_malts" ? rows : [];
    },
  };
}

test("buildBatchRequest sends per-row moisture with the batch fallback", () => {
  const rows = [
    { pct: 0.6, yield_fraction: 0.8, moisture_fraction: 0.05 },
    { pct: 0.4, yield_fraction: 0.75 },
  ];
  const request = buildBatchRequest(stubEngine(rows, 0.04));

  assert.equal(request.grain_bill[0].mc_i, 0.05, "row moisture wins where present");
  assert.equal(request.grain_bill[1].mc_i, 0.04, "absent moisture falls back to batch value");
});
