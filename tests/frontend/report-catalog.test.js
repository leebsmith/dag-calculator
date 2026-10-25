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
    }
    if (entry.decimals !== null) {
      assert.ok(Number.isInteger(entry.decimals) && entry.decimals >= 0, path);
    }
  }
});

test("registry labels and display units win over fallbacks", () => {
  assert.equal(catalog.nodes["mash.grain_temp_c"].label, "Grain temperature");
  assert.equal(catalog.nodes["mash.grain_temp_c"].unit, "degC");
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
