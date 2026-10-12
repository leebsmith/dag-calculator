import test from "node:test";
import assert from "node:assert/strict";

import { buildGraph, createCalculator } from "../../frontend/src/engine/index.js";
import { loadArtifact, makeFixtures } from "./helpers.js";

function syntheticArtifact(nodes) {
  return {
    schema_version: 1,
    nodes,
    dimensions: { dimensionless: { base_unit: "1", kind: "identity", units: {} } },
    constants: {},
    taxonomies: {},
    functions: {},
    primitive_schemas: {},
  };
}

test("topological sort covers all nodes in dependency order", () => {
  const artifact = loadArtifact();
  const { topoOrder, adjacency } = buildGraph(artifact);
  assert.equal(topoOrder.length, Object.keys(artifact.nodes).length);

  const position = new Map(topoOrder.map((id, i) => [id, i]));
  for (const [id, deps] of Object.entries(adjacency)) {
    for (const dep of deps) {
      assert.ok(position.get(dep) < position.get(id), `dependency ${dep} precedes ${id}`);
    }
  }
});

test("adjacency is built strictly from declared inputs", () => {
  const artifact = loadArtifact();
  const { adjacency } = buildGraph(artifact);

  // strike temp depends on its two declared inputs
  const strikeDeps = adjacency["mash.strike_water_temp_c"];
  assert.deepEqual(
    [...strikeDeps].sort(),
    ["mash.strike_water_temp_base_c", "mash.strike_water_tun_offset_c"].sort()
  );

  // a boundary output consumed by a derived node creates an edge to the boundary
  assert.ok(adjacency["mash.strike_water_temp_base_c"].includes("solver.batch"));
});

test("cycles are rejected", () => {
  const cyclic = syntheticArtifact({
    a: { kind: "root", dimension: "dimensionless", default: 1 },
    b: { kind: "derived", inputs: { x: "c" }, expr: { ref: "x" }, output: { dimension: "dimensionless" } },
    c: { kind: "derived", inputs: { x: "b" }, expr: { ref: "x" }, output: { dimension: "dimensionless" } },
  });
  assert.throws(() => buildGraph(cyclic), /Cycle detected/);
});

test("lazy memoization: boundary evaluated once per unique input", () => {
  const artifact = loadArtifact();
  const fixtures = makeFixtures();
  let calls = 0;
  const boundaries = {
    batch_sparge_solver: () => {
      calls++;
      return { mash_thickness_l_per_kg: 3.0, v_strike: 14.0, m_grist: 4.7 };
    },
    water_chemistry_solver: () => ({ predicted_mash_ph: 5.4 }),
  };
  const engine = createCalculator(artifact, { ...fixtures, boundaries });

  engine.get("mash.strike_water_temp_c");
  engine.get("mash.strike_water_temp_c");
  engine.get("mash.strike_water_temp_base_c");
  assert.equal(calls, 1, "boundary should be called exactly once");
});

test("setRoot invalidates dependents and recomputes", () => {
  const artifact = loadArtifact();
  const fixtures = makeFixtures();
  const engine = createCalculator(artifact, fixtures);

  const before = engine.get("mash.strike_water_temp_base_c");
  engine.setRoot("mash.grain_temp_c", 40.0);
  const after = engine.get("mash.strike_water_temp_base_c");
  assert.notEqual(before, after);
});
