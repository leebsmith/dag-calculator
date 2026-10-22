import test from "node:test";
import assert from "node:assert/strict";

import { createStepApp } from "../../frontend/src/adapters/stepAdapter.js";
import { errorCounters, resetErrorObservability } from "../../frontend/src/observability.js";

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
  await app.boot();
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
  await app.boot();

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "/solve/batch"); // batch before water
  assert.equal(calls[1].url, "/solve/water");
  assert.equal(app.boundaryError, null);
  assert.equal(app.boundaryStatuses["solver.batch"], "ok");
  assert.equal(app.boundaryStatuses["solver.water"], "ok");

  // a boundary-derived readout reflects the mock response (rendered in the
  // Water Plan table, via the derived total-water-used node)
  const waterPlan = app.fieldsBySlice.batch.find((f) => f.id === "water-plan");
  assert.ok(waterPlan, "water-plan table present");
  const totalRow = waterPlan.rows.find((r) => r.cells.label.text === "Total Water Used");
  assert.equal(totalRow.cells.value.display, "28.0");
  assert.equal(totalRow.cells.value.unit, "L");
});

test("http: a solver error surfaces as boundaryError and marks the boundary failed", async () => {
  const { fetchImpl } = mockFetch({
    "/solve/batch": { status: 422, body: { code: "MASH_TOO_THIN", message: "too thin", details: {} } },
  });
  const app = createStepApp({ useHttp: true, fetchImpl });
  await app.boot();
  assert.equal(app.boundaryError.code, "MASH_TOO_THIN");
  assert.equal(app.boundaryStatuses["solver.batch"], "error");
});

test("http: a debounced burst collapses into one batch + one water request", async () => {
  const { fetchImpl, calls } = mockFetch({
    "/solve/batch": { status: 200, body: BATCH },
    "/solve/water": { status: 200, body: WATER },
  });
  const app = createStepApp({ useHttp: true, fetchImpl, debounceMs: 10 });
  app.scheduleSolve();
  app.scheduleSolve();
  app.scheduleSolve();
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(calls.length, 2, "burst of edits collapses to one batch + one water POST");
});

test("http: concurrent solveNow calls dedupe by fingerprint", async () => {
  const { fetchImpl, calls } = mockFetch({
    "/solve/batch": { status: 200, body: BATCH },
    "/solve/water": { status: 200, body: WATER },
  });
  const app = createStepApp({ useHttp: true, fetchImpl });
  await Promise.all([app.solveNow(), app.solveNow()]);
  assert.equal(calls.length, 2, "concurrent solves share one POST per fingerprint");
});

test("http: a superseded solve discards its result", async () => {
  let batchCalls = 0;
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    if (url === "/solve/batch" && ++batchCalls === 1) {
      await new Promise((r) => setTimeout(r, 60));
    }
    const r = url === "/solve/batch"
      ? { status: 200, body: BATCH }
      : { status: 200, body: WATER };
    return { ok: true, status: r.status, json: async () => r.body };
  };

  const app = createStepApp({ useHttp: true, fetchImpl, debounceMs: 5 });
  let computes = 0;
  const compute = app.compute.bind(app);
  app.compute = () => {
    computes += 1;
    compute();
  };

  const stale = app.solveNow();
  app.setRoot("batch.target_abv", 6.5);
  app.scheduleSolve();
  await stale;
  await new Promise((r) => setTimeout(r, 90));

  assert.equal(computes, 1, "only the newest solve computes");
  assert.equal(app.boundaryError, null);
  assert.ok(calls.length >= 2, "the superseding solve issued its own requests");
});

