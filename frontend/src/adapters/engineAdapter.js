// Thin view adapter: binds Alpine to the DAG engine and the roots-only store.
// No domain computation here — every readout is `engine.get(nodeId)`.
//
// Boundary I/O is async; the engine is sync/pure. The adapter PRE-RESOLVES the
// boundary cache (in topological order), then evaluation is synchronous.
//
// Edits debounce into a single solve; in-flight requests are deduped by
// fingerprint, and a superseded solve discards its (stale) result.

import artifact from "../engine/artifact.json" with { type: "json" };
import { createCalculator } from "../engine/index.js";
import { createMasterStore } from "../store/masterStore.js";
import { createReferenceCache } from "../store/referenceCache.js";
import { flattenResponse, postJSON } from "./apiClient.js";
import { BOUNDARY_BUILDERS } from "./boundaryRequest.js";
import { STUB_BOUNDARIES } from "./stubBoundaries.js";

const BOUNDARY_URLS = {
  batch_sparge_solver: "/solve/batch",
  water_chemistry_solver: "/solve/water",
};

export function createCalculatorApp(options = {}) {
  const useHttp = options.useHttp ?? Boolean(import.meta.env?.VITE_API_BASE);
  const fetchImpl = options.fetchImpl;
  const debounceMs = options.debounceMs ?? 300;

  const store = createMasterStore();
  const cache = createReferenceCache();
  const engine = createCalculator(artifact, {
    references: cache.references,
    collections: cache.collections,
    boundaries: useHttp ? {} : STUB_BOUNDARIES,
    boundaryRequests: BOUNDARY_BUILDERS,
    roots: store.allRoots(),
  });

  const boundaryNodes = engine.topoOrder.filter((id) => artifact.nodes[id].kind === "boundary");
  const boundaryStatuses = Object.fromEntries(boundaryNodes.map((id) => [id, "pending"]));

  const inflight = new Map(); // fingerprint -> Promise<outputs>
  let solveTimer = null;
  let solveToken = 0;

  function setRoot(nodeId, value) {
    store.setRoot(nodeId, value);
    engine.setRoot(nodeId, value);
  }

  // POST (deduped by fingerprint) and seed the boundary cache.
  function fetchBoundary(binding, inputs, fingerprint) {
    let promise = inflight.get(fingerprint);
    if (!promise) {
      promise = postJSON(BOUNDARY_URLS[binding], inputs, { fetchImpl })
        .then((response) => {
          const outputs = flattenResponse(response);
          engine.applyBoundaryResult(fingerprint, outputs);
          return outputs;
        })
        .finally(() => inflight.delete(fingerprint));
      inflight.set(fingerprint, promise);
    }
    return promise;
  }

  // Resolve every boundary in topological order (cache hits are free).
  async function solveBoundaries() {
    if (!useHttp) return;
    for (const id of boundaryNodes) {
      const { binding, inputs, fingerprint } = engine.boundaryRequest(id);
      if (engine.hasBoundaryResult(fingerprint)) {
        boundaryStatuses[id] = "ok";
        continue;
      }
      boundaryStatuses[id] = "pending";
      await fetchBoundary(binding, inputs, fingerprint);
      boundaryStatuses[id] = "ok";
    }
  }

  const app = {
    engine,
    grainTemp: engine.get("mash.grain_temp_c"),
    doughInTarget: engine.get("mash.dough_in_target_temp_c"),
    targetAbv: engine.get("batch.target_abv"),
    equipmentName: engine.get("equipment.profile").name,
    strikeBase: 0,
    tunOffset: 0,
    strikeTemp: 0,
    mashThickness: 0,
    strikeVolume: 0,
    weightedLovibond: 0,
    beerSrm: 0,
    mashPhStatus: "",
    boundaryStatuses,

    setInputs() {
      setRoot("mash.grain_temp_c", Number(this.grainTemp));
      setRoot("batch.target_abv", Number(this.targetAbv));
    },

    applyReadouts() {
      this.doughInTarget = engine.get("mash.dough_in_target_temp_c");
      this.strikeBase = engine.get("mash.strike_water_temp_base_c");
      this.tunOffset = engine.get("mash.strike_water_tun_offset_c");
      this.strikeTemp = engine.get("mash.strike_water_temp_c");
      this.mashThickness = engine.resolve("solver.batch.mash_thickness_l_per_kg");
      this.strikeVolume = engine.resolve("solver.batch.cascade.v_strike");
      this.weightedLovibond = engine.get("grist.weighted_lovibond");
      this.beerSrm = engine.get("grist.finished_beer_srm");
      this.mashPhStatus = engine.get("water.mash_ph_status");
    },

    // One full solve pass. `token` lets a superseded in-flight solve discard its
    // (stale) result — a newer edit has already invalidated it.
    async solveNow() {
      const token = ++solveToken;
      try {
        await solveBoundaries();
        if (token !== solveToken) return;
        this.boundaryError = null;
        this.applyReadouts();
      } catch (error) {
        if (token !== solveToken) return;
        this.boundaryError = error;
        for (const id of boundaryNodes) {
          if (boundaryStatuses[id] === "pending") boundaryStatuses[id] = "error";
        }
      }
    },

    // Debounced entry point for edits: coalesce bursts into one solve after a
    // quiet window, and invalidate any in-flight solve.
    refresh() {
      this.setInputs();
      solveToken++;
      if (solveTimer) clearTimeout(solveTimer);
      solveTimer = setTimeout(() => this.solveNow(), debounceMs);
    },

    // Immediate solve (initial load) — no debounce.
    async init() {
      this.setInputs();
      await this.solveNow();
    },
  };

  return app;
}
