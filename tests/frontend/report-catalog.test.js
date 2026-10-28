// Report catalog: every resolvable path carries a label, dimension, display
// unit, and precision, plus enum options where the artifact declares a taxonomy.
// Shared with the Python bundle validator, so it must mirror the artifact's path
// rule exactly.

import test from "node:test";
import assert from "node:assert/strict";

import { buildReportCatalog } from "../../frontend/src/views/registry/catalog.js";
import { registry } from "../../frontend/src/views/registry/index.js";
import { resolveReference } from "../../frontend/src/engine/paths.js";
import { artifact as artifactFixture } from "../guards/util.js";
import { createTestApp } from "./appHelpers.js";

const catalog = buildReportCatalog(artifactFixture());
const artifact = artifactFixture();

function expectedPaths() {
  const paths = new Set();
  for (const [id, node] of Object.entries(artifact.nodes)) {
    paths.add(id);
    if (node.kind === "selection") {
      for (const field of Object.keys(artifact.primitive_schemas[node.output.schema] ?? {})) {
        paths.add(`${id}.${field}`);
      }
    }
    if (node.kind === "collection") {
      for (const field of Object.keys(artifact.primitive_schemas[node.item_schema] ?? {})) {
        paths.add(`${id}.${field}`);
      }
      for (const field of Object.keys(node.fields ?? {})) paths.add(`${id}.${field}`);
    }
    if (node.kind === "boundary") {
      for (const output of Object.keys(node.outputs ?? {})) paths.add(`${id}.${output}`);
    }
  }
  for (const [namespace, schema] of Object.entries(artifact.identity ?? {})) {
    for (const field of Object.keys(artifact.primitive_schemas[schema] ?? {})) {
      paths.add(`${namespace}.${field}`);
    }
  }
  return [...paths].sort();
}

test("the catalog covers every resolvable path exactly once", () => {
  assert.deepEqual(Object.keys(catalog.nodes).sort(), expectedPaths());
  for (const path of Object.keys(catalog.nodes)) {
    assert.ok(resolveReference(artifact, path), `${path} does not resolve`);
  }
});

test("every entry carries a non-empty label and only declared metadata", () => {
  const allowed = new Set([
    "label",
    "dimension",
    "unit",
    "symbol",
    "decimals",
    "step",
    "options",
    "option_labels",
  ]);
  for (const [path, entry] of Object.entries(catalog.nodes)) {
    assert.deepEqual(new Set(Object.keys(entry)), allowed, path);
    assert.ok(typeof entry.label === "string" && entry.label.length > 0, path);
    if (entry.dimension !== null) {
      assert.ok(artifact.dimensions[entry.dimension], `${path} names unknown dimension`);
    }
    if (entry.unit !== null) {
      const dim = artifact.dimensions[entry.dimension];
      assert.ok(dim, `${path} has a unit without a dimension`);
      assert.ok(
        entry.unit === dim.base_unit || entry.unit in (dim.units ?? {}),
        `${path} names unknown unit ${entry.unit}`
      );
      assert.ok(
        typeof entry.symbol === "string" && entry.symbol.length > 0,
        `${path} has a unit without a display symbol`
      );
    }
    if (entry.decimals !== null) {
      assert.ok(Number.isInteger(entry.decimals) && entry.decimals >= 0, path);
    }
  }
});

test("registry labels and display units win over fallbacks", () => {
  assert.equal(catalog.nodes["mash.grain_temp_c"].label, "Grain temperature");
  assert.equal(catalog.nodes["mash.grain_temp_c"].unit, "degC");
  assert.equal(catalog.nodes["mash.grain_temp_c"].symbol, "°C");
  assert.equal(catalog.nodes["mash.grain_temp_c"].decimals, 1);

  assert.equal(catalog.nodes["solver.water.mash_additions.gypsum_kg"].label, "Mash gypsum");
  assert.equal(catalog.nodes["solver.water.mash_additions.gypsum_kg"].unit, "g");
  assert.equal(catalog.nodes["solver.water.mash_additions.gypsum_kg"].dimension, "mass");

  assert.equal(catalog.nodes["style.og_min"].unit, "SG");
  assert.equal(catalog.nodes["style.og_min"].decimals, 3);

  for (const [path, spec] of Object.entries(registry)) {
    if (typeof spec.label !== "string" || !catalog.nodes[path]) continue;
    assert.equal(catalog.nodes[path].label, spec.label, path);
  }
});

test("display units follow the mode: a registry unit is not a pin", () => {
  const us = buildReportCatalog(artifact, {
    volume: "gal",
    mass: "lb",
    temperature: "degF",
    volume_per_time: "gal_per_hr",
  });

  // Fields whose registry entry carries a bare `unit` still follow the mode.
  assert.equal(us.nodes["batch.v_ferm"].unit, "gal");
  assert.equal(us.nodes["batch.hlt_starting_volume_l"].unit, "gal");
  assert.equal(us.nodes["batch.sugars.mass_kg"].unit, "lb");
  assert.equal(us.nodes["mash.strike_water_temp_c"].unit, "degF");
  assert.equal(us.nodes["batch.boil_off_rate_l_per_hr"].unit, "gal_per_hr");

  // Deliberate pins stay put.
  assert.equal(us.nodes["solver.water.mash_additions.gypsum_kg"].unit, "g");
  assert.equal(us.nodes["grist.trace_malts.mass_kg"].unit, "oz");
  assert.equal(us.nodes["equipment.min_lgr_l_per_kg"].unit, "qt_per_lb");
});

