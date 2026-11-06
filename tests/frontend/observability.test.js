import test from "node:test";
import assert from "node:assert/strict";

import {
  createObservabilityManager,
  requireObservability,
} from "../../frontend/src/observability.js";

test("reportError logs each signature once and counts repeats", (t) => {
  const observability = createObservabilityManager();
  const logs = [];
  t.mock.method(console, "error", (scope, err) => logs.push(`${scope}:${err?.message ?? err}`));

  observability.reportError("scopeA", new Error("boom"));
  observability.reportError("scopeA", new Error("boom"));
  observability.reportError("scopeA", new Error("boom"));
  observability.reportError("scopeB", new Error("boom"));

  assert.deepEqual(logs, ["[scopeA]:boom", "[scopeB]:boom"]);
  assert.equal(observability.errorCounters()["scopeA: boom"], 3);
  assert.equal(observability.errorCounters()["scopeB: boom"], 1);

  observability.reset();
  assert.deepEqual(observability.errorCounters(), {});
});

test("requireObservability keeps an injected manager and falls back for a bare call", () => {
  const injected = createObservabilityManager({ console: { error() {} } });

  assert.equal(requireObservability(injected, "test"), injected);
  assert.equal(typeof requireObservability(null, "test").reportError, "function");
});

test("two managers keep their failure state isolated", () => {
  const first = createObservabilityManager({ console: { error() {} } });
  const second = createObservabilityManager({ console: { error() {} } });

  first.reportError("scope", new Error("boom"));

  assert.deepEqual(first.errorCounters(), { "scope: boom": 1 });
  assert.deepEqual(second.errorCounters(), {});
});
