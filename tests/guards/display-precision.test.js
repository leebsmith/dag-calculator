import test from "node:test";
import assert from "node:assert/strict";

import { createCalculator } from "../../frontend/src/engine/index.js";
import { createStepApp } from "../../frontend/src/adapters/stepAdapter.js";
import { valuateTable } from "../../frontend/src/views/producer/table.js";
import { loadArtifact, makeFixtures } from "../frontend/helpers.js";

test("every numeric readout resolves to a decimal policy", async () => {
  const app = createStepApp();
  await app.boot();
  const seen = new Map();
  for (const fields of Object.values(app.fieldsBySlice)) {
    for (const field of fields) if (!seen.has(field.id)) seen.set(field.id, field);
  }
  const missing = [...seen.values()]
    .filter((f) => f.control === "readout" && typeof f.value === "number")
    .filter((f) => f.decimals === null || f.decimals === undefined)
    .map((f) => f.id);
  assert.deepEqual(missing, [], `readouts without a decimal policy: ${missing.join(", ")}`);
});

test("representative readouts use the dimension policy", async () => {
  const app = createStepApp();
  await app.boot();
  const byId = new Map();
  for (const fields of Object.values(app.fieldsBySlice)) {
    for (const field of fields) if (!byId.has(field.id)) byId.set(field.id, field);
  }
  const display = (id) => byId.get(id)?.display;
  const unit = (id) => byId.get(id)?.unit;

  assert.equal(display("batch.realized_abv"), "5.5");
  assert.equal(display("batch.boil_target_ibu"), "30.0");
  assert.equal(display("batch.whirlpool_target_ibu"), "0.0");
  assert.equal(display("equipment.nominal_boil_off_rate_l_per_hr"), "3.0");
  assert.equal(display("grist.trace_malts_mass"), "0.00");
  assert.equal(display("grist.sugars_mass"), "0.0");
  assert.equal(display("grist.weighted_yield_fraction"), "78.8");
  assert.equal(display("batch.whirlpool_cooling_time_constant_min"), "108.7");
  assert.equal(unit("mash.strike_water_tun_offset_c"), "Δ°C");
});

test("collection columns inherit the dimension policy", async () => {
  const app = createStepApp();
  await app.boot();
  const table = app.fieldsBySlice.hops.find((f) => f.id === "batch.whirlpool_hops");
  const columns = Object.fromEntries(table.columns.map((c) => [c.id, c]));
  assert.equal(columns.duration_min.decimals, 0);
  assert.equal(columns.initial_temp_c.decimals, 1);
  assert.equal(columns.pct.decimals, 1);
  assert.equal(columns.parts.decimals, null);
});

test("readout tables honour registry decimal overrides", () => {
  const artifact = loadArtifact();
  const engine = createCalculator(artifact, makeFixtures());
  const field = {
    control: "readout-table",
    columns: [{ id: "value", kind: "value" }],
    rows: [{ value: "batch.target_ibu" }],
  };
  const out = valuateTable(field, artifact, engine, {}, {}, {
    "batch.target_ibu": { decimals: 2 },
  });
  assert.equal(out.rows[0].cells.value.display, "55.00");
});
