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
