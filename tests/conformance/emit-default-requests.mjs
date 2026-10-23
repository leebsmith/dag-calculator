// Smoke-test data producer (Step D2).
//
// Builds the product UI's DEFAULT recipe through the real step adapter with a
// recording fetch, so the printed bodies are exactly what the browser would POST
// over the seam. The backend smoke test (`tests/backend/conformance/
// test_recipe_smoke.py`) feeds them to the real solvers and asserts a complete,
// error-free recipe. The mock responses only stand in for the network round-trip.
//
// Emits one JSON object on stdout:
//   { requests: [{ url, body }], boundaryError, statuses }

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
  },
};

const requests = [];
const fetchImpl = async (url, opts) => {
  requests.push({ url, body: JSON.parse(opts.body) });
  const body = url.includes("batch") ? BATCH : WATER;
  return { ok: true, status: 200, json: async () => body };
};

const app = createStepApp({ useHttp: true, fetchImpl });
await app.boot();

process.stdout.write(
  JSON.stringify({
    requests,
    boundaryError: app.boundaryError ? app.boundaryError.code ?? String(app.boundaryError) : null,
    statuses: app.boundaryStatuses,
  })
);
