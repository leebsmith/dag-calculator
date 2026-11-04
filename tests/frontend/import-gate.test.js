import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { gateSummary, runGate } from "../../frontend/src/adapters/importGate.js";
import { buildDelta } from "../../frontend/src/adapters/importDelta.js";
import { projectImport } from "../../frontend/src/adapters/importProjection.js";
import { applyRef, buildLedger } from "../../frontend/src/views/import/ledger.js";

const FIXTURE = new URL("../backend/fixtures/llm/pristine-black-ipa/response.json", import.meta.url);

const IDENTITY = {
  style: { id: "s", name: "Black IPA" },
  equipment: {
    id: "e",
    name: "20 L rig",
    max_kettle_volume_l: 40,
    max_hlt_volume_l: 40,
    max_mash_tun_volume_l: 40,
    hlt_dead_space_l: 0.5,
    hlt_transfer_loss_l: 0.5,
    hlt_coil_floor_l: 2,
    kettle_dead_space_l: 1,
    kettle_transfer_loss_l: 0.5,
    trub_loss_l: 0.5,
    mash_dead_space_l: 0.5,
    mash_transfer_loss_l: 0.4,
    grain_absorption_factor_l_per_kg: 0.9,
    shrinkage_pct: 0.04,
    nominal_conversion_efficiency: 0.7,
    nominal_boil_off_rate_l_per_hr: 3,
  },
  "water.source": { id: "w", name: "Tap", calcium_ca: 60, magnesium_mg: 10, sodium_na: 20,
    sulfate_so4: 80, chloride_cl: 40, alkalinity_as_caco3: 60 },
};

const BATCH = {
  sg_post_boil: 1.07,
  v_pre_boil: 24,
  s_post_boil_target: 4.4,
  m_grist: 5,
  sg_pre_boil: 1.05,
  cascade: {
    v_strike: 15, v_run1: 8, v_run2: 14, v_sparge: 14,
    s_run1: 2.4, s_run2: 0.6, sg_pre_boil: 1.05, v_post_boil: 21,
  },
};
const HOPS = { boil_rows: [], whirlpool_rows: [], whirlpool_timeline: [], whirlpool_chills: [] };
const WATER = { strategy: "balanced", prescription: { predicted_mash_ph: 5.3, mash_ph_status: "ok" } };

function payload() {
  const body = JSON.parse(readFileSync(FIXTURE, "utf8"));
  return JSON.parse(body.candidates[0].content.parts[0].text);
}

function state() {
  const ledger = buildLedger(payload()).map((row) => {
    if (row.section === "fermentables") return applyRef(row, { id: `malt-${row.name}` }, "malt");
    if (row.section === "hops") return applyRef(row, { id: `hop-${row.name}` }, "hop");
    if (row.section === "yeasts") return applyRef(row, { id: "y" }, "yeast");
    return row;
  });
  // A catalog record rich enough for the row builders and the solver inputs:
  // the yeast's attenuation cap and STA1 state are batch-solver inputs, so a
  // thin stub cannot build a request at all.
  const catalog = (kind, id) => ({
    id,
    name: id,
    category: "BASE",
    yield_fraction: 0.8,
    yield_basis: "extract",
    fermentability_fraction: 0.7,
    fermentability_basis: "real",
    color_lovibond: 3,
    moisture_fraction: 0.04,
    alpha_acid_pct: 0.1,
    product_form: "t90_pellet",
    attenuation_pct: 0.75,
    attenuation_basis: "apparent",
    sta1: false,
  });
  return projectImport({ payload: payload(), ledger, identity: IDENTITY, catalog });
}

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function fakeFetch(overrides = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const path = String(url);
    calls.push({ path, body: JSON.parse(init.body) });
    const override = overrides[path];
    if (override) return jsonResponse(override.body, override.status);
    if (path.includes("/solve/batch")) return jsonResponse(BATCH);
    if (path.includes("/solve/hops")) return jsonResponse(HOPS);
    return jsonResponse(WATER);
  };
  return { fetchImpl, calls };
}

