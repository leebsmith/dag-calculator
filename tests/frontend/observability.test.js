import test from "node:test";
import assert from "node:assert/strict";

import {
  errorCounters,
  reportError,
  resetErrorObservability,
} from "../../frontend/src/observability.js";

test("reportError logs each signature once and counts repeats", (t) => {
  resetErrorObservability();
  const logs = [];
  t.mock.method(console, "error", (scope, err) => logs.push(`${scope}:${err?.message ?? err}`));

  reportError("scopeA", new Error("boom"));
  reportError("scopeA", new Error("boom"));
  reportError("scopeA", new Error("boom"));
  reportError("scopeB", new Error("boom"));

  assert.deepEqual(logs, ["[scopeA]:boom", "[scopeB]:boom"]);
  assert.equal(errorCounters()["scopeA: boom"], 3);
  assert.equal(errorCounters()["scopeB: boom"], 1);
  resetErrorObservability();
});
