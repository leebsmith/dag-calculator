import test from "node:test";
import assert from "node:assert/strict";

import { createStepApp } from "../../frontend/src/adapters/stepAdapter.js";

test("boil hops: parts normalize to IBU shares and mass back-calculates", () => {
  const app = createStepApp();
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
  const app = createStepApp();
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

test("hop mass unit defaults to oz, cycles, and changes the readout", () => {
  const app = createStepApp();
  app.boot();
  app.openHopEditor();
  app.addCatalogHop("cascade");
  app.saveHopEditor();
  app.compute();

  assert.equal(app.hopMassUnit, "oz");
  assert.match(app.hopMass(app.hopRows[0]), /oz$/);

  app.toggleHopMassUnit(); // g
  assert.equal(app.hopMassUnit, "g");
  assert.match(app.hopMass(app.hopRows[0]), /g$/);

  app.toggleHopMassUnit(); // lb
  app.toggleHopMassUnit(); // kg
  app.toggleHopMassUnit(); // back to oz
  assert.equal(app.hopMassUnit, "oz");
});

test("whirlpool hops: parts normalize to IBU shares and mass back-calculates", () => {
  const app = createStepApp();
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
  const app = createStepApp();
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

test("whirlpool cooling time constant changes the required mass", () => {
  const app = createStepApp();
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
  const app = createStepApp();
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
