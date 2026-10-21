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
}) {
  const statuses = Object.fromEntries(
    session.boundaryNodes.map((id) => [id, useHttp ? "pending" : "ok"])
  );
  const inflight = new Map(); // fingerprint -> Promise
  let error = null;
  let solveTimer = null;
  let solveToken = 0;

  function emit() {
    onState?.({ statuses: { ...statuses }, error });
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

  async function solveNow() {
    if (!useHttp) {
      compute();
      return;
    }
    const engine = session.getEngine();
    const token = ++solveToken;
    try {
      for (const id of session.boundaryNodes) {
        const { binding, inputs, fingerprint } = engine.boundaryRequest(id);
        if (engine.hasBoundaryResult(fingerprint)) {
          setStatus(id, "ok");
          continue;
        }
        setStatus(id, "pending");
        let promise = inflight.get(fingerprint);
        if (!promise) {
          promise = postJSON(BOUNDARY_URLS[binding], inputs, { fetchImpl })
            .then((response) => engine.applyBoundaryResult(fingerprint, flattenResponse(response)))
            .finally(() => inflight.delete(fingerprint));
          inflight.set(fingerprint, promise);
        }
        await promise;
        setStatus(id, "ok");
      }
      if (token !== solveToken) return;
      error = null;
      emit();
    } catch (err) {
      if (token !== solveToken) return;
      error = err;
      for (const id of session.boundaryNodes) {
        if (statuses[id] === "pending") statuses[id] = "error";
      }
      emit();
    }
    compute();
  }

  function scheduleSolve() {
    if (!useHttp) {
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
    for (const id of session.boundaryNodes) statuses[id] = useHttp ? "pending" : "ok";
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
