import test from "node:test";
import assert from "node:assert/strict";

import { createBoundaryRunner } from "../../frontend/src/adapters/boundaryRunner.js";

function makeEngine() {
  const applied = {};
  const unavailable = new Set();
  const clears = [];
  return {
    applied,
    unavailable,
    clears,
    boundaryRequest(id) {
      return {
        binding: id === "batch" ? "batch_sparge_solver" : "water_chemistry_solver",
        inputs: { node: id },
        fingerprint: `fp-${id}`,
      };
    },
    hasBoundaryResult(fingerprint) {
      return fingerprint in applied;
    },
    applyBoundaryResult(fingerprint, outputs) {
      applied[fingerprint] = outputs;
    },
    markBoundaryUnavailable(id) {
      unavailable.add(id);
    },
    clearBoundaryUnavailable() {
      clears.push([...unavailable]);
      unavailable.clear();
    },
  };
}

function makeSession(engine, nodes) {
  return { boundaryNodes: nodes, getEngine: () => engine };
}

test("solves distinct boundary nodes in parallel", async () => {
  const engine = makeEngine();
  const urls = [];
  let computeCalls = 0;
  const fetchImpl = async (url) => {
    urls.push(url);
    return { ok: true, status: 200, json: async () => ({ value: url }) };
  };

  const runner = createBoundaryRunner({
    session: makeSession(engine, ["batch", "water"]),
    useHttp: true,
    fetchImpl,
    compute: () => {
      computeCalls += 1;
    },
    onState: () => {},
  });

  await runner.solveNow();

  assert.deepEqual(urls.sort(), ["/solve/batch", "/solve/water"]);
  assert.equal(runner.statuses.batch, "ok");
  assert.equal(runner.statuses.water, "ok");
  assert.equal(runner.error, null);
  assert.equal(computeCalls, 1);
});

test("marks only the failing node as error", async () => {
  const engine = makeEngine();
  const fetchImpl = async (url) => {
    if (url === "/solve/water") {
      return { ok: false, status: 422, json: async () => ({ code: "SOLVER_ERROR", message: "boom" }) };
    }
    return { ok: true, status: 200, json: async () => ({ value: 1 }) };
  };

  const runner = createBoundaryRunner({
    session: makeSession(engine, ["batch", "water"]),
    useHttp: true,
    fetchImpl,
    compute: () => {},
    onState: () => {},
  });

  await runner.solveNow();

  assert.equal(runner.statuses.batch, "ok");
  assert.equal(runner.statuses.water, "error");
  assert.equal(runner.error?.code, "SOLVER_ERROR");
  assert.deepEqual([...engine.unavailable], ["water"], "only the failed boundary degrades");
});

test("a later successful solve clears the failed mark", async () => {
  const engine = makeEngine();
  let fail = true;
  const fetchImpl = async (url) => {
    if (url === "/solve/water" && fail) {
      return { ok: false, status: 422, json: async () => ({ code: "SOLVER_ERROR", message: "boom" }) };
    }
    return { ok: true, status: 200, json: async () => ({ value: 1 }) };
  };

  const runner = createBoundaryRunner({
    session: makeSession(engine, ["batch", "water"]),
    useHttp: true,
    fetchImpl,
    compute: () => {},
    onState: () => {},
  });

  await runner.solveNow();
  assert.deepEqual([...engine.unavailable], ["water"]);

  fail = false;
  await runner.solveNow();
  assert.deepEqual([...engine.unavailable], []);
  assert.equal(runner.statuses.water, "ok");
  assert.deepEqual(engine.clears, [[], ["water"]]);
});

test("short-circuits nodes with a cached result", async () => {
  const engine = makeEngine();
  engine.applied["fp-batch"] = { cached: true };
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    return { ok: true, status: 200, json: async () => ({ v: 1 }) };
  };

  const runner = createBoundaryRunner({
    session: makeSession(engine, ["batch", "water"]),
    useHttp: true,
    fetchImpl,
    compute: () => {},
    onState: () => {},
  });

  await runner.solveNow();

  assert.deepEqual(urls, ["/solve/water"]);
  assert.equal(runner.statuses.batch, "ok");
  assert.equal(runner.statuses.water, "ok");
});
