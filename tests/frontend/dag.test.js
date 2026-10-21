import test from "node:test";
import assert from "node:assert/strict";

import { buildGraph, createCalculator } from "../../frontend/src/engine/index.js";
import { loadArtifact, makeFixtures, EQUIPMENT } from "./helpers.js";

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

test("an unset optional selection resolves to an empty component (no throw)", () => {
  const engine = createCalculator(loadArtifact(), makeFixtures());
  assert.deepEqual(engine.get("batch.yeast"), {});
  assert.equal(engine.resolve("batch.yeast.attenuation_pct"), undefined);
});

test("a non-empty but unknown selection id still throws", () => {
  const engine = createCalculator(loadArtifact(), makeFixtures());
  engine.setRoot("batch.yeast_id", "no-such-yeast");
  assert.throws(() => engine.get("batch.yeast"), /Unknown reference/);
});

test("default refs are declared graph edges", () => {
  const { adjacency } = buildGraph(loadArtifact());
  assert.ok(adjacency["batch.hlt_starting_volume_l"].includes("equipment.profile"));
});

test("a root default seeded from a selection tracks the selection after setRoot", () => {
  const fixtures = makeFixtures();
  fixtures.references.equipment = {
    small: { ...EQUIPMENT, id: "small", max_hlt_volume_l: 30 },
    big: { ...EQUIPMENT, id: "big", max_hlt_volume_l: 100 },
  };
  fixtures.roots["batch.equipment_profile_id"] = "small";
  const engine = createCalculator(loadArtifact(), fixtures);
  assert.equal(engine.get("batch.hlt_starting_volume_l"), 30);
  engine.setRoot("batch.equipment_profile_id", "big");
  assert.equal(engine.get("batch.hlt_starting_volume_l"), 100); // not stale
});
