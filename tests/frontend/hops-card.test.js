import test from "node:test";
import assert from "node:assert/strict";

import { createTestApp } from "./appHelpers.js";

test("boil hops: parts normalize to IBU shares and mass back-calculates", () => {
  const app = createTestApp();
  app.boot();
  app.setTargetIbu(40);
  app.setWhirlpoolFraction(0);

  app.openHopEditor();
  app.addCatalogHop("cascade");
  app.addCatalogHop("citra");
  app.saveHopEditor();
  app.compute();

  assert.equal(app.hopRows.length, 2);
  for (const row of app.hopRows) {
    assert.ok(Math.abs(row.pct - 0.5) < 1e-9, `pct=${row.pct}`);
    assert.ok(Math.abs(row.ibu - 20) < 1e-9, `ibu=${row.ibu}`);
    assert.equal(row.minutes, 60); // full-boil additions
    assert.ok(typeof row.mass_kg === "number" && row.mass_kg > 0, `mass=${row.mass_kg}`);
  }

  // Lower-alpha Cascade needs more mass than high-alpha Citra for the same IBU.
  const cascade = app.hopRows.find((r) => r.hop_id === "cascade");
  const citra = app.hopRows.find((r) => r.hop_id === "citra");
  assert.ok(cascade.mass_kg > citra.mass_kg);
  assert.match(app.hopTotalMassDisplay, /(oz|g|kg|lb)/);
});

test("boil hops: parts renormalize when an addition is removed", () => {
  const app = createTestApp();
  app.boot();
  app.openHopEditor();
  app.addCatalogHop("cascade");
  app.addCatalogHop("citra");
  app.removeHop(0);
  app.saveHopEditor();
  app.compute();

  assert.equal(app.hopRows.length, 1);
  assert.ok(Math.abs(app.hopRows[0].pct - 1) < 1e-9);
});

test("both hop mass pills seed from the saved mass preference", () => {
  const app = createTestApp();
  app.boot();

  assert.equal(app.hopMassUnit, "g");
  assert.equal(app.whirlpoolHopMassUnit, "g");
});

test("hop mass unit cycles and changes the readout", () => {
  const app = createTestApp();
  app.boot();
  app.openHopEditor();
  app.addCatalogHop("cascade");
  app.saveHopEditor();
  app.compute();

  assert.equal(app.hopMassUnit, "g");
  assert.match(app.hopMass(app.hopRows[0]), /g$/);

  app.toggleHopMassUnit(); // lb
  assert.equal(app.hopMassUnit, "lb");
  assert.match(app.hopMass(app.hopRows[0]), /lb$/);

  app.toggleHopMassUnit(); // kg
  app.toggleHopMassUnit(); // oz
  app.toggleHopMassUnit(); // back to g
  assert.equal(app.hopMassUnit, "g");
});

test("the two hop mass pills are independent once seeded", () => {
  const app = createTestApp();
  app.boot();
  app.setTargetIbu(40);
  app.setWhirlpoolFraction(0.25);

  app.openHopEditor();
  app.addCatalogHop("cascade");
  app.saveHopEditor();

  app.openWhirlpoolHopEditor();
  app.addCatalogWhirlpoolHop("citra");
  app.saveWhirlpoolHopEditor();
  app.compute();

  app.toggleHopMassUnit(); // lb — boil only
  assert.equal(app.hopMassUnit, "lb");
  assert.equal(app.whirlpoolHopMassUnit, "g");
  assert.match(app.hopMass(app.hopRows[0]), /lb$/);
  assert.match(app.whirlpoolHopMass(app.whirlpoolHopRows[0]), /g$/);

  app.toggleWhirlpoolHopMassUnit(); // lb — whirlpool only
  assert.equal(app.hopMassUnit, "lb");
  assert.equal(app.whirlpoolHopMassUnit, "lb");
  assert.match(app.whirlpoolHopMass(app.whirlpoolHopRows[0]), /lb$/);

  app.toggleHopMassUnit(); // kg — boil only
  assert.match(app.boilHopTotalMassDisplay, /kg$/);
  assert.match(app.whirlpoolHopTotalMassDisplay, /lb$/);
});

