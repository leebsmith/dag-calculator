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
