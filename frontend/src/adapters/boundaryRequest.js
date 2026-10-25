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

// AI AGENT HOOKS: Use this helper for building every boundary request body from
// its declarative field map. Do not duplicated this logic elsewhere — each map
// key is one artifact-declared boundary input, and `wire: null` marks an input
// consumed only by a row builder.
function buildFromMap(engine, fields) {
  const resolved = {};
  for (const [alias, rule] of Object.entries(fields)) {
    const value = rule.read === "get" ? engine.get(rule.path) : engine.resolve(rule.path);
    resolved[alias] = value == null && "default" in rule ? rule.default : value;
  }

  const out = {};
  for (const [alias, rule] of Object.entries(fields)) {
    if (rule.wire === null) continue;
    const value = rule.build ? rule.build(resolved) : resolved[alias];
    assignWire(out, rule.wire ?? alias, value);
  }
  return out;
}

function assignWire(out, wire, value) {
  if (!wire.includes(".")) {
    out[wire] = value;
    return;
  }
  const [head, ...rest] = wire.split(".");
  out[head] ??= {};
  assignWire(out[head], rest.join("."), value);
}

export const CATEGORY_DEFAULT_F = { BASE: 0.81, CRYSTAL: 0.5, ROASTED: 0.15, ACID: 0.8 };

function fermentabilityOf(row) {
  return row.fermentability_fraction ?? CATEGORY_DEFAULT_F[row.category] ?? 0.81;
}

// BatchSolverRequest: one entry per solver.batch declared input.
export const BATCH_FIELDS = {
  target_abv: { path: "batch.target_abv" },
  apparent_attenuation: { path: "batch.yeast_cap" },
  v_ferm: { path: "batch.v_ferm" },
  topology: { path: "batch.topology" },
  intensive_value: { path: "batch.intensive_value" },
  grain_bill: {
    path: "grist.major_malts",
    read: "get",
    build: (resolved) =>
      (resolved.grain_bill ?? []).map((row) => ({
        w_i: row.pct,
        yield_i: row.yield_fraction,
        mc_i: row.moisture_fraction ?? resolved.grain_moisture_fraction,
        fermentability_i: fermentabilityOf(row),
      })),
  },
  grain_moisture_fraction: { path: "batch.grain_moisture_fraction", wire: null },
  s_late_add: { path: "batch.s_late_add" },
  v_kettle_dead: { path: "equipment.kettle_dead_space_l" },
  v_kettle_transfer: { path: "equipment.kettle_transfer_loss_l" },
  v_trub: { path: "equipment.trub_loss_l" },
  delta_v_evap: { path: "batch.delta_v_evap" },
  v_dead: { path: "equipment.mash_dead_space_l" },
  mash_transfer_loss: { path: "equipment.mash_transfer_loss_l" },
  k_abs_true: { path: "equipment.grain_absorption_factor_l_per_kg" },
  eta_conv: { path: "batch.conversion_efficiency" },
  f_shrink: { path: "equipment.shrinkage_pct" },
  hlt_starting_volume_l: { path: "batch.hlt_starting_volume_l" },
  hlt_dead_space_l: { path: "equipment.hlt_dead_space_l" },
  hlt_transfer_loss_l: { path: "equipment.hlt_transfer_loss_l" },
  hlt_coil_floor_l: { path: "equipment.hlt_coil_floor_l" },
  max_hlt_volume_l: { path: "equipment.max_hlt_volume_l" },
};

