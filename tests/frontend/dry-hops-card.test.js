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
  assert.deepEqual(row.application, { kind: "event", event: "high_krausen" });
  assert.deepEqual(row.contact, { kind: "open" });
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
  app.addCatalogDryHop("cryo-citra");
  app.saveDryHopEditor();
  app.compute();

  assert.equal(app.dryHopRows[0].product_type, "lupulin_pellet");
}));

test("the schedule setters write the language and render it", withFreshApp((app) => {
  app.openDryHopEditor();
  app.addCatalogDryHop("cascade");
  app.addCatalogDryHop("cascade");
  app.inspectDryHopRow(1);

  assert.equal(app.dryHopWhen(app.draftRows[1]), "High krausen");

  app.setDryHopApplicationKind("after");
  app.setDryHopApplicationRef("ordinal:1");
  app.setDryHopApplicationOffset("2");
  assert.equal(app.dryHopWhen(app.draftRows[1]), "charge 1 + 2 d");

  app.setDryHopContactKind("for");
  app.setDryHopContactDays("7");
  assert.equal(app.dryHopContact(app.draftRows[1]), "for 7 d");

  app.setDryHopContactKind("until");
  app.setDryHopContactUntilKind("event");
  app.setDryHopContactUntilEvent("packaging");
  assert.equal(app.dryHopContact(app.draftRows[1]), "until Packaging");

  app.setDryHopContactKind("open");
  assert.equal(app.dryHopContact(app.draftRows[1]), "no end recorded");
}));

test("a day application renders in fermenter days", withFreshApp((app) => {
  app.openDryHopEditor();
  app.addCatalogDryHop("citra");
  app.inspectDryHopRow(0);
  app.setDryHopApplicationKind("day");
  app.setDryHopApplicationDay("3.5");
  assert.equal(app.dryHopWhen(app.draftRows[0]), "Day 3.5");
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

test("loadState migrates a legacy dry-hop row", withFreshApp(async (app) => {
  await app.loadState({
    collections: {
      "batch.dry_hops": [
        {
          hop_id: "citra",
          variety: "Citra",
          product_type: "t90_pellet",
          quantity: 1,
          unit: "oz",
          application_stage: "fermentation",
          application_event: "terminal",
          contact_duration_min: 10080,
          contact_until: null,
          time_of_application: "day 3",
          notes: "",
        },
      ],
    },
  });

  const row = app.engine.get("batch.dry_hops")[0];
  assert.deepEqual(row.application, { kind: "event", event: "terminal_gravity" });
  assert.deepEqual(row.contact, { kind: "for", days: 7 });
  assert.match(row.notes, /day 3/);
  assert.equal("application_event" in row, false);
}));
