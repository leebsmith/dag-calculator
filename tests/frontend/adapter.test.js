import test from "node:test";
import assert from "node:assert/strict";

import { createCalculatorApp } from "../../frontend/src/adapters/engineAdapter.js";
import { flattenResponse, SolverError } from "../../frontend/src/adapters/apiClient.js";

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

test("flattenResponse maps nested responses to dotted output keys", () => {
  const flat = flattenResponse(BATCH);
  assert.equal(flat["cascade.v_strike"], 14.0);
  assert.equal(flat["hlt.v_hlt_debt"], 1.0);
  assert.equal(flat.sg_post_boil, 1.055);
});

test("adapter pre-resolves boundaries over HTTP in topo order", async () => {
  const { fetchImpl, calls } = mockFetch({
    "/solve/batch": { status: 200, body: BATCH },
    "/solve/water": { status: 200, body: WATER },
  });
  const app = createCalculatorApp({ useHttp: true, fetchImpl });
  await app.init();

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "/solve/batch"); // batch before water
  assert.equal(calls[1].url, "/solve/water");

  // full BatchSolverRequest body: all 17 declared inputs
  assert.equal(Object.keys(calls[0].body).length, 17);
  for (const k of ["target_abv", "apparent_attenuation", "topology", "grain_bill", "eta_conv"]) {
    assert.ok(k in calls[0].body, `request missing ${k}`);
  }
  assert.equal(calls[0].body.topology, "r_l_to_g");

  // derived nodes resolve synchronously off the cache
  assert.equal(app.boundaryStatuses["solver.batch"], "ok");
  assert.equal(app.boundaryStatuses["solver.water"], "ok");
  assert.equal(app.doughInTarget, 67.0);
  assert.equal(app.mashThickness, 3.0);
  assert.ok(Math.abs(app.strikeTemp - 76.04190476190476) < 1e-6);
  assert.equal(app.mashPhStatus, "OPTIMAL");
  assert.equal(app.boundaryError, null);
});

test("adapter surfaces a SolverError and marks the boundary failed", async () => {
  const { fetchImpl } = mockFetch({
    "/solve/batch": { status: 422, body: { code: "MASH_TOO_THIN", message: "too thin", details: {} } },
  });
  const app = createCalculatorApp({ useHttp: true, fetchImpl });
  await app.init();

  assert.ok(app.boundaryError instanceof SolverError);
  assert.equal(app.boundaryError.code, "MASH_TOO_THIN");
  assert.equal(app.boundaryStatuses["solver.batch"], "error");
});

test("adapter defaults to offline stubs when HTTP is not enabled", async () => {
  const app = createCalculatorApp({ useHttp: false });
  await app.init();
  assert.equal(app.mashThickness, 3.0);
  assert.equal(app.mashPhStatus, "OPTIMAL");
});

test("refresh debounces bursts into a single solve", async () => {
  const { fetchImpl, calls } = mockFetch({
    "/solve/batch": { status: 200, body: BATCH },
    "/solve/water": { status: 200, body: WATER },
  });
  const app = createCalculatorApp({ useHttp: true, fetchImpl, debounceMs: 10 });
  app.refresh();
  app.refresh();
  app.refresh();
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(calls.length, 2, "burst of edits collapses to one batch + one water POST");
});

test("in-flight boundary requests are deduped by fingerprint", async () => {
  const { fetchImpl, calls } = mockFetch({
    "/solve/batch": { status: 200, body: BATCH },
    "/solve/water": { status: 200, body: WATER },
  });
  const app = createCalculatorApp({ useHttp: true, fetchImpl });
  await Promise.all([app.solveNow(), app.solveNow()]);
  assert.equal(calls.length, 2, "concurrent solves share one POST per fingerprint");
});
