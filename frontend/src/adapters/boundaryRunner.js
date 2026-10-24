// Boundary solve runner: debounces edit bursts, supersedes stale solves, dedupes
// in-flight requests by fingerprint, and owns status/error state. The engine and
// session stay synchronous; this is the only I/O seam.

import { flattenResponse, postJSON } from "./apiClient.js";

const BOUNDARY_URLS = {
  batch_sparge_solver: "/solve/batch",
  water_chemistry_solver: "/solve/water",
};

// AI AGENT HOOKS: Use this runner factory for every boundary solve scheduling,
// status, and error transition. Do not duplicated this logic elsewhere.
export function createBoundaryRunner({
  session,
  useHttp = false,
  fetchImpl,
  debounceMs = 300,
  compute,
  onState,
  gate = () => null,
  preGate = () => null,
}) {
  const statuses = Object.fromEntries(
    session.boundaryNodes.map((id) => [id, useHttp ? "pending" : "ok"])
  );
  const extras = Object.fromEntries(
    session.boundaryNodes.map((id) => [id, null])
  );
  const blocked = Object.fromEntries(
    session.boundaryNodes.map((id) => [id, null])
  );
  const inflight = new Map(); // fingerprint -> Promise
  let error = null;
  let solveTimer = null;
  let solveToken = 0;

  function emit() {
    onState?.({
      statuses: { ...statuses },
      error,
      extras: { ...extras },
      blocked: { ...blocked },
    });
  }

  function setStatus(id, value) {
    statuses[id] = value;
    emit();
  }

  function clearTimer() {
    if (solveTimer) {
      clearTimeout(solveTimer);
      solveTimer = null;
    }
  }

  function syncBlockedOffline() {
    const engine = session.getEngine();
    for (const id of session.boundaryNodes) {
      const message = preGate(id, engine);
      blocked[id] = message;
      statuses[id] = message ? "blocked" : "ok";
    }
    emit();
  }

  async function solveNow() {
    if (!useHttp) {
      syncBlockedOffline();
      compute();
      return;
    }
    const engine = session.getEngine();
    const token = ++solveToken;

    // Boundary nodes are topologically ordered, and the water boundary's inputs
    // depend on the batch boundary's outputs, so a node's request can only be
    // built once its upstream boundary has resolved. Walk the order and, within
    // each "frontier" of consecutively-resolvable nodes, solve in parallel via
    // Promise.allSettled; a node whose inputs are not ready yet ends the frontier
    // and is retried on the next pass.
    const nodes = [...session.boundaryNodes];
    for (const id of nodes) blocked[id] = null;
    let firstError = null;
    let index = 0;

    while (index < nodes.length) {
      if (token !== solveToken) return;

      const frontier = [];
      while (index < nodes.length) {
        const id = nodes[index];
        try {
          const preBlocked = preGate(id, engine);
          if (preBlocked) {
            blocked[id] = preBlocked;
            setStatus(id, "blocked");
            index += 1;
            continue;
          }
          const { binding, inputs, fingerprint } = engine.boundaryRequest(id);
          const gateMessage = gate(binding, inputs);
          if (gateMessage) {
            if (!firstError) firstError = new Error(gateMessage);
            setStatus(id, "error");
            index += 1;
            continue;
          }
          if (engine.hasBoundaryResult(fingerprint)) {
            setStatus(id, "ok");
            index += 1;
            continue;
          }
          setStatus(id, "pending");
          frontier.push({ id, binding, inputs, fingerprint });
          index += 1;
        } catch {
          break;
        }
      }

      if (frontier.length === 0) {
        for (let i = index; i < nodes.length; i++) setStatus(nodes[i], "error");
        break;
      }

      const settle = frontier.map(async (job) => {
        const { binding, inputs, fingerprint } = job;
        let promise = inflight.get(fingerprint);
        if (!promise) {
          promise = postJSON(BOUNDARY_URLS[binding], inputs, { fetchImpl })
            .then((response) => {
              engine.applyBoundaryResult(fingerprint, flattenResponse(response));
              return response;
            })
            .finally(() => inflight.delete(fingerprint));
          inflight.set(fingerprint, promise);
        }
        try {
          const response = await promise;
          return { job, response, ok: true };
        } catch (err) {
          return { job, ok: false, err };
        }
      });

      const results = await Promise.allSettled(settle);
      if (token !== solveToken) return;

      const failures = new Map();
      for (const result of results) {
        if (result.status === "rejected") {
          if (!firstError) firstError = result.reason;
          continue;
        }
        if (result.value && !result.value.ok) {
          if (!firstError) firstError = result.value.err;
          failures.set(result.value.job.fingerprint, result.value.err);
        }
      }

      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        const value = result.value;
        if (!value || !value.ok) {
          extras[value?.job?.id] = null;
          continue;
        }
        const { job, response } = value;
        extras[job.id] = {
          telemetry: response?.telemetry ?? [],
          warnings: response?.warnings ?? [],
          notes: response?.notes ?? [],
        };
      }

      for (const job of frontier) {
        setStatus(job.id, failures.has(job.fingerprint) ? "error" : "ok");
      }
    }

    if (token !== solveToken) return;
    error = firstError;
    emit();
    compute();
  }

  function scheduleSolve() {
    if (!useHttp) {
      syncBlockedOffline();
      compute();
      return;
    }
    solveToken++;
    clearTimer();
    solveTimer = setTimeout(() => solveNow(), debounceMs);
  }

  function reset() {
    solveToken++;
    clearTimer();
    inflight.clear();
    for (const id of session.boundaryNodes) {
      statuses[id] = useHttp ? "pending" : "ok";
      extras[id] = null;
      blocked[id] = null;
    }
    error = null;
    emit();
  }

  return {
    statuses,
    get error() {
      return error;
    },
    solveNow,
    scheduleSolve,
    reset,
  };
}