test("http: a completed solve leaves an open draft editor intact", async () => {
  const { fetchImpl } = mockFetch({
    "/solve/batch": { status: 200, body: BATCH },
    "/solve/water": { status: 200, body: WATER },
  });
  const app = createStepApp({ useHttp: true, fetchImpl });
  await app.boot();

  app.openDraft("batch.boil_hops");
  app.addDraftRow({
    hop_id: "cascade",
    name: "Cascade",
    alpha_acid_pct: 0.055,
    boil_time_fraction: 1,
    parts: 10,
    pct: 1,
  });
  app.maltDrawer = "search";
  app.maltActiveIndex = 1;
  app.sugarDrawer = "search";

  app.setRoot("batch.target_ibu", 45);
  await app.solveNow();

  assert.equal(app.draftOpen, true);
  assert.equal(app.draftNodeId, "batch.boil_hops");
  assert.equal(app.draftRows.length, 1);
  assert.equal(app.maltDrawer, "search");
  assert.equal(app.maltActiveIndex, 1);
  assert.equal(app.sugarDrawer, "search");
});

test("http: a failed solve leaves an open draft editor intact", async () => {
  const { fetchImpl } = mockFetch({
    "/solve/batch": { status: 422, body: { code: "MASH_TOO_THIN", message: "too thin", details: {} } },
  });
  const app = createStepApp({ useHttp: true, fetchImpl });
  await app.boot();

  app.openDraft("batch.sugars");
  app.addDraftRow({ sugar_id: "table-sugar", name: "Table Sugar", mass_kg: 0.5 });

  await app.solveNow();

  assert.equal(app.boundaryError.code, "MASH_TOO_THIN");
  assert.equal(app.draftOpen, true);
  assert.equal(app.draftNodeId, "batch.sugars");
  assert.equal(app.draftRows.length, 1);
});

test("saveDraft and closeDraft still close the editor", async () => {
  const app = createStepApp();
  await app.boot();

  app.openDraft("batch.sugars");
  app.addDraftRow({ sugar_id: "table-sugar", name: "Table Sugar", mass_kg: 0.5 });
  app.saveDraft();
  assert.equal(app.draftOpen, false);
  assert.equal(app.draftRows.length, 0);

  app.openDraft("batch.sugars");
  assert.equal(app.draftOpen, true);
  app.closeDraft();
  assert.equal(app.draftOpen, false);
  assert.equal(app.draftRows.length, 0);
});

test("http: posts adapted BatchSolverRequest / WaterSolverRequest bodies", async () => {
  const { fetchImpl, calls } = mockFetch({
    "/solve/batch": { status: 200, body: BATCH },
    "/solve/water": { status: 200, body: WATER },
  });
  const app = createStepApp({ useHttp: true, fetchImpl });
  await app.boot();

  const batch = calls.find((c) => c.url === "/solve/batch").body;
  const water = calls.find((c) => c.url === "/solve/water").body;

  // Full Pydantic contract: 20 declared batch inputs.
  assert.equal(Object.keys(batch).length, 20);
  for (const k of ["target_abv", "apparent_attenuation", "topology", "grain_bill", "eta_conv"]) {
    assert.ok(k in batch, `batch request missing ${k}`);
  }
  // Grain rows are renamed to the backend's GristBillRow keys (no raw catalog keys).
  assert.ok(batch.grain_bill.length > 0);
  for (const row of batch.grain_bill) {
    assert.deepEqual(Object.keys(row).sort(), ["mc_i", "w_i", "yield_i"]);
  }
  const wSum = batch.grain_bill.reduce((acc, r) => acc + r.w_i, 0);
  assert.ok(Math.abs(wSum - 1) < 1e-9, `w_i must sum to 1 (got ${wSum})`);

  // Water nests the six working ions (no flat `source.calcium_ca` aliases).
  const ions = ["calcium_ca", "magnesium_mg", "sodium_na", "sulfate_so4", "chloride_cl", "alkalinity_as_caco3"];
  assert.deepEqual(Object.keys(water.source).sort(), [...ions].sort());
  assert.deepEqual(Object.keys(water.target).sort(), [...ions].sort());
  assert.ok(!("source.calcium_ca" in water));
  for (const row of water.grist) {
    assert.deepEqual(Object.keys(row).sort(), ["color_lovibond", "grain_type", "mass_kg"]);
    assert.ok(row.mass_kg > 0, "water grist mass_kg must be positive");
  }
  // Enum values are artifact taxonomy strings, not the legacy aliases.
  assert.equal(batch.topology, "r_l_to_g");
  assert.equal(water.gypsum_form, "GYPSUM_DIHYDRATE");
  assert.equal(water.preferred_alkaline_agent, "PICKLING_LIME");
});

