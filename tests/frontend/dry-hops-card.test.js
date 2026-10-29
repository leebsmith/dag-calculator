import test from "node:test";
import assert from "node:assert/strict";

import { withFreshApp } from "./appHelpers.js";

test("a catalog addition carries the cold-side defaults", withFreshApp((app) => {
  app.openDryHopEditor();
  app.addCatalogDryHop("cascade");
  app.saveDryHopEditor();
  app.compute();

  assert.equal(app.dryHopRows.length, 1);
  const row = app.dryHopRows[0];
  assert.equal(row.hop_id, "cascade");
  assert.equal(row.variety, "Cascade");
  assert.equal(row.product_type, "t90_pellet");
  assert.equal(row.unit, "g");
  assert.equal(row.application_stage, "fermentation");
  assert.equal(row.application_event, "high_krausen");
  assert.equal(row.contact_duration_min, null);
  assert.equal(row.contact_until, null);
}));

test("the same hop can be added twice", withFreshApp((app) => {
  app.openDryHopEditor();
  app.addCatalogDryHop("citra");
  app.addCatalogDryHop("citra");
  assert.deepEqual(app.dryHopDraftCounts, { citra: 2 });
  app.saveDryHopEditor();
  app.compute();

  assert.equal(app.dryHopRows.length, 2);
  assert.deepEqual(
    app.dryHopRows.map((row) => row.hop_id),
    ["citra", "citra"]
  );
}));

test("a caterpillar product keeps its own form", withFreshApp((app) => {
  app.openDryHopEditor();
  app.addCatalogDryHop("cryo-cascade");
  app.saveDryHopEditor();
  app.compute();

  assert.equal(app.dryHopRows[0].product_type, "lupulin_pellet");
}));

test("contact hours are written in minutes and clear the end event", withFreshApp((app) => {
  app.openDryHopEditor();
  app.addCatalogDryHop("cascade");
  app.setDryHopDraftContactUntil(0, "vdk_clearance");
  assert.equal(app.draftRows[0].contact_until, "vdk_clearance");

  app.setDryHopDraftContactHours(0, "72");
  assert.equal(app.draftRows[0].contact_duration_min, 4320);
  assert.equal(app.draftRows[0].contact_until, null);

  app.saveDryHopEditor();
  app.compute();
  assert.equal(app.dryHopContactHours(app.dryHopRows[0]), "72.0");
  assert.equal(app.dryHopContactLabel(app.dryHopRows[0]), "72.0 h");
}));

test("an end event clears the contact duration", withFreshApp((app) => {
  app.openDryHopEditor();
  app.addCatalogDryHop("cascade");
  app.setDryHopDraftContactHours(0, "24");
  app.setDryHopDraftContactUntil(0, "terminal_gravity");
  assert.equal(app.draftRows[0].contact_duration_min, null);
  assert.equal(app.draftRows[0].contact_until, "terminal_gravity");
  assert.equal(app.dryHopContactLabel(app.draftRows[0]), "until Terminal gravity");
}));

test("quantity is numeric and removals drop the row", withFreshApp((app) => {
  app.openDryHopEditor();
  app.addCatalogDryHop("cascade");
  app.addCatalogDryHop("citra");
  app.setDryHopDraftNumber(0, "quantity", "56");
  app.saveDryHopEditor();
  app.compute();

  assert.equal(app.dryHopRows[0].quantity, 56);

  app.openDryHopEditor();
  app.removeDryHop(0);
  app.saveDryHopEditor();
  app.compute();

  assert.equal(app.dryHopRows.length, 1);
  assert.equal(app.dryHopRows[0].hop_id, "citra");
}));
