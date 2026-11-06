// Freeze-time display strings: the report's only formatting source. The
// catalog is unit-aware and the formatted block uses the same producer rules
// as the UI, including nonlinear gravity.

import test from "node:test";
import assert from "node:assert/strict";

import { sharedTestApp } from "./appHelpers.js";

async function booted() {
  return sharedTestApp();
}

test("formatted values carry text, number, and the display symbol", async () => {
  const app = await booted();
  const formatted = app.reportFormatted();

  assert.deepEqual(formatted["batch.v_ferm"], {
    text: "20.0 L",
    number: "20.0",
    unit: "L",
  });
  assert.equal(formatted["solver.batch.apparent_attenuation"].text, "75.0%");
  assert.equal(formatted["solver.batch.apparent_attenuation"].unit, "%");
  assert.equal(formatted["solver.batch.apparent_attenuation"].number, "75.0");
  assert.equal(formatted["batch.yeast_id"].text, app.selectedYeastId);
});

test("the report carries both solved mash ratios and the solver limits", async () => {
  const app = await booted();
  const formatted = app.reportFormatted();

  // Both ratios are solved values: the L/kg ratio and the realized V1/V2.
  assert.equal(formatted["solver.batch.mash_thickness_l_per_kg"].number, "3.00");
  assert.equal(formatted["solver.batch.mash_thickness_l_per_kg"].unit, "L/kg");
  assert.equal(formatted["batch.runnings_ratio"].number, "0.71");
  assert.equal("unit" in formatted["batch.runnings_ratio"], false);

  assert.equal(formatted["solver.batch.max_feasible_abv"].unit, "%");
  assert.equal(formatted["solver.batch.max_achievable_abv"].unit, "%");
  // Both limits arrive in percent points; the `abv` dimension must pass them
  // through, not scale them a second time.
  assert.equal(formatted["solver.batch.max_feasible_abv"].number, "10.0");
  assert.equal(formatted["solver.batch.max_achievable_abv"].number, "10.0");
  assert.equal(formatted["solver.batch.binding_constraint"].text, "Fermentation");
  assert.equal(formatted["solver.batch.real_attenuation"].text, "76.0%");
  assert.equal(formatted["solver.batch.s_post_boil_target"].unit, "kg");
});

test("the extract chain arrives as frozen masses that close", async () => {
  const app = await booted();
  const formatted = app.reportFormatted();

  assert.equal(formatted["solver.batch.extract.s_potential"].text, "3.60 kg");
  assert.equal(formatted["solver.batch.extract.s_converted"].text, "3.00 kg");
  assert.equal(formatted["solver.batch.extract.s_kettle"].text, "2.60 kg");
  assert.equal(formatted["solver.batch.extract.s_fermenter"].text, "2.50 kg");

  // The loss rows are differences of solved masses, not re-derivations.
  assert.equal(formatted["batch.extract_loss_conversion"].text, "0.60 kg");
  assert.equal(formatted["batch.extract_loss_mash"].text, "0.40 kg");
  assert.equal(formatted["batch.extract_loss_kettle"].text, "0.10 kg");
  assert.equal(formatted["batch.extract_loss_retention"].text, "0.30 kg");
  assert.equal(formatted["batch.extract_loss_transfer"].text, "0.10 kg");

  // Brewhouse efficiency is the kettle figure: malt extract / potential.
  assert.equal(formatted["solver.batch.brewhouse_efficiency"].text, "72.0%");
});

test("the batch derate is points off the strain maximum, not a percentage", async () => {
  const app = await booted();

  app.setRoot("batch.attenuation_derate_points", 0.04);
  assert.deepEqual(app.reportFormatted()["batch.attenuation_derate_points"], {
    text: "4.0 pts",
    number: "4.0",
    unit: "pts",
  });
  // The ceiling it feeds is still an attenuation percentage.
  assert.equal(app.reportCatalog().nodes["batch.yeast_cap"].symbol, "%");
});

test("unit switches are captured in the catalog and the formatted strings", async () => {
  const app = await booted();

  app.setUnit("volume", "gal");
  assert.equal(app.reportCatalog().nodes["solver.batch.cascade.v_strike"].unit, "gal");
  const gallons = app.reportFormatted()["solver.batch.cascade.v_strike"];
  assert.equal(gallons.unit, "gal");
  assert.match(gallons.text, /gal$/);

  app.setUnit("gravity", "SG");
  const sg = app.reportFormatted()["solver.batch.sg_post_boil"];
  assert.equal(sg.unit, "SG");
  assert.equal(sg.number, "1.055");

  app.setUnit("gravity", "Plato");
  const plato = app.reportFormatted()["solver.batch.sg_post_boil"];
  assert.equal(plato.unit, "°P");
  assert.match(plato.text, /°P$/);
  assert.notEqual(plato.number, sg.number);
});

