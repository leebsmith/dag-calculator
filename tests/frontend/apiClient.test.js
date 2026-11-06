import test from "node:test";
import assert from "node:assert/strict";

import { createApiClient, flattenResponse } from "../../frontend/src/adapters/apiClient.js";

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
  real_attenuation: 0.76,
  apparent_attenuation: 0.75,
  hlt: { v_hlt_debt: 1.0, v_hlt_after_strike: 16.0, v_hlt_top_up: 0.0, v_sparge_deliverable: 15.0 },
  mash_thickness_l_per_kg: 3.0,
};

test("flattenResponse maps nested responses to dotted output keys", () => {
  const flat = flattenResponse(BATCH);
  assert.equal(flat["cascade.v_strike"], 14.0);
  assert.equal(flat["hlt.v_hlt_debt"], 1.0);
  assert.equal(flat.sg_post_boil, 1.055);
});

function stubFetch(response) {
  const calls = [];
  return {
    calls,
    impl: async (url, init) => {
      calls.push({ url, init });
      return response;
    },
  };
}

function stubBlobFetch(response) {
  const calls = [];
  return {
    calls,
    impl: async (url, init) => {
      calls.push({ url, init });
      return response;
    },
  };
}

test("requestBlob returns the artifact and the selection headers", async () => {
  const headers = {
    "Content-Type": "application/pdf",
    "X-Report-Sections": "brewhouse,batch-facts",
    "X-Report-Pages": "3",
    ETag: '"abc"',
  };
  const { calls, impl } = stubBlobFetch({
    ok: true,
    status: 200,
    blob: async () => ({ type: "application/pdf" }),
    headers: { get: (name) => headers[name] ?? null },
  });
  const api = createApiClient({ tokenProvider: async () => "token-123" });

  const report = await api.requestBlob("/batches/b1/report", { fetchImpl: impl });

  assert.equal(calls[0].init.headers.Authorization, "Bearer token-123");
  assert.equal(report.type, "application/pdf");
  assert.equal(report.sections, "brewhouse,batch-facts");
  assert.equal(report.pages, 3);
  assert.equal(report.etag, '"abc"');
});

test("requestBlob surfaces the server's refusal message", async () => {
  const { impl } = stubBlobFetch({
    ok: false,
    status: 422,
    json: async () => ({ detail: "nothing to report: no section is present" }),
  });
  const api = createApiClient();

  await assert.rejects(
    () => api.requestBlob("/batches/b1/report", { fetchImpl: impl }),
    /nothing to report/
  );
  await assert.rejects(
    () => api.requestBlob("/batches/b1/report", { fetchImpl: impl }),
    (err) => err.code === "VALIDATION"
  );
});

test("an instance token provider attaches its bearer token", async () => {
  const { calls, impl } = stubFetch({ ok: true, status: 200, json: async () => ({ ok: true }) });
  const api = createApiClient({ tokenProvider: async () => "token-123" });

  await api.requestJSON("/batches", { fetchImpl: impl });

  assert.equal(calls[0].init.headers.Authorization, "Bearer token-123");
});

test("two clients keep their token providers isolated", async () => {
  const first = createApiClient({ tokenProvider: async () => "first-token" });
  const second = createApiClient();
  const a = stubFetch({ ok: true, status: 200, json: async () => ({}) });
  const b = stubFetch({ ok: true, status: 200, json: async () => ({}) });

  await first.requestJSON("/batches", { fetchImpl: a.impl });
  await second.requestJSON("/batches", { fetchImpl: b.impl });

  assert.equal(a.calls[0].init.headers.Authorization, "Bearer first-token");
  assert.equal("Authorization" in b.calls[0].init.headers, false);
});

test("requestJSON omits the header when no token is available", async () => {
  const { calls, impl } = stubFetch({ ok: true, status: 200, json: async () => ({}) });
  const api = createApiClient();

  await api.requestJSON("/batches", { fetchImpl: impl });

  assert.equal("Authorization" in calls[0].init.headers, false);
});

test("requestJSON returns null on 204", async () => {
  const { impl } = stubFetch({ ok: true, status: 204, json: async () => null });
  const api = createApiClient();

  assert.equal(await api.requestJSON("/batches/b1", { method: "DELETE", fetchImpl: impl }), null);
});

test("requestJSON survives a non-JSON error body", async () => {
  const { impl } = stubFetch({
    ok: false,
    status: 502,
    json: async () => {
      throw new Error("not json");
    },
  });
  const api = createApiClient();

  await assert.rejects(
    () => api.requestJSON("/solve/batch", { method: "POST", body: {}, fetchImpl: impl }),
    (err) => {
      assert.equal(err.code, "HTTP_ERROR");
      assert.equal(err.message, "HTTP 502");
      assert.deepEqual(err.details, {});
      return true;
    }
  );
});

test("requestJSON turns a FastAPI validation array into a readable VALIDATION error", async () => {
  const { impl } = stubFetch({
    ok: false,
    status: 422,
    json: async () => ({
      detail: [
        { loc: ["body", "target_abv"], msg: "Input should be greater than 0" },
        { loc: ["body", "cascade", "v_strike"], msg: "Field required" },
      ],
    }),
  });
  const api = createApiClient();

  await assert.rejects(
    () => api.requestJSON("/solve/batch", { method: "POST", body: {}, fetchImpl: impl }),
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

test("requestJSON surfaces a string detail from a raised HTTPException", async () => {
  const { impl } = stubFetch({
    ok: false,
    status: 422,
    json: async () => ({ detail: "Report bundle rejected: catalog does not cover the state" }),
  });
  const api = createApiClient();

  await assert.rejects(
    () =>
      api.requestJSON("/batches/b1/report-bundle", {
        method: "POST",
        body: {},
        fetchImpl: impl,
      }),
    (err) => {
      assert.equal(err.code, "VALIDATION");
      assert.equal(
        err.message,
        "Report bundle rejected: catalog does not cover the state"
      );
      return true;
    }
  );
});

test("requestJSON keeps HTTP_ERROR for a non-422 string detail", async () => {
  const { impl } = stubFetch({
    ok: false,
    status: 409,
    json: async () => ({ detail: "Drafts have no report bundle; request a preview instead" }),
  });
  const api = createApiClient();

  await assert.rejects(
    () => api.requestJSON("/batches/b1/report-bundle", { fetchImpl: impl }),
    (err) => {
      assert.equal(err.code, "HTTP_ERROR");
      assert.equal(err.message, "Drafts have no report bundle; request a preview instead");
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