test("whirlpool hops: parts normalize to IBU shares and mass back-calculates", () => {
  const app = createTestApp();
  app.boot();
  app.setTargetIbu(40);
  app.setWhirlpoolFraction(0.25);

  app.openWhirlpoolHopEditor();
  app.addCatalogWhirlpoolHop("cascade");
  app.addCatalogWhirlpoolHop("citra");
  app.saveWhirlpoolHopEditor();
  app.compute();

  assert.equal(app.whirlpoolHopRows.length, 2);
  for (const row of app.whirlpoolHopRows) {
    assert.ok(Math.abs(row.pct - 0.5) < 1e-9, `pct=${row.pct}`);
    assert.ok(Math.abs(row.ibu - 5) < 1e-9, `ibu=${row.ibu}`);
    assert.equal(row.minutes, 30);
    assert.equal(row.initial_temp_c, 99);
    assert.ok(typeof row.mass_kg === "number" && row.mass_kg > 0, `mass=${row.mass_kg}`);
  }

  const cascade = app.whirlpoolHopRows.find((r) => r.hop_id === "cascade");
  const citra = app.whirlpoolHopRows.find((r) => r.hop_id === "citra");
  assert.ok(cascade.mass_kg > citra.mass_kg);
  assert.match(app.whirlpoolHopTotalMassDisplay, /(oz|g|kg|lb)/);
});

test("whirlpool hops: rest duration and initial temperature drive the mass", () => {
  const app = createTestApp();
  app.boot();
  app.setTargetIbu(40);
  app.setWhirlpoolFraction(0.25);
  app.openWhirlpoolHopEditor();
  app.addCatalogWhirlpoolHop("cascade");
  app.editDraftCell(0, "duration_min", 30);
  app.editDraftCell(0, "initial_temp_c", 99);
  app.saveWhirlpoolHopEditor();
  app.compute();
  const hotLong = app.whirlpoolHopRows[0].mass_kg;

  app.openWhirlpoolHopEditor();
  app.editDraftCell(0, "duration_min", 15);
  app.editDraftCell(0, "initial_temp_c", 80);
  app.saveWhirlpoolHopEditor();
  app.compute();
  const coolShort = app.whirlpoolHopRows[0].mass_kg;

  assert.ok(coolShort > hotLong, `${coolShort} should exceed ${hotLong}`);
});

test("whirlpool flowable extract uses CoA alpha, grams, and the 1.20 scalar", () => {
  const app = createTestApp();
  app.boot();
  app.setTargetIbu(40);
  app.setWhirlpoolFraction(0.25);
  app.openWhirlpoolHopEditor();
  app.addCatalogWhirlpoolHop("cascade");
  app.patchDraftRow(0, { product_form: "flowable_extract", alpha_acid_pct: 0.45 });
  app.saveWhirlpoolHopEditor();
  app.compute();

  const extract = app.whirlpoolHopRows[0];
  assert.equal(extract.product_form, "flowable_extract");
  assert.match(app.hopForm(extract), /extract/i);
  assert.equal(app.whirlpoolHopMassUnit, "g");
  assert.match(app.whirlpoolHopMass(extract), /g$/);
  assert.equal(extract.ibu, 10);
  assert.ok(extract.mass_kg > 0);

  app.openWhirlpoolHopEditor();
  app.patchDraftRow(0, { product_form: "t90_pellet" });
  app.saveWhirlpoolHopEditor();
  app.compute();
  const pellet = app.whirlpoolHopRows[0];
  assert.ok(extract.mass_kg < pellet.mass_kg, "extract needs less mass at the same alpha");
});

test("whirlpool catalog switches to products and copies form, alpha, and ratio", () => {
  const app = createTestApp();
  app.boot();
  app.setTargetIbu(40);
  app.setWhirlpoolFraction(0.5);
  app.compute();

  app.openWhirlpoolHopEditor();
  app.openWhirlpoolHopSearch();
  app.setWhirlpoolHopCatalogForm("flowable_extract");
  assert.ok(app.whirlpoolHopCatalog.some((item) => item.id === "dynaboost-citra"));
  assert.ok(app.whirlpoolHopCatalog.some((item) => item.id === "incognito-citra"));
  app.addCatalogWhirlpoolHop("dynaboost-citra");
  app.saveWhirlpoolHopEditor();
  app.compute();

  const row = app.whirlpoolHopRows[0];
  assert.equal(row.name, "DynaBoost Citra");
  assert.equal(row.product_form, "flowable_extract");
  assert.equal(row.alpha_acid_pct, 0.425);
  assert.equal(row.t90_replacement_ratio, 10);
  assert.match(app.whirlpoolHopMass(row), /g$/);
});