test("per-field overrides win over the dimension preference", async () => {
  const app = await booted();
  app.setUnit("volume", "L");
  app.setFieldUnit("batch.v_ferm", "gal");

  assert.equal(app.reportCatalog().nodes["batch.v_ferm"].unit, "gal");
  assert.equal(app.reportFormatted()["batch.v_ferm"].unit, "gal");
});

test("formatted strings are names for text paths and skip collection fields", async () => {
  const app = await booted();
  const formatted = app.reportFormatted();

  // A collection field has no single value and must not appear.
  assert.equal("mash.rests.use_temp_c" in formatted, false);
  // Strings pass through (label mapping applies when the taxonomy has one).
  const topology = formatted["batch.topology"];
  assert.equal(typeof topology.text, "string");
});

test("the above-cap delta is omitted when the malt cap holds", async () => {
  const app = await booted();
  const realized = app.engine.resolve("solver.batch.apparent_attenuation");
  const cap = app.engine.resolve("batch.yeast_cap");
  assert.ok(realized <= cap);

  // A null value produces no formatted entry, so the report row disappears.
  assert.equal("batch.attenuation_above_cap" in app.reportFormatted(), false);
});

test("grist tables carry formatted row cells", async () => {
  const app = await booted();
  const tables = app.reportFormattedTables();

  const major = tables["grist.major_malts"];
  assert.ok(major.length > 0);
  const row = major[0];
  assert.equal(typeof row.name.text, "string");
  assert.ok(row.amount.text.endsWith("kg") || row.amount.text.endsWith("lb"));
  assert.match(row.ppg.text, /^\d+\.\d$/);
  assert.equal(typeof row.color.text, "string");
  assert.equal(row.own_pct.unit, "%");
  assert.equal(row.grist_pct.unit, "%");

  assert.deepEqual(tables["grist.trace_malts"], []);

  app.engine.setCollection("grist.trace_malts", [
    { name: "Carafa", mass_kg: 0.1, yield_fraction: 0.6, color_lovibond: 500 },
  ]);
  const trace = app.reportFormattedTables()["grist.trace_malts"];
  assert.equal(trace.length, 1);
  assert.equal(trace[0].name.text, "Carafa");
  assert.equal(trace[0].own_pct.unit, "%");
  assert.equal(trace[0].grist_pct.unit, "%");
});

test("mash rests carry only enabled schedule rows and catalog labels", async () => {
  const app = await booted();
  const rests = app.reportFormattedTables()["mash.rests"];

  assert.equal(rests.length, 2);
  assert.deepEqual(
    rests.map((row) => row.name.text),
    ["Beta/Alpha-Amylase Rest", "Mash-out"]
  );
  assert.equal(rests[0].temp.unit, "°C");
  assert.equal(rests[0].time.unit, "min");
  assert.equal(app.reportFormatted()["mash.total_time_min"].unit, "min");

  app.engine.setCollection("mash.rests", [
    { rest_id: "protein", enabled: true, use_temp_c: 52, duration_min: 15 },
    { rest_id: "beta_amylase", enabled: false, use_temp_c: 63, duration_min: 40 },
    { rest_id: "mash_out", enabled: true, use_temp_c: 76, duration_min: 10 },
  ]);
  app.compute();
  const custom = app.reportFormattedTables()["mash.rests"];
  assert.deepEqual(
    custom.map((row) => row.name.text),
    ["Protein Rest", "Mash-out"]
  );
});

const BOIL_HOP = {
  hop_id: "magnum",
  name: "Magnum",
  product_form: "t90_pellet",
  alpha_acid_pct: 0.14,
  boil_time_fraction: 1,
  parts: 100,
  pct: 1,
};

const WHIRLPOOL_HOT = {
  hop_id: "citra",
  name: "Citra",
  product_form: "t90_pellet",
  alpha_acid_pct: 0.12,
  addition_at_min: 0,
  initial_temp_c: 95,
  parts: 70,
  pct: 0.7,
  notes: "",
};

