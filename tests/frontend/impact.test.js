import test from "node:test";
import assert from "node:assert/strict";

import { createCalculator, createImpact, diffValuations } from "../../frontend/src/engine/index.js";
import { loadArtifact, makeFixturesWithYeast } from "./helpers.js";

const artifact = loadArtifact();

function calculator(roots = {}) {
  const fixtures = makeFixturesWithYeast();
  fixtures.roots = { ...fixtures.roots, ...roots };
  return createCalculator(artifact, fixtures);
}

function valuation(engine) {
  return Object.fromEntries(Object.keys(artifact.nodes).map((id) => [id, engine.get(id)]));
}

function impactOf(engine) {
  return createImpact(artifact, {
    adjacency: engine.adjacency,
    dependents: engine.dependents,
  });
}

function ownerOf(path) {
  const parts = path.split(".");
  for (let index = parts.length; index > 0; index -= 1) {
    const candidate = parts.slice(0, index).join(".");
    if (artifact.nodes[candidate]) return candidate;
  }
  return parts[0];
}

test("every declared edge appears downstream", () => {
  const engine = calculator();
  for (const [id, inputs] of Object.entries(engine.adjacency)) {
    for (const input of inputs) {
      assert.ok(engine.dependents[input]?.includes(id), `${input} -> ${id} missing downstream`);
    }
  }
});

test("collection read edges stay out of adjacency", () => {
  const engine = calculator();

  assert.ok(engine.dependents["batch.grain_moisture_fraction"].includes("grist.major_malts"));
  assert.ok(!engine.adjacency["grist.major_malts"].includes("batch.grain_moisture_fraction"));
});

test("a target change fans out through every boundary", () => {
  const result = impactOf(calculator()).impact("batch.target_abv");

  assert.ok(result.dependents.includes("solver.batch"));
  assert.ok(result.dependents.includes("solver.hops"));
  assert.ok(result.dependents.includes("solver.water"));
  assert.ok(result.dependents.includes("batch.realized_abv"));
  assert.deepEqual(
    result.boundaryFanOut.map((boundary) => boundary.id),
    ["solver.batch", "solver.hops", "solver.water"]
  );
  assert.deepEqual(result.boundaryUpstream, []);
});

test("a water target moves the water solver only", () => {
  const result = impactOf(calculator()).impact("water.target.calcium_ca");

  assert.ok(result.dependents.includes("solver.water"));
  assert.deepEqual(
    result.boundaryFanOut.map((boundary) => boundary.id),
    ["solver.water"]
  );
  assert.ok(!result.dependents.includes("solver.batch"));
  assert.ok(!result.dependents.includes("solver.hops"));
});

test("identity reads attribute to their nodes and continue downstream", () => {
  const style = impactOf(calculator()).impact("style.abv_min");
  assert.ok(style.dependents.includes("batch.target_abv"));
  assert.ok(style.dependents.includes("solver.batch"));

  const equipment = impactOf(calculator()).impact("equipment");
  assert.ok(equipment.dependents.includes("solver.batch"));
  assert.ok(equipment.dependents.includes("batch.hlt_starting_volume_l"));
});

test("identity inputs are reported for the ancestors of a node", () => {
  const result = impactOf(calculator()).impact("mash.strike_water_temp_c");

  assert.ok(result.identityInputs.includes("equipment.mash_tun_mass_kg"));
  assert.ok(result.identityInputs.includes("equipment.mash_tun_specific_heat"));
  assert.deepEqual(result.boundaryUpstream, ["solver.batch"]);
});

test("impact is pure and leaves the memo alone", () => {
  const engine = calculator();
  const before = engine.get("batch.realized_abv");

  const first = impactOf(engine).impact("batch.target_abv");
  const second = impactOf(engine).impact("batch.target_abv");

  assert.deepEqual(first, second);
  assert.equal(engine.get("batch.realized_abv"), before);
});

test("an unknown source is refused", () => {
  assert.throws(() => impactOf(calculator()).impact("batch.not_a_node"), /Unknown impact source/);
});

test("the dependent closure covers every value a changed root moves", () => {
  const base = calculator();
  const moved = calculator({ "batch.target_abv": 6.0 });

  const { changed } = diffValuations(valuation(base), valuation(moved));
  assert.ok(changed.length > 0, "the fixture root produced no change");

  const allowed = new Set(["batch.target_abv", ...impactOf(base).impact("batch.target_abv").dependents]);
  const owners = [...new Set(changed.map(({ path }) => ownerOf(path)))];
  assert.deepEqual(
    owners.filter((owner) => !allowed.has(owner)),
    []
  );
});

test("diffValuations reports leaves and treats rows as one value", () => {
  const { changed } = diffValuations(
    { "batch.x": 1, "grist.rows": [{ pct: 0.5 }], "solver.batch": { outputs: { m_grist: 4 } } },
    { "batch.x": 2, "grist.rows": [{ pct: 0.5 }], "solver.batch": { outputs: { m_grist: 5 } } }
  );

  assert.deepEqual(
    changed.map((entry) => entry.path),
    ["batch.x", "solver.batch.outputs.m_grist"]
  );
});
