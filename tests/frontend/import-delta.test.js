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

test("targets are printed at the dimension's precision, in the page's unit", () => {
  const delta = buildDelta({
    payload: PAYLOAD,
    ledger: LEDGER,
    engine: engine({
      "solver.batch.sg_post_boil": 1.0812345678,
      "batch.realized_fg": 1.0194321987,
      "batch.realized_abv": 8.41234,
    }),
  });
  const byLabel = (label) => delta.targets.find((target) => target.label === label);
  assert.equal(byLabel("Original gravity").source_display, "1.078 SG");
  assert.equal(byLabel("Original gravity").solved_display, "1.081 SG", "three digits, not sixteen");
  assert.equal(byLabel("Original gravity").delta_display, "+0.003 SG");
  assert.equal(byLabel("Final gravity").solved_display, "1.019 SG");
  assert.equal(byLabel("ABV").source_display, "8.0%");
  assert.equal(byLabel("ABV").solved_display, "8.4%");
  assert.equal(byLabel("ABV").delta_display, "+0.4%");
});

test("a gallons target is compared in base units, and the page keeps its own unit", () => {
  const delta = buildDelta({ payload: PAYLOAD, ledger: LEDGER, engine: engine() });
  const volume = delta.targets.find((target) => target.label === "Volume");
  assert.equal(volume.source_display, "5.0 gal", "the page said gallons, so it reads as gallons");
  assert.equal(volume.solved_display, "18.9 L", "the rig's number is base, and says so");
  assert.equal(volume.delta_display, "0.0 L", "the difference is subtracted in base units");
});

test("the import that reported sixteen decimal places is now readable", () => {
  const reported = {
    targets: {
      og: { value: 1.052, unit: "sg" },
      fg: { value: 1.006, unit: "sg" },
      abv: { value: 6, unit: "pct" },
      volume: { value: 23, unit: "l" },
    },
  };
  const delta = buildDelta({
    payload: reported,
    ledger: [],
    engine: engine({
      "solver.batch.sg_post_boil": 1.0735221112346507,
      "batch.realized_fg": 1.0370869104701694,
      "batch.realized_abv": 4.90017813674165,
      "batch.v_ferm": 23,
    }),
  });
  const rows = Object.fromEntries(delta.targets.map((row) => [row.label, row]));
  assert.deepEqual(
    [rows["Original gravity"].solved_display, rows["Original gravity"].delta_display],
    ["1.074 SG", "+0.022 SG"]
  );
  assert.deepEqual([rows["ABV"].solved_display, rows["ABV"].delta_display], ["4.9%", "-1.1%"]);
  assert.equal(rows["Volume"].solved_display, "23.0 L");
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