test("identity dimensions carry no display unit", () => {
  for (const path of ["batch.yeast_id", "batch.sugars.parts"]) {
    assert.equal(catalog.nodes[path].unit, null, path);
    assert.equal(catalog.nodes[path].symbol, null, path);
  }
});

test("taxonomies become options with their labels", () => {
  const topology = catalog.nodes["batch.topology"];
  assert.deepEqual(topology.options, artifact.taxonomies.topology);
  assert.equal(topology.option_labels.runoff_ratio, "Runnings ratio (r)");
  assert.equal(topology.dimension, null);
  assert.equal(topology.unit, null);

  for (const [path, entry] of Object.entries(catalog.nodes)) {
    if (!entry.options) continue;
    for (const value of entry.options) assert.equal(typeof value, "string", path);
    for (const key of Object.keys(entry.option_labels ?? {})) {
      assert.ok(entry.options.includes(key), `${path} option label ${key} has no option`);
    }
  }
});

test("ion paths fall back to the shared ion labels", () => {
  assert.equal(catalog.nodes["water.source.total_alkalinity_caco3"].label, "Alkalinity");
  assert.equal(catalog.nodes["solver.water.post_dose_mash_ions.calcium_ca"].label, "Calcium");
});

test("the catalog is JSON-serializable", () => {
  assert.doesNotThrow(() => JSON.stringify(catalog));
});

test("the app exposes the same catalog through the snapshot installer", async () => {
  const app = createTestApp();
  await app.boot();
  assert.deepEqual(app.reportCatalog(), catalog);
});

test("the catalog covers every node in the freeze valuation", async () => {
  const app = createTestApp();
  await app.boot();
  app.setRoot("batch.target_ibu", 42);
  const { valuation } = app.freezePayload();
  const nodes = app.reportCatalog().nodes;

  const missing = Object.keys(valuation).filter((id) => !(id in nodes));
  assert.deepEqual(missing, [], `uncovered valuation nodes: ${missing.join(", ")}`);
});

// Mirror of ReportBundle._cross_references coverage: every node id, boundary
// output, selection field, and collection row field exposed by the valuation
// must have a catalog entry.
function exposedPaths(valuation) {
  const exposed = new Set();
  for (const [id, value] of Object.entries(valuation)) {
    exposed.add(id);
    if (Array.isArray(value)) {
      for (const row of value) {
        if (row && typeof row === "object") {
          for (const key of Object.keys(row)) exposed.add(`${id}.${key}`);
        }
      }
    } else if (value && typeof value === "object") {
      for (const key of Object.keys(value)) exposed.add(`${id}.${key}`);
    }
  }
  return exposed;
}

const BATCH_RESPONSE = {
  sg_post_boil: 1.055,
  v_pre_boil: 24.0,
  s_post_boil_target: 2.6,
  m_grist: 4.7,
  cascade: {
    v_strike: 14.0,
    v_run1: 10.0,
    v_run2: 14.0,
    v_sparge: 14.0,
    s_run1: 2.0,
    s_run2: 0.6,
    sg_pre_boil: 1.048,
    v_post_boil: 21.0,
    mash_thickness_l_per_kg: 3.0,
  },
  max_achievable_abv: 10.0,
  real_attenuation: 0.76,
  apparent_attenuation: 0.75,
  hlt: {
    v_hlt_debt: 1.0,
    v_hlt_after_strike: 16.0,
    v_hlt_top_up: 0.0,
    v_sparge_deliverable: 15.0,
  },
  mash_thickness_l_per_kg: 3.0,
};

const HOP_RESPONSE = {
  boil_rows: [],
  whirlpool_rows: [],
  boil_mass_kg: 0,
  whirlpool_mass_kg: 0,
  total_mass_kg: 0,
};

// The live water boundary always returns its advisory lists beside the
// declared outputs; only the declared ones belong in the valuation.
const WATER_RESPONSE = {
  strategy: "CALCIUM_FLOOR",
  prescription: {
    predicted_mash_ph: 5.4,
    mash_ph_status: "OPTIMAL",
    residual_hlt_water_l: 0.0,
  },
  warnings: ["Mash pH is above target"],
  notes: ["Sparge acid is not prescribed"],
  telemetry: [{ code: "ROUTER_MODE_1_LINEAR_FLAVOR", severity: "INFO", message: "m" }],
};

const BOUNDARY_RESPONSES = {
  "/solve/batch": BATCH_RESPONSE,
  "/solve/hops": HOP_RESPONSE,
  "/solve/water": WATER_RESPONSE,
};

async function fetchBoundary(url) {
  const body = BOUNDARY_RESPONSES[url];
  return { ok: Boolean(body), status: body ? 200 : 500, json: async () => body ?? {} };
}

test("an HTTP-solved valuation drops boundary advisories and stays catalog-covered", async () => {
  const app = createTestApp({ useHttp: true, fetchImpl: fetchBoundary });
  await app.boot();
  assert.equal(app.boundaryStatuses["solver.water"], "ok");

  const { valuation } = app.freezePayload();
  const declared = Object.keys(artifact.nodes["solver.water"].outputs);

  for (const key of ["warnings", "notes", "telemetry"]) {
    assert.equal(key in valuation["solver.water"], false, `advisory "${key}" leaked`);
  }
  for (const key of Object.keys(valuation["solver.water"])) {
    assert.ok(declared.includes(key), `solver.water.${key} is not a declared output`);
  }

  const nodes = app.reportCatalog().nodes;
  const missing = [...exposedPaths(valuation)].filter((path) => !(path in nodes));
  assert.deepEqual(missing, [], `uncovered valuation paths: ${missing.join(", ")}`);
});
