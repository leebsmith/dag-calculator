// Boundary request adapter: reshape already-resolved engine values into the
// backend's Pydantic contracts (`backend/app/schemas/boundary.py`). This is a
// pure mapping layer — no engine/domain logic beyond field renames and the
// host-side grist rows.
//
// The engine resolves a boundary's declared `inputs` into FRONTEND shapes (flat
// roots, raw collection rows); the backend uses `extra="forbid"` models with
// DIFFERENT shapes (normalized grain rows, nested `IonProfile`s). These builders
// are the translation, registered on the engine as `boundaryRequests` so both
// `boundaryRequest()` and evaluation fingerprint the ADAPTED body — matching the
// backend's `canonical_fingerprint`.
//
// Hamilton stays host-side (TODO/L3): `w_i` here is the normalized `pct` the
// grist table authors (`frontend/src/views/hamilton.js`), never an engine value.

const ION_FIELDS = [
  "calcium_ca",
  "magnesium_mg",
  "sodium_na",
  "sulfate_so4",
  "chloride_cl",
  "alkalinity_as_caco3",
];

function ionProfile(engine, role) {
  const profile = {};
  for (const ion of ION_FIELDS) profile[ion] = engine.resolve(`water.${role}.${ion}`);
  return profile;
}

// BatchSolverRequest (17 fields).
export function buildBatchRequest(engine) {
  const rows = engine.get("grist.major_malts") ?? [];
  return {
    target_abv: engine.resolve("batch.target_abv"),
    apparent_attenuation: engine.resolve("batch.apparent_attenuation"),
    v_ferm: engine.resolve("batch.v_ferm"),
    topology: engine.resolve("batch.topology"),
    intensive_value: engine.resolve("batch.intensive_value"),
    grain_bill: rows.map((row) => ({
      w_i: row.pct,
      yield_i: row.yield_fraction,
      mc_i: row.moisture_pct,
    })),
    s_late_add: engine.resolve("batch.s_late_add"),
    v_kettle_dead: engine.resolve("equipment.kettle_dead_space_l"),
    delta_v_evap: engine.resolve("batch.delta_v_evap"),
    v_dead: engine.resolve("equipment.mash_dead_space_l"),
    eta_conv: engine.resolve("equipment.conversion_efficiency"),
    f_shrink: engine.resolve("equipment.shrinkage_pct"),
    hlt_starting_volume_l: engine.resolve("batch.hlt_starting_volume_l"),
    hlt_dead_space_l: engine.resolve("equipment.hlt_dead_space_l"),
    hlt_transfer_loss_l: engine.resolve("equipment.hlt_transfer_loss_l"),
    hlt_coil_floor_l: engine.resolve("equipment.hlt_coil_floor_l"),
    max_hlt_volume_l: engine.resolve("equipment.max_hlt_volume_l"),
  };
}

// WaterSolverRequest. `solver.batch` precedes `solver.water` in topo order, so
// `m_grist` is always cached before this resolves the grain masses.
export function buildWaterRequest(engine) {
  const rows = engine.get("grist.major_malts") ?? [];
  const mGrist = engine.resolve("solver.batch.m_grist");
  return {
    // A 0%-of-bill row contributes nothing and would violate mass_kg > 0, so
    // drop it (a freshly-added row starts at 0% until the user sets its parts).
    grist: rows
      .filter((row) => row.pct > 0)
      .map((row) => ({
        mass_kg: row.pct * mGrist,
        color_lovibond: row.color_lovibond,
        grain_type: row.category,
      })),
    source: ionProfile(engine, "source"),
    target: ionProfile(engine, "target"),
    v_mash_treat_l: engine.resolve("water.v_mash_treat_l"),
    v_hlt_treat_l: engine.resolve("water.v_hlt_treat_l"),
    v_hlt_debt_l: engine.resolve("water.v_hlt_debt_l"),
    v_sparge_demand_l: engine.resolve("water.v_sparge_demand_l"),
    mash_thickness_l_per_kg: engine.resolve("water.mash_thickness_l_per_kg"),
    target_mash_ph: engine.resolve("water.target_mash_ph"),
    strategy: engine.resolve("water.strategy"),
    salt_distribution: engine.resolve("water.salt_distribution"),
    acid_medium: engine.resolve("water.acid_medium"),
    gypsum_form: engine.resolve("water.gypsum_form"),
    cacl2_form: engine.resolve("water.cacl2_form"),
    preferred_alkaline_agent: engine.resolve("water.preferred_alkaline_agent"),
    calcium_floor_ppm: engine.resolve("water.calcium_floor_ppm"),
  };
}

// binding -> builder, registered on the engine (options.boundaryRequests).
export const BOUNDARY_BUILDERS = {
  batch_sparge_solver: buildBatchRequest,
  water_chemistry_solver: buildWaterRequest,
};
