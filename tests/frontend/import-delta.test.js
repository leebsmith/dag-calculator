import test from "node:test";
import assert from "node:assert/strict";

import { buildDelta, grams } from "../../frontend/src/adapters/importDelta.js";
import { waterSummary } from "../../frontend/src/adapters/importGate.js";

const LEDGER = [
  {
    line_id: "fermentables[0]",
    name: "Maris Otter",
    destination: "grist.major_malts",
    decision: "mapped",
    ref: "m1",
    quantity: { value: 10, unit: "lb" },
    share: 0.6,
  },
  {
    line_id: "fermentables[1]",
    name: "Carafa",
    destination: "grist.trace_malts",
    decision: "mapped",
    ref: "m2",
    quantity: { value: 1, unit: "lb" },
  },
  {
    line_id: "hops[0]",
    name: "Citra",
    destination: "batch.boil_hops",
    decision: "mapped",
    ref: "h1",
    quantity: { value: 1.5, unit: "oz" },
  },
  {
    line_id: "hops[1]",
    name: "Amarillo",
    destination: "batch.whirlpool_hops",
    decision: "mapped",
    ref: "h2",
    quantity: { value: 1, unit: "oz" },
  },
  {
    line_id: "hops[2]",
    name: "Citra",
    destination: "batch.dry_hops",
    decision: "mapped",
    ref: "h1",
    quantity: { value: 2, unit: "oz" },
  },
  { line_id: "hops[3]", name: "Unmapped", decision: "unresolved" },
];

function engine(solved = {}) {
  const values = {
    "solver.batch.m_grist": 5.4,
    "solver.batch.sg_post_boil": 1.081,
    "solver.hops.boil_rows": [{ mass_kg: 0.05 }],
    "solver.hops.whirlpool_rows": [{ mass_kg: 0.03 }],
    "batch.realized_fg": 1.014,
    "batch.realized_abv": 8.4,
    "batch.v_ferm": 18.9,
    ...solved,
  };
  // The real engine resolves boundary output paths and refuses `get` on them; the
  // double mirrors that, so a delta that used `get` fails here instead of in the UI.
  return {
    get: (path) => {
      if (path.startsWith("solver.")) throw new Error(`Unknown node "${path}"`);
      if (!(path in values)) throw new Error(`Unknown node "${path}"`);
      return values[path];
    },
    resolve: (path) => values[path],
  };
}

const PAYLOAD = {
  targets: {
    og: { value: 1.078, unit: "sg" },
    fg: { value: 1.019, unit: "sg" },
    abv: { value: 8, unit: "pct" },
    volume: { value: 5, unit: "gal" },
  },
};

test("the grain bill is compared as solved mass, not as the page's mass", () => {
  const delta = buildDelta({ payload: PAYLOAD, ledger: LEDGER, engine: engine() });
  const otter = delta.lines.find((line) => line.label === "Maris Otter");
  assert.ok(Math.abs(otter.solved_kg - 5.4 * 0.6) < 1e-9, "share of the solved grist");
  assert.ok(otter.ratio > 0);
});

test("a trace malt is authored, so its mass is its own", () => {
  const delta = buildDelta({ payload: PAYLOAD, ledger: LEDGER, engine: engine() });
  const carafa = delta.lines.find((line) => line.label === "Carafa");
  assert.ok(Math.abs(carafa.solved_kg - carafa.source_kg) < 1e-9);
  assert.equal(carafa.ratio, 1);
});

test("hops are read from the solver's own rows, pool by pool", () => {
  const delta = buildDelta({ payload: PAYLOAD, ledger: LEDGER, engine: engine() });
  assert.equal(delta.lines.find((line) => line.destination === "batch.boil_hops").solved_kg, 0.05);
  assert.equal(
    delta.lines.find((line) => line.destination === "batch.whirlpool_hops").solved_kg,
    0.03
  );
});

test("a dry hop is authored and says so instead of inventing a solved mass", () => {
  const delta = buildDelta({ payload: PAYLOAD, ledger: LEDGER, engine: engine() });
  const dry = delta.lines.find((line) => line.destination === "batch.dry_hops");
  assert.equal(dry.solved_kg, null);
  assert.match(dry.note, /authored/);
});

test("unmapped lines never appear in the delta", () => {
  const delta = buildDelta({ payload: PAYLOAD, ledger: LEDGER, engine: engine() });
  assert.equal(delta.lines.some((line) => line.label === "Unmapped"), false);
});

test("targets compare what the page stated with what the rig solves", () => {
  const delta = buildDelta({ payload: PAYLOAD, ledger: LEDGER, engine: engine() });
  const og = delta.targets.find((target) => target.label === "Original gravity");
  assert.ok(Math.abs(og.delta - (1.081 - 1.078)) < 1e-9);
  const abv = delta.targets.find((target) => target.label === "ABV");
  assert.ok(Math.abs(abv.delta - 0.4) < 1e-9, "8.4 % solved against 8 % stated");
});

test("a missing solved value is absence, never a zero delta", () => {
  const delta = buildDelta({
    payload: PAYLOAD,
    ledger: LEDGER,
    engine: engine({ "batch.realized_abv": null }),
  });
  const abv = delta.targets.find((target) => target.label === "ABV");
  assert.equal(abv.solved, null);
  assert.equal(abv.delta, null);
});

test("grams converts without rounding a value the review has not shown", () => {
  assert.equal(grams(0.05), 50);
  assert.equal(grams(null), null);
});


test("the water summary reports the prescription, and absence when water did not run", () => {
  const values = {
    "solver.water.strategy": "balanced",
    "solver.water.prescription.predicted_mash_ph": 5.34,
    "solver.water.prescription.mash_ph_status": "in-range",
    "solver.water.mash_additions.gypsum_kg": 0.004,
    "solver.water.mash_additions.cacl2_kg": 0.001,
    "solver.water.mash_additions.acid_l": 0.002,
  };
  const summary = waterSummary({ resolve: (path) => values[path] });
  assert.equal(summary.ph, 5.34);
  assert.equal(summary.gypsum_g, 4);
  assert.equal(summary.acid_ml, 2);
  assert.equal(waterSummary({ resolve: () => undefined }), null);
});
