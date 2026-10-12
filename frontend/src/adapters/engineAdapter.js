// Thin view adapter: binds Alpine to the DAG engine and the roots-only store.
// No domain computation here — every readout is `engine.get(nodeId)`.

import artifact from "../engine/artifact.json";
import { createCalculator } from "../engine/index.js";
import { createMasterStore } from "../store/masterStore.js";
import { createReferenceCache } from "../store/referenceCache.js";

// Offline boundary stubs for the MWE. The real JSON seam (POST /solve/batch,
// /solve/water) is wired in the full implementation; see TODO.md.
const STUB_BOUNDARIES = {
  batch_sparge_solver: () => ({
    mash_thickness_l_per_kg: 3.0,
    v_strike: 14.0,
    m_grist: 4.7,
  }),
  water_chemistry_solver: () => ({ predicted_mash_ph: 5.4 }),
};

const INITIAL_ROOTS = {
  "mash.dough_in_target_temp_c": 67.0,
};

export function createCalculatorApp() {
  const store = createMasterStore(INITIAL_ROOTS);
  const cache = createReferenceCache();
  const engine = createCalculator(artifact, {
    references: cache.references,
    collections: cache.collections,
    boundaries: STUB_BOUNDARIES,
    roots: store.allRoots(),
  });

  function setRoot(nodeId, value) {
    store.setRoot(nodeId, value);
    engine.setRoot(nodeId, value);
  }

  return {
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

    refresh() {
      setRoot("mash.grain_temp_c", Number(this.grainTemp));
      setRoot("mash.dough_in_target_temp_c", Number(this.doughInTarget));
      setRoot("batch.target_abv", Number(this.targetAbv));

      this.strikeBase = engine.get("mash.strike_water_temp_base_c");
      this.tunOffset = engine.get("mash.strike_water_tun_offset_c");
      this.strikeTemp = engine.get("mash.strike_water_temp_c");
      this.mashThickness = engine.resolve("solver.batch.mash_thickness_l_per_kg");
      this.strikeVolume = engine.resolve("solver.batch.v_strike");
      this.weightedLovibond = engine.get("grist.weighted_lovibond");
      this.beerSrm = engine.get("grist.beer_srm");
      this.mashPhStatus = engine.get("water.mash_ph_status");
    },

    init() {
      this.refresh();
    },
  };
}
