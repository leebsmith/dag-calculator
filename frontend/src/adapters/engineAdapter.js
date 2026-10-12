// Thin view adapter: binds Alpine to the DAG engine and the roots-only store.
// No domain computation here — every readout is `engine.get(nodeId)`.
//
// Boundary I/O is async; the engine is sync/pure. The adapter PRE-RESOLVES the
// boundary cache (in topological order), then evaluation is synchronous.

import artifact from "../engine/artifact.json" with { type: "json" };
import { createCalculator } from "../engine/index.js";
import { createMasterStore } from "../store/masterStore.js";
import { createReferenceCache } from "../store/referenceCache.js";
import { flattenResponse, postJSON } from "./apiClient.js";
import { STUB_BOUNDARIES } from "./stubBoundaries.js";

const BOUNDARY_URLS = {
  batch_sparge_solver: "/solve/batch",
  water_chemistry_solver: "/solve/water",
};

export function createCalculatorApp(options = {}) {
  const useHttp = options.useHttp ?? Boolean(import.meta.env?.VITE_API_BASE);
  const fetchImpl = options.fetchImpl;

  const store = createMasterStore();
  const cache = createReferenceCache();
  const engine = createCalculator(artifact, {
    references: cache.references,
    collections: cache.collections,
    boundaries: useHttp ? {} : STUB_BOUNDARIES,
    roots: store.allRoots(),
  });

  const boundaryNodes = engine.topoOrder.filter((id) => artifact.nodes[id].kind === "boundary");
  const boundaryStatuses = Object.fromEntries(boundaryNodes.map((id) => [id, "pending"]));

  function setRoot(nodeId, value) {
    store.setRoot(nodeId, value);
    engine.setRoot(nodeId, value);
  }

  // Pre-resolve boundary results over HTTP, in topological order, then the
  // engine evaluates derived nodes synchronously off the cache.
  async function solveBoundaries() {
    if (!useHttp) return;
    for (const id of boundaryNodes) {
      const { binding, inputs, fingerprint } = engine.boundaryRequest(id);
      if (engine.hasBoundaryResult(fingerprint)) {
        boundaryStatuses[id] = "ok";
        continue;
      }
      boundaryStatuses[id] = "pending";
      const response = await postJSON(BOUNDARY_URLS[binding], inputs, { fetchImpl });
      engine.applyBoundaryResult(fingerprint, flattenResponse(response));
      boundaryStatuses[id] = "ok";
    }
  }

  return {
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

    async refresh() {
      setRoot("mash.grain_temp_c", Number(this.grainTemp));
      setRoot("batch.target_abv", Number(this.targetAbv));

      try {
        await solveBoundaries();
      } catch (error) {
        this.boundaryError = error;
        for (const id of boundaryNodes) {
          if (boundaryStatuses[id] === "pending") boundaryStatuses[id] = "error";
        }
        return;
      }
      this.boundaryError = null;

      this.doughInTarget = engine.get("mash.dough_in_target_temp_c");
      this.strikeBase = engine.get("mash.strike_water_temp_base_c");
      this.tunOffset = engine.get("mash.strike_water_tun_offset_c");
      this.strikeTemp = engine.get("mash.strike_water_temp_c");
      this.mashThickness = engine.resolve("solver.batch.mash_thickness_l_per_kg");
      this.strikeVolume = engine.resolve("solver.batch.cascade.v_strike");
      this.weightedLovibond = engine.get("grist.weighted_lovibond");
      this.beerSrm = engine.get("grist.beer_srm");
      this.mashPhStatus = engine.get("water.mash_ph_status");
    },

    async init() {
      await this.refresh();
    },
  };
}