const WHIRLPOOL_COOL = {
  ...WHIRLPOOL_HOT,
  hop_id: "saaz",
  name: "Saaz",
  alpha_acid_pct: 0.035,
  addition_at_min: 20,
  initial_temp_c: 70,
  parts: 30,
  pct: 0.3,
};

const DRY_HOP = {
  hop_id: "mosaic",
  variety: "Mosaic",
  product_type: "t90_pellet",
  quantity: 1,
  unit: "oz",
  application_stage: "fermentation",
  application_event: "high_krausen",
  contact_duration_min: null,
  contact_until: "terminal_gravity",
  time_of_application: "",
  notes: "",
};

test("hop tables carry the charges, the solved cells and the choice labels", async () => {
  const app = await booted();
  app.engine.setCollection("batch.boil_hops", [BOIL_HOP]);
  app.engine.setCollection("batch.whirlpool_hops", [WHIRLPOOL_COOL, WHIRLPOOL_HOT]);
  app.engine.setCollection("batch.dry_hops", [DRY_HOP]);
  app.compute();
  app.hopStrategy = "IBU split between the boil and the whirlpool.\n\nSensory: pine backbone.";
  const tables = app.reportFormattedTables();

  const boil = tables["batch.boil_hops"];
  assert.equal(boil.length, 1);
  assert.deepEqual(boil[0].name, { text: "Magnum" });
  assert.equal(boil[0].form.text, "T-90 pellet");
  assert.equal(boil[0].alpha.unit, "%");
  assert.equal(boil[0].ibu_share.unit, "%");
  assert.equal(typeof boil[0].ibu.text, "string");
  // Hop masses print in grams: the default kg unit renders them as "0.0".
  assert.equal(boil[0].amount.unit, "g");

  const whirlpool = tables["batch.whirlpool_hops"];
  assert.equal(whirlpool.length, 2);
  assert.equal(whirlpool[0].name.text, "Citra");
  assert.equal(whirlpool[0].form.text, "T-90 pellet");
  assert.equal(whirlpool[0].alpha.unit, "%");
  assert.equal(whirlpool[0].add.unit, "min");
  assert.equal(whirlpool[0].temp.unit, "°C");
  assert.equal(whirlpool[1].name.text, "Saaz");
  for (const row of Object.values(tables).flat()) {
    for (const cell of Object.values(row)) {
      assert.equal(typeof cell, "object");
      assert.ok("text" in cell);
    }
  }

  const dry = tables["batch.dry_hops"];
  assert.equal(dry.length, 1);
  assert.equal(dry[0].type.text, "T-90 pellet");
  assert.equal(dry[0].quantity.text, "1");
  assert.equal(dry[0].unit.text, "oz");
  assert.equal(dry[0].applied.text, "High krausen");
  assert.equal(dry[0].contact.text, "Terminal gravity");
  assert.equal(dry[0].detail.text, "—");

  const purchases = tables["report.hop_purchases"];
  assert.deepEqual(
    purchases.map((row) => row.name.text),
    ["Citra", "Magnum", "Mosaic", "Saaz"]
  );
  assert.equal(purchases[0].form.text, "T-90 pellet");
  assert.match(purchases[0].purchase.text, /1 oz/);

  const strategy = tables["report.hop_strategy"];
  assert.equal(strategy.length, 2);
  assert.equal(strategy[0].text.text, "IBU split between the boil and the whirlpool.");
  assert.equal(strategy[1].text.text, "Sensory: pine backbone.");
});

test("a blank hopping strategy emits no report rows", async () => {
  const app = await booted();
  app.hopStrategy = " \n \n ";
  assert.deepEqual(app.reportFormattedTables()["report.hop_strategy"], []);
});

test("single newlines collapse inside a strategy paragraph", async () => {
  const app = await booted();
  app.hopStrategy = "Line one\nline two\n\nNext paragraph.";
  const strategy = app.reportFormattedTables()["report.hop_strategy"];
  assert.equal(strategy.length, 2);
  assert.equal(strategy[0].text.text, "Line one line two");
  assert.equal(strategy[1].text.text, "Next paragraph.");
});