test("the gate solves every boundary through the runner the editor uses", async () => {
  const { fetchImpl, calls } = fakeFetch();
  const result = await runGate({ state: state(), fetchImpl });
  assert.deepEqual(
    calls.map((call) => call.path.replace(/^.*\/solve/, "/solve")),
    ["/solve/batch", "/solve/hops"],
    "water is skipped when no target profile is chosen"
  );
  assert.deepEqual([result.statuses["solver.batch"], result.statuses["solver.hops"]], ["ok", "ok"]);
  assert.equal(result.advisory.some((finding) => finding.code === "WATER_TARGETS_NOT_SET"), true);
});

test("the runner's own walk decides the order, not the gate", async () => {
  const { fetchImpl } = fakeFetch();
  const result = await runGate({ state: state(), fetchImpl });
  assert.equal(result.blocking.length, 0);
  assert.equal(
    result.advisory.map((finding) => finding.code).join(),
    "WATER_TARGETS_NOT_SET"
  );
});

test("a batch failure blocks", async () => {
  const { fetchImpl } = fakeFetch({
    "/solve/batch": { status: 422, body: { code: "MASH_TOO_THIN", message: "too thin" } },
  });
  const result = await runGate({ state: state(), fetchImpl });
  const blocking = result.blocking.find((finding) => finding.node === "solver.batch");
  assert.ok(blocking, "a failed batch boundary is blocking");
  assert.equal(gateSummary(result, []).ok, false);
});

test("a water failure is advisory, never a veto", async () => {
  const { fetchImpl } = fakeFetch({
    "/solve/water": { status: 422, body: { code: "SALT_SOLVE_FAILED", message: "no solution" } },
  });
  const withTargets = { ...state(), selections: { ...state().selections, "water.target_profile": { id: "t" } } };
  const result = await runGate({ state: withTargets, fetchImpl });
  assert.equal(result.blocking.filter((finding) => finding.node === "solver.water").length, 0);
  assert.equal(result.advisory.some((finding) => finding.node === "solver.water"), true);
});

test("unresolved lines are part of the summary, not the findings", async () => {
  const { fetchImpl } = fakeFetch();
  const result = await runGate({ state: state(), fetchImpl });
  const ledger = [{ line_id: "x", decision: "unresolved" }];
  const summary = gateSummary(result, ledger);
  assert.equal(summary.unresolved, 1);
  assert.equal(summary.ok, false);
});

test("a gate with no findings and no open lines is green", async () => {
  const { fetchImpl } = fakeFetch();
  const result = await runGate({ state: state(), fetchImpl });
  const summary = gateSummary(result, []);
  assert.equal(summary.unresolved, 0);
  assert.equal(summary.blocking, result.blocking.length);
  assert.equal(summary.ok, result.blocking.length === 0);
});


test("the acceptance loop closes: fixture → ledger → projection → gate → delta", async () => {
  const { fetchImpl } = fakeFetch();
  const projected = state();
  const gate = await runGate({ state: projected, fetchImpl });
  const delta = buildDelta({ payload: payload(), ledger: projected ? [] : [], engine: gate.engine });
  assert.equal(gate.blocking.length, 0, "the pristine recipe solves on the test rig");
  assert.ok(delta.targets.some((target) => target.label === "Original gravity"));
});


test("a boundary that cannot be built says why, instead of 'could not run'", async () => {
  const base = state();
  const withTargets = {
    ...base,
    roots: { ...base.roots, "water.target_profile_id": "balanced" },
    // A profile without ion fields: the selection resolves, the request cannot.
    selections: { ...base.selections, "water.target_profile": { id: "balanced", name: "Half a profile" } },
  };
  const { fetchImpl } = fakeFetch();
  const result = await runGate({ state: withTargets, fetchImpl });
  const finding = result.advisory.find((item) => item.node === "solver.water");
  assert.ok(finding, "water is advisory, and it is reported");
  assert.match(finding.message, /fingerprint|undefined|Unknown/);
  assert.equal(result.water, null, "nothing was prescribed, so nothing is summarised");
});
