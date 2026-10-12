import test from "node:test";
import assert from "node:assert/strict";

import { canonicalize, canonicalFingerprint, BoundaryCache } from "../../frontend/src/engine/boundary.js";

const BATCH_FINGERPRINT = "9bd6fa642fa9ea996f8575a7b47830125fae17609c475d9e3a50c2e54e99ef0c";
const BATCH_CANONICAL_JSON =
  '{"apparent_attenuation":0.75,"delta_v_evap":3,"eta_conv":0.95,' +
  '"f_shrink":0.04,"grain_bill":[{"mc_i":0.04,"w_i":1,"yield_i":0.8}],' +
  '"hlt_coil_floor_l":0,"hlt_dead_space_l":0,"hlt_starting_volume_l":25,' +
  '"hlt_transfer_loss_l":0,"intensive_value":3,"max_hlt_volume_l":30,' +
  '"s_late_add":0,"target_abv":5.5,"topology":"r_l_to_g","v_dead":0,' +
  '"v_ferm":20,"v_kettle_dead":0}';

function batchRequest() {
  return {
    target_abv: 5.5,
    apparent_attenuation: 0.75,
    v_ferm: 20.0,
    topology: "r_l_to_g",
    intensive_value: 3.0,
    grain_bill: [{ w_i: 1.0, yield_i: 0.8, mc_i: 0.04 }],
    s_late_add: 0.0,
    v_kettle_dead: 0.0,
    delta_v_evap: 3.0,
    v_dead: 0.0,
    eta_conv: 0.95,
    f_shrink: 0.04,
    hlt_starting_volume_l: 25.0,
    hlt_dead_space_l: 0.0,
    hlt_transfer_loss_l: 0.0,
    hlt_coil_floor_l: 0.0,
    max_hlt_volume_l: 30.0,
  };
}

test("canonical JSON matches the backend golden string", () => {
  assert.equal(canonicalize(batchRequest()), BATCH_CANONICAL_JSON);
});

test("fingerprint matches the backend golden SHA-256", () => {
  assert.equal(canonicalFingerprint(batchRequest()), BATCH_FINGERPRINT);
});

test("canonicalize sorts object keys deterministically", () => {
  const a = { z: 1, a: 2, m: { b: 3, a: 4 } };
  assert.equal(canonicalize(a), '{"a":2,"m":{"a":4,"b":3},"z":1}');
});

test("BoundaryCache get/set/has", () => {
  const cache = new BoundaryCache();
  const fp = canonicalFingerprint({ x: 1 });
  assert.equal(cache.has(fp), false);
  cache.set(fp, { outputs: { y: 2 } });
  assert.equal(cache.has(fp), true);
  assert.deepEqual(cache.get(fp), { outputs: { y: 2 } });
});
