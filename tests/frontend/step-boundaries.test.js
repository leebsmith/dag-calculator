import test from "node:test";
import assert from "node:assert/strict";

import { createStepApp } from "../../frontend/src/adapters/stepAdapter.js";

const BATCH = {
  sg_post_boil: 1.055,
  v_pre_boil: 24.0,
  s_post_boil_target: 2.6,
  m_grist: 4.7,
  cascade: {
    v_strike: 14.0,
    v_run1: 10.0,
    v_run2: 14.0,
    v_sparge: 14.0,
    s_run1: 2.0,
    s_run2: 0.6,
    sg_pre_boil: 1.048,
    v_post_boil: 21.0,
    mash_thickness_l_per_kg: 3.0,
  },
  max_achievable_abv: 10.0,
  hlt: { v_hlt_debt: 1.0, v_hlt_after_strike: 16.0, v_hlt_top_up: 0.0, v_sparge_deliverable: 15.0 },
  mash_thickness_l_per_kg: 3.0,
};

const WATER = {
  strategy: "CALCIUM_FLOOR",
  prescription: {
    predicted_mash_ph: 5.4,
    mash_ph_status: "OPTIMAL",
    residual_hlt_water_l: 0.0,
    sparge_tannin_warning: false,
  },
};

function mockFetch(responses) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    const r = responses[url] ?? { status: 500, body: { code: "HTTP_ERROR", message: "no mock" } };
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  };
  return { fetchImpl, calls };
}

test("offline (default): boundaries are stubbed and reported ok", async () => {
  const app = createStepApp();
  await app.init();
  assert.deepEqual(app.boundaryStatuses, { "solver.batch": "ok", "solver.water": "ok" });
  assert.equal(app.boundaryError, null);
  assert.equal(app.boundaryPending, false);
});

test("http: pre-resolves both boundaries in topo order and computes", async () => {
  const { fetchImpl, calls } = mockFetch({
    "/solve/batch": { status: 200, body: BATCH },
    "/solve/water": { status: 200, body: WATER },
  });
  const app = createStepApp({ useHttp: true, fetchImpl });
  await app.init();

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "/solve/batch"); // batch before water
  assert.equal(calls[1].url, "/solve/water");
  assert.equal(app.boundaryError, null);
  assert.equal(app.boundaryStatuses["solver.batch"], "ok");
  assert.equal(app.boundaryStatuses["solver.water"], "ok");

  // a boundary-derived field reflects the mock response
  const m = app.fieldsBySlice.batch.find((f) => f.id === "solver.batch.sg_post_boil");
  assert.equal(m.value, 1.055);
});

test("http: a solver error surfaces as boundaryError and marks the boundary failed", async () => {
  const { fetchImpl } = mockFetch({
    "/solve/batch": { status: 422, body: { code: "MASH_TOO_THIN", message: "too thin", details: {} } },
  });
  const app = createStepApp({ useHttp: true, fetchImpl });
  await app.init();
  assert.equal(app.boundaryError.code, "MASH_TOO_THIN");
  assert.equal(app.boundaryStatuses["solver.batch"], "error");
});
