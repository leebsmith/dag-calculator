import test from "node:test";
import assert from "node:assert/strict";

import { flattenResponse } from "../../frontend/src/adapters/apiClient.js";

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

test("flattenResponse maps nested responses to dotted output keys", () => {
  const flat = flattenResponse(BATCH);
  assert.equal(flat["cascade.v_strike"], 14.0);
  assert.equal(flat["hlt.v_hlt_debt"], 1.0);
  assert.equal(flat.sg_post_boil, 1.055);
});