test("a volume dry hop prints millilitres in the purchase table", async () => {
  const app = await booted();
  app.engine.setCollection("batch.boil_hops", []);
  app.engine.setCollection("batch.whirlpool_hops", []);
  app.engine.setCollection("batch.dry_hops", [
    {
      ...DRY_HOP,
      hop_id: "extract",
      variety: "Extract",
      product_type: "flowable_extract",
      quantity: 30,
      unit: "ml",
    },
  ]);
  app.compute();
  const purchases = app.reportFormattedTables()["report.hop_purchases"];
  assert.equal(purchases.length, 1);
  assert.equal(purchases[0].name.text, "Extract");
  assert.equal(purchases[0].purchase.text, "30 ml");
});

test("a dry hop duration and detail reach the report", async () => {
  const app = await booted();
  app.engine.setCollection("batch.dry_hops", [
    {
      ...DRY_HOP,
      contact_duration_min: 4320,
      contact_until: null,
      time_of_application: "day 3",
    },
  ]);
  app.compute();
  const dry = app.reportFormattedTables()["batch.dry_hops"];

  assert.equal(dry.length, 1);
  assert.equal(dry[0].contact.unit, "hr");
  assert.match(dry[0].contact.text, /72/);
  assert.equal(dry[0].detail.text, "day 3");
});

test("the IBU split shares are formatted from their artifact nodes", async () => {
  const app = await booted();
  const formatted = app.reportFormatted();
  const catalog = app.reportCatalog().nodes;

  for (const path of [
    "batch.boil_ibu_share",
    "batch.whirlpool_ibu_share",
    "batch.whirlpool_hot_ibu_share",
    "batch.whirlpool_cool_ibu_share",
  ]) {
    assert.equal(formatted[path].unit, "%");
    assert.equal(catalog[path].dimension, "percentage");
  }
  assert.equal(catalog["solver.hops.whirlpool_hot_ibu"].dimension, "ibu");
  assert.equal(catalog["solver.hops.whirlpool_cool_ibu"].dimension, "ibu");
});

const SUGAR_ROW = {
  sugar_id: "d-180",
  name: "Candi Syrup D-180",
  mass_kg: 0.5,
  parts: 10,
  resolved_mass_kg: 0.5,
  yield_fraction: 0.8,
  color_lovibond: 180,
};

test("grist shares partition the grain and sugar sits outside it", async () => {
  const app = await booted();
  app.engine.setCollection("grist.trace_malts", [
    { name: "Carafa", mass_kg: 0.1, yield_fraction: 0.6, color_lovibond: 500 },
  ]);
  app.engine.setCollection("batch.sugars", [{ ...SUGAR_ROW }]);

  const tables = app.reportFormattedTables();
  const grist = [...tables["grist.major_malts"], ...tables["grist.trace_malts"]];
  const gristSum = grist.reduce((sum, row) => sum + Number(row.grist_pct.number), 0);
  assert.equal(gristSum.toFixed(1), "100.0");

  const traceSum = tables["grist.trace_malts"].reduce(
    (sum, row) => sum + Number(row.own_pct.number),
    0
  );
  assert.equal(traceSum.toFixed(1), "100.0");

  const sugar = tables["batch.sugars"][0];
  assert.equal("own_pct" in sugar, false);
  const gristMass = 4.7 + 0.1;
  assert.equal(sugar.grist_pct.number, ((SUGAR_ROW.mass_kg / gristMass) * 100).toFixed(1));

  // The extract view excludes trace malts and closes at 100 %.
  const extractRows = [...tables["grist.major_malts"], ...tables["batch.sugars"]];
  const extractSum = extractRows.reduce((sum, row) => sum + Number(row.extract_pct.number), 0);
  assert.equal(extractSum.toFixed(1), "100.0");
  assert.ok(extractRows.every((row) => row.extract.text.endsWith("kg") || row.extract.text.endsWith("lb")));
  assert.equal("extract" in tables["grist.trace_malts"][0], false);
});

test("sugars join the fermentable tables and the summaries", async () => {
  const app = await booted();
  app.setUnit("grain_color", "Lovibond");
  app.engine.setCollection("batch.sugars", [{ ...SUGAR_ROW }]);

  const sugar = app.reportFormattedTables()["batch.sugars"];
  assert.equal(sugar.length, 1);
  assert.equal(sugar[0].name.text, "Candi Syrup D-180");
  assert.equal(sugar[0].amount.text, "0.50 kg");
  assert.equal(sugar[0].ppg.text, "37.0");
  assert.equal(sugar[0].color.text, "180.0 °L");
  assert.equal(sugar[0].grist_pct.unit, "%");

  const summaries = app.reportFormattedSummaries();
  assert.equal(summaries["batch.sugars"].color.text, "180.0 °L");
  assert.equal(summaries["batch.sugars"].extract_yield.text, "80.0%");
  assert.equal(typeof summaries.overall.color.text, "string");
  assert.equal(typeof summaries.overall.extract_yield.text, "string");
});

