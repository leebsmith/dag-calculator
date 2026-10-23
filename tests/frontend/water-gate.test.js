import test from "node:test";
import assert from "node:assert/strict";

import { waterTargetGate, bindGate } from "../../frontend/src/adapters/waterGate.js";
import { createStepApp } from "../../frontend/src/adapters/stepAdapter.js";

const SOURCE = { ca: 40, mg: 8, na: 20, so4: 30, cl: 25, alk: 80 };

// Minimal batch boundary body so the water request can be built.
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

const long = (target) => ({
  calcium_ca: target.ca,
  magnesium_mg: target.mg,
  sodium_na: target.na,
  sulfate_so4: target.so4,
  chloride_cl: target.cl,
  alkalinity_as_caco3: target.alk,
});

function inputs(target, pinned) {
  return { target: long(target), source: long(SOURCE), custom_pinned_ions: pinned };
}

test("the gate allows targets at or above the source", () => {
  const target = { ...SOURCE, so4: 100, cl: 60 };
  assert.equal(waterTargetGate(inputs(target, ["so4", "cl"])), null);
  assert.equal(waterTargetGate(inputs({ ...SOURCE }, ["ca"])), null);
});

test("the gate blocks a pinned target below the source", () => {
  const target = { ...SOURCE, so4: 10 };
  const message = waterTargetGate(inputs(target, ["so4"]));
  assert.match(message, /sulfate/);
  assert.match(message, /Salts only add/);
});

test("the gate ignores unpinned ions", () => {
  const target = { ...SOURCE, so4: 0 };
  assert.equal(waterTargetGate(inputs(target, ["cl"])), null);
});

test("the binding gate only applies to the water solver", () => {
  const gate = bindGate(waterTargetGate);
  const below = inputs({ ...SOURCE, so4: 1 }, ["so4"]);
  assert.equal(gate("batch_sparge_solver", below), null);
  assert.ok(gate("water_chemistry_solver", below));
});

test("a blocked request is never posted", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return {
      ok: true,
      status: 200,
      json: async () => (url === "/solve/batch" ? BATCH : {}),
    };
  };
  const app = createStepApp({ useHttp: true, fetchImpl });
  await app.boot();
  calls.length = 0;

  app.setIdentityComponent("water.source", {
    report_id: "w1",
    laboratory: "Ward",
    calcium_ca: 40,
    magnesium_mg: 8,
    sodium_na: 20,
    sulfate_so4: 30,
    chloride_cl: 25,
    total_alkalinity_caco3: 80,
  });
  app.selectWaterTarget("freeform");
  app.toggleWaterTarget("so4");
  app.editWaterTarget("so4", "10");
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.ok(!calls.includes("/solve/water"), "an unsatisfiable target must not be sent");
  assert.match(String(app.boundaryError?.message ?? ""), /Target below source/);
  assert.equal(app.boundaryStatuses["solver.water"], "error");
});