// WaterSolverRequest: one entry per solver.water declared input. `solver.batch`
// precedes `solver.water` in topo order, so `m_grist` is cached before this runs.
export const WATER_FIELDS = {
  grist: {
    path: "grist.major_malts",
    read: "get",
    build: (resolved) => [
      ...(resolved.grist ?? [])
        .filter((row) => row.pct > 0)
        .map((row) => ({
          mass_kg: row.pct * resolved.m_grist,
          color_lovibond: row.color_lovibond,
          grain_type: row.category,
        })),
      ...(resolved.trace_malts ?? [])
        .filter((row) => row.mass_kg > 0)
        .map((row) => ({
          mass_kg: row.mass_kg,
          color_lovibond: row.color_lovibond,
          grain_type: row.category,
        })),
    ],
  },
  trace_malts: { path: "grist.trace_malts", read: "get", wire: null },
  m_grist: { path: "solver.batch.m_grist", wire: null },
  "source.calcium_ca": { path: "water.source.calcium_ca", default: 0 },
  "source.magnesium_mg": { path: "water.source.magnesium_mg", default: 0 },
  "source.sodium_na": { path: "water.source.sodium_na", default: 0 },
  "source.sulfate_so4": { path: "water.source.sulfate_so4", default: 0 },
  "source.chloride_cl": { path: "water.source.chloride_cl", default: 0 },
  "source.alkalinity_as_caco3": { path: "water.source.total_alkalinity_caco3", default: 0 },
  "target.calcium_ca": { path: "water.target.calcium_ca", default: 0 },
  "target.magnesium_mg": { path: "water.target.magnesium_mg", default: 0 },
  "target.sodium_na": { path: "water.target.sodium_na", default: 0 },
  "target.sulfate_so4": { path: "water.target.sulfate_so4", default: 0 },
  "target.chloride_cl": { path: "water.target.chloride_cl", default: 0 },
  "target.alkalinity_as_caco3": { path: "water.target.alkalinity_as_caco3", default: 0 },
  v_mash_treat_l: { path: "solver.batch.cascade.v_strike" },
  v_hlt_treat_l: { path: "batch.sparge_salted_volume" },
  v_hlt_debt_l: { path: "solver.batch.hlt.v_hlt_debt" },
  v_sparge_demand_l: { path: "solver.batch.cascade.v_sparge" },
  mash_thickness_l_per_kg: { path: "solver.batch.mash_thickness_l_per_kg" },
  target_mash_ph: { path: "water.target_mash_ph" },
  strategy: { path: "water.strategy" },
  salt_distribution: { path: "water.salt_distribution" },
  acid_medium: { path: "water.acid_medium" },
  gypsum_form: { path: "water.gypsum_form" },
  cacl2_form: { path: "water.cacl2_form" },
  preferred_alkaline_agent: { path: "water.preferred_alkaline_agent" },
  calcium_floor_ppm: { path: "water.calcium_floor_ppm", default: 50 },
  custom_pinned_ions: {
    path: "water.pinned_ions",
    read: "get",
    // The checked set is the constraint set: checking seeds a value and clearing
    // unchecks, so no filtering by magnitude is needed.
    build: (resolved) => (resolved.custom_pinned_ions ?? []).map((row) => row.ion),
  },
};

// HopSolverRequest: one entry per solver.hops declared input. The hop rows are
// sent as the closed fields the backend consumes; names/ids stay host-side.
export const HOP_FIELDS = {
  boil_hops: {
    path: "batch.boil_hops",
    read: "get",
    build: (resolved) =>
      (resolved.boil_hops ?? []).map((row) => ({
        alpha_acid_pct: row.alpha_acid_pct,
        boil_time_fraction: row.boil_time_fraction,
        pct: row.pct,
      })),
  },
  whirlpool_hops: {
    path: "batch.whirlpool_hops",
    read: "get",
    build: (resolved) =>
      (resolved.whirlpool_hops ?? []).map((row) => ({
        alpha_acid_pct: row.alpha_acid_pct,
        duration_min: row.duration_min,
        initial_temp_c: row.initial_temp_c,
        pct: row.pct,
        product_form: row.product_form ?? "t90_pellet",
      })),
  },
  boil_target_ibu: { path: "batch.boil_target_ibu" },
  whirlpool_target_ibu: { path: "batch.whirlpool_target_ibu" },
  boil_time_min: { path: "batch.boil_time_min" },
  pre_boil_gravity: { path: "solver.batch.cascade.sg_pre_boil" },
  post_boil_gravity: { path: "solver.batch.sg_post_boil" },
  post_boil_volume_l: { path: "solver.batch.cascade.v_post_boil" },
  whirlpool_ambient_temp_c: { path: "batch.whirlpool_ambient_temp_c" },
  whirlpool_cooling_time_constant_min: { path: "batch.whirlpool_cooling_time_constant_min" },
};

export function buildBatchRequest(engine) {
  return buildFromMap(engine, BATCH_FIELDS);
}

export function buildHopRequest(engine) {
  return buildFromMap(engine, HOP_FIELDS);
}

export function buildWaterRequest(engine) {
  return buildFromMap(engine, WATER_FIELDS);
}

// binding -> builder, registered on the engine (options.boundaryRequests).
export const BOUNDARY_BUILDERS = {
  batch_sparge_solver: buildBatchRequest,
  water_chemistry_solver: buildWaterRequest,
  hop_bitterness_solver: buildHopRequest,
};
