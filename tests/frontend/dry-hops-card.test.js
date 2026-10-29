import test from "node:test";
import assert from "node:assert/strict";

import { withFreshApp } from "./appHelpers.js";

test("a new dry hop carries the cold-side defaults", withFreshApp((app) => {
  assert.equal(app.dryHopRows.length, 0);
  app.addDryHop();
  app.compute();

  assert.equal(app.dryHopRows.length, 1);
  const row = app.dryHopRows[0];
  assert.equal(row.application_stage, "fermentation");
  assert.equal(row.application_event, "high_krausen");
  assert.equal(row.product_type, "t90_pellet");
  assert.equal(row.unit, "g");
  assert.equal(row.contact_duration_min, null);
  assert.equal(row.contact_until, null);
}));

test("contact hours are written in minutes and clear the end event", withFreshApp((app) => {
  app.addDryHop();
  app.setDryHopContactUntil(0, "vdk_clearance");
  assert.equal(app.dryHopRows[0].contact_until, "vdk_clearance");

  app.setDryHopContactHours(0, "72");
  app.compute();
  assert.equal(app.dryHopRows[0].contact_duration_min, 4320);
  assert.equal(app.dryHopRows[0].contact_until, null);
  assert.equal(app.dryHopContactHours(app.dryHopRows[0]), "72.0");
}));

test("an end event clears the contact duration", withFreshApp((app) => {
  app.addDryHop();
  app.setDryHopContactHours(0, "24");
  app.setDryHopContactUntil(0, "terminal_gravity");
  assert.equal(app.dryHopRows[0].contact_duration_min, null);
  assert.equal(app.dryHopRows[0].contact_until, "terminal_gravity");
}));

test("clearing the contact hours empties the duration", withFreshApp((app) => {
  app.addDryHop();
  app.setDryHopContactHours(0, "48");
  app.setDryHopContactHours(0, "");
  assert.equal(app.dryHopRows[0].contact_duration_min, null);
  assert.equal(app.dryHopRows[0].contact_until, null);
}));

test("quantity is numeric and removals drop the row", withFreshApp((app) => {
  app.addDryHop();
  app.addDryHop();
  app.setDryHopNumber(0, "quantity", "56");
  app.setDryHopField(0, "variety", "Citra");
  app.compute();

  assert.equal(app.dryHopRows[0].quantity, 56);
  assert.equal(app.dryHopTitle(app.dryHopRows[0]), "Citra");

  app.removeDryHop(0);
  app.compute();
  assert.equal(app.dryHopRows.length, 1);
  assert.equal(app.dryHopRows[0].variety, "");
}));