test("an empty sugar collection leaves the table and its summary empty", async () => {
  const app = await booted();
  const summaries = app.reportFormattedSummaries();

  assert.deepEqual(app.reportFormattedTables()["batch.sugars"], []);
  assert.equal(summaries["batch.sugars"].color, null);
  assert.equal(summaries["batch.sugars"].extract_yield, null);
});

test("the overall yield excludes the colour-only trace malts", async () => {
  const app = await booted();
  app.engine.setCollection("grist.major_malts", [
    { name: "Pale", pct: 1, parts: 100, yield_fraction: 0.8, color_lovibond: 2 },
  ]);
  app.engine.setCollection("grist.trace_malts", [
    { name: "Carafa", mass_kg: 0.1, yield_fraction: 0.6, color_lovibond: 500 },
  ]);

  const summaries = app.reportFormattedSummaries();
  const overall = summaries.overall;

  assert.equal(summaries["grist.trace_malts"].extract_yield.text, "60.0%");
  assert.equal(overall.extract_yield.text, "80.0%");
  assert.equal(summaries["grist.major_malts"].extract_yield.text, "80.0%");
});

test("share-mode sugars report the mass the late-additions table shows", async () => {
  const app = await booted();
  app.engine.setCollection("batch.sugars", [{ ...SUGAR_ROW, mass_kg: 0 }]);
  app.engine.setRoot("batch.late_addition_intent", "share");
  app.engine.setRoot("batch.sugar_extract_share", 0.1);
  app.compute();

  const sugar = app.reportFormattedTables()["batch.sugars"];
  assert.equal(sugar.length, 1);
  assert.notEqual(sugar[0].amount.text, "0.0 kg");
  assert.equal(app.reportFormattedSummaries()["batch.sugars"].extract_yield.text, "80.0%");
});

test("the checklist table carries generated steps and blank observations", async () => {
  const app = await booted();
  const rows = app.reportFormattedTables()["batch.brew_checklist"];

  assert.ok(rows.length > 20);
  const setup = rows.find((row) => row.kind.text === "step" && row.title.text === "Brew day setup");
  assert.ok(setup);
  assert.match(setup.text.text, /^Fill the HLT to /);
  const ph = rows.find((row) => row.kind.text === "observation" && row.title.text === "Mash pH");
  assert.ok(ph);
  assert.equal(ph.raw.text, "—");
  for (const row of rows) {
    for (const [column, cell] of Object.entries(row)) {
      assert.ok(cell.text, `${column} must have text`);
    }
  }
});

test("process notes print in order and skip blank rows", async () => {
  const app = await booted();
  app.engine.setCollection("batch.process_notes", [
    { text: "0.5 oz (14 g) lemon peel at flame-out" },
    { text: "   " },
    { text: "0.05 oz (1.5 g) fresh-grated ginger at flame-out" },
  ]);
  app.compute();

  const rows = app.reportFormattedTables()["batch.process_notes"];

  assert.deepEqual(
    rows.map((row) => row.note.text),
    ["0.5 oz (14 g) lemon peel at flame-out", "0.05 oz (1.5 g) fresh-grated ginger at flame-out"]
  );
});

test("the checklist level filters the frozen table and names N/A steps", async () => {
  const app = await booted();

  app.setRoot("batch.checklist_level", "critical");
  app.compute();
  const critical = app.reportFormattedTables()["batch.brew_checklist"];

  app.setRoot("batch.checklist_level", "info");
  app.compute();
  const info = app.reportFormattedTables()["batch.brew_checklist"];

  app.setRoot("batch.checklist_level", "debug");
  app.compute();
  const debug = app.reportFormattedTables()["batch.brew_checklist"];

  assert.ok(critical.length < info.length);
  assert.ok(debug.length > info.length);
  assert.ok(critical.every((row) => row.level.text === "critical"));
  const dryHop = debug.find((row) => row.title.text === "Dry hop");
  assert.ok(dryHop);
  assert.match(dryHop.text.text, /^N\/A/);
});
