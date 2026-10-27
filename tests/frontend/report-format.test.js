// Freeze-time display strings: the report's only formatting source. The
// catalog is unit-aware and the formatted block uses the same producer rules
// as the UI, including nonlinear gravity.

import test from "node:test";
import assert from "node:assert/strict";

import { createTestApp } from "./appHelpers.js";

async function booted() {
  const app = createTestApp();
  await app.boot();
  return app;
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
