import test from "node:test";
import assert from "node:assert/strict";

import { flattenResponse, requestJSON, setTokenProvider } from "../../frontend/src/adapters/apiClient.js";

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
  aa_wort: 0.76,
  aa_batch: 0.75,
  hlt: { v_hlt_debt: 1.0, v_hlt_after_strike: 16.0, v_hlt_top_up: 0.0, v_sparge_deliverable: 15.0 },
  mash_thickness_l_per_kg: 3.0,
};

test("flattenResponse maps nested responses to dotted output keys", () => {
  const flat = flattenResponse(BATCH);
  assert.equal(flat["cascade.v_strike"], 14.0);
  assert.equal(flat["hlt.v_hlt_debt"], 1.0);
  assert.equal(flat.sg_post_boil, 1.055);
});

function stubFetch(t, response) {
  const calls = [];
  t.after(() => setTokenProvider(async () => null));
  return {
    calls,
    impl: async (url, init) => {
      calls.push({ url, init });
      return response;
    },
  };
}

test("requestJSON attaches the injected bearer token", async (t) => {
  const { calls, impl } = stubFetch(t, { ok: true, status: 200, json: async () => ({ ok: true }) });
  setTokenProvider(async () => "token-123");

  await requestJSON("/batches", { fetchImpl: impl });

  assert.equal(calls[0].init.headers.Authorization, "Bearer token-123");
});

test("requestJSON omits the header when no token is available", async (t) => {
  const { calls, impl } = stubFetch(t, { ok: true, status: 200, json: async () => ({}) });

  await requestJSON("/batches", { fetchImpl: impl });

  assert.equal("Authorization" in calls[0].init.headers, false);
});

test("requestJSON returns null on 204", async (t) => {
  const { impl } = stubFetch(t, { ok: true, status: 204, json: async () => null });

  assert.equal(await requestJSON("/batches/b1", { method: "DELETE", fetchImpl: impl }), null);
});

test("requestJSON survives a non-JSON error body", async (t) => {
  const { impl } = stubFetch(t, {
    ok: false,
    status: 502,
    json: async () => {
      throw new Error("not json");
    },
  });

  await assert.rejects(
    () => requestJSON("/solve/batch", { method: "POST", body: {}, fetchImpl: impl }),
    (err) => {
      assert.equal(err.code, "HTTP_ERROR");
      assert.equal(err.message, "HTTP 502");
      assert.deepEqual(err.details, {});
      return true;
    }
  );
});

test("requestJSON turns a FastAPI validation array into a readable VALIDATION error", async (t) => {
  const { impl } = stubFetch(t, {
    ok: false,
    status: 422,
    json: async () => ({
      detail: [
        { loc: ["body", "target_abv"], msg: "Input should be greater than 0" },
        { loc: ["body", "cascade", "v_strike"], msg: "Field required" },
      ],
    }),
  });

  await assert.rejects(
    () => requestJSON("/solve/batch", { method: "POST", body: {}, fetchImpl: impl }),
    (err) => {
      assert.equal(err.code, "VALIDATION");
      assert.equal(
        err.message,
        "target_abv: Input should be greater than 0; cascade.v_strike: Field required"
      );
      return true;
    }
  );
});

test("flattenResponse leaves array and scalar roots empty", () => {
  assert.deepEqual(flattenResponse([1, 2, 3]), {});
  assert.deepEqual(flattenResponse(7), {});
  assert.deepEqual(flattenResponse({ list: [1, 2], nested: { flag: false } }), {
    "list": [1, 2],
    "nested.flag": false,
  });
});