test("inspector shows the T-90 equivalent only when the row carries a ratio", () => {
  const app = createTestApp();
  app.boot();
  app.setTargetIbu(40);
  app.setWhirlpoolFraction(0.5);
  app.compute();

  app.openWhirlpoolHopEditor();
  app.openWhirlpoolHopSearch();
  app.setWhirlpoolHopCatalogForm("flowable_extract");
  app.addCatalogWhirlpoolHop("dynaboost-citra");
  app.inspectWhirlpoolHopRow(0);
  assert.match(app.whirlpoolHopT90Equivalent, /T-90 equivalent \(1:10\)/);

  app.setWhirlpoolHopCatalogForm("flowable_extract");
  app.addCatalogWhirlpoolHop("flowable-co2-extract-generic");
  app.inspectWhirlpoolHopRow(1);
  assert.match(app.whirlpoolHopT90Equivalent, /T-90 equivalent \(1:8\)/);

  app.setWhirlpoolHopCatalogForm("t90_pellet");
  app.addCatalogWhirlpoolHop("cascade");
  app.inspectWhirlpoolHopRow(2);
  assert.equal(app.whirlpoolHopT90Equivalent, "");
});

test("flowable extract doses above the 4 g/gal ceiling warn", () => {
  const app = createTestApp();
  app.boot();
  app.setTargetIbu(100);
  app.setWhirlpoolFraction(1);
  app.openWhirlpoolHopEditor();
  app.addCatalogWhirlpoolHop("cascade");
  app.patchDraftRow(0, { product_form: "flowable_extract", alpha_acid_pct: 0.45 });
  app.saveWhirlpoolHopEditor();
  app.compute();

  assert.match(app.whirlpoolHopDoseWarning, /4 g\/gal/);
});

test("whirlpool ambient follows the global temperature unit", () => {
  const app = createTestApp();
  app.boot();
  app.setUnit("temperature", "degF");

  assert.equal(app.whirlpoolAmbientField.unit, "°F");
  assert.equal(app.whirlpoolAmbientField.display, "68");

  app.edit(app.whirlpoolAmbientField, "77");
  assert.equal(app.master.getRoot("batch.whirlpool_ambient_temp_c"), 25);
});

test("whirlpool cooling time constant changes the required mass", () => {
  const app = createTestApp();
  app.boot();
  app.setTargetIbu(40);
  app.setWhirlpoolFraction(0.25);
  app.openWhirlpoolHopEditor();
  app.addCatalogWhirlpoolHop("cascade");
  app.saveWhirlpoolHopEditor();
  app.compute();
  const slowCoolingMass = app.whirlpoolHopRows[0].mass_kg;

  app.edit(app.whirlpoolCoolingField, "60");
  app.compute();
  const fastCoolingMass = app.whirlpoolHopRows[0].mass_kg;

  assert.ok(fastCoolingMass > slowCoolingMass, `${fastCoolingMass} should exceed ${slowCoolingMass}`);
});

test("total hop mass includes boil and whirlpool additions", () => {
  const app = createTestApp();
  app.boot();
  app.setTargetIbu(40);
  app.setWhirlpoolFraction(0.25);
  app.openHopEditor();
  app.addCatalogHop("cascade");
  app.saveHopEditor();
  app.openWhirlpoolHopEditor();
  app.addCatalogWhirlpoolHop("citra");
  app.saveWhirlpoolHopEditor();
  app.compute();

  assert.equal(app.hopRows.length, 1);
  assert.equal(app.whirlpoolHopRows.length, 1);
  assert.ok(app.hopTotalMassKg > app.hopRows[0].mass_kg);
  assert.ok(app.hopTotalMassKg > app.whirlpoolHopRows[0].mass_kg);
});