test("http: loadState seeds missing derived roots from the selected profile", async () => {
  const { fetchImpl, calls } = mockFetch({
    "/solve/batch": { status: 200, body: BATCH },
    "/solve/water": { status: 200, body: WATER },
  });
  const app = createStepApp({ useHttp: true, fetchImpl });
  await app.boot();
  calls.length = 0;

  await app.loadState({
    roots: { "water.target_profile_id": "hoppy-ipa", "water.target.sulfate_so4": 111 },
  });

  const water = calls.find((c) => c.url === "/solve/water").body;
  assert.equal(water.target.sulfate_so4, 111, "explicit root wins");
  assert.equal(water.target.chloride_cl, 50, "missing root seeded from the profile");
  assert.equal(water.target.calcium_ca, 0, "the profile declares only the ions it targets");
  assert.equal(water.strategy, "CALCIUM_FLOOR", "strategy derives from the profile's target set");
  assert.deepEqual(water.custom_pinned_ions, ["so4", "cl"], "checked set seeded from positive targets");
});

function boundaryBindingErrors() {
  return Object.keys(errorCounters()).filter((s) => s.includes("No boundary binding registered"));
}

test("http: teardown does not compute before the boundary resolves", () => {
  resetErrorObservability();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const app = createStepApp({ useHttp: true, fetchImpl });

  app.teardown();

  assert.equal(calls, 0, "sign-out must not issue a solve");
  assert.equal(app.boundaryError, null);
  assert.deepEqual(boundaryBindingErrors(), []);
});

test("http: refreshLibraryItems resolves the boundary before computing", async () => {
  resetErrorObservability();
  const { fetchImpl, calls } = mockFetch({
    "/solve/batch": { status: 200, body: BATCH },
    "/solve/water": { status: 200, body: WATER },
  });
  const app = createStepApp({ useHttp: true, fetchImpl });

  await app.refreshLibraryItems();

  assert.deepEqual(calls.map((c) => c.url), ["/solve/batch", "/solve/water"]);
  assert.equal(app.boundaryError, null);
  assert.equal(app.boundaryStatuses["solver.batch"], "ok");
  assert.equal(app.boundaryStatuses["solver.water"], "ok");
  assert.deepEqual(boundaryBindingErrors(), []);
  const waterPlan = app.fieldsBySlice.batch.find((f) => f.id === "water-plan");
  const totalRow = waterPlan.rows.find((r) => r.cells.label.text === "Total Water Used");
  assert.equal(totalRow.cells.value.display, "28.0");
});

test("http: boundary telemetry is retained and cleared on teardown", async () => {
  const waterWithTelemetry = {
    ...WATER,
    telemetry: [
      { code: "ROUTER_MODE_1_LINEAR_FLAVOR", category: "ROUTER", severity: "INFO", message: "m", context: {} },
    ],
    total_added_salt_mass_g: 3.0,
    added_mineral_tds_ppm: 150.0,
  };
  const { fetchImpl } = mockFetch({
    "/solve/batch": { status: 200, body: BATCH },
    "/solve/water": { status: 200, body: waterWithTelemetry },
  });
  const app = createStepApp({ useHttp: true, fetchImpl });
  await app.boot();

  assert.equal(app.waterTelemetry.telemetry[0].code, "ROUTER_MODE_1_LINEAR_FLAVOR");

  app.teardown();
  assert.equal(app.waterTelemetry, null);
});
