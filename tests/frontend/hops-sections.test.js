import test from "node:test";
import assert from "node:assert/strict";

import { createTestApp, withFreshApp } from "./appHelpers.js";

test("hops: the three sections start open", () => {
  const app = createTestApp();
  assert.deepEqual(app.hopSections, { boil: true, whirlpool: true });
  assert.equal(app.dryHopSectionOpen, true);
});

test("hops: section toggles are independent", () => {
  const app = createTestApp();

  app.toggleHopSection("boil");
  assert.equal(app.isHopSectionOpen("boil"), false);
  assert.equal(app.isHopSectionOpen("whirlpool"), true);

  app.toggleDryHopSection();
  assert.equal(app.dryHopSectionOpen, false);
  assert.equal(app.isHopSectionOpen("whirlpool"), true);

  app.toggleHopSection("boil");
  assert.equal(app.isHopSectionOpen("boil"), true);
  assert.equal(app.dryHopSectionOpen, false);
});

test("hops: the dry-hop collection is attributed to the hops step", withFreshApp((app) => {
  assert.ok(app.fieldsBySlice.hops.some((field) => field.id === "batch.dry_hops"));
  assert.equal(app.fieldsBySlice["dry-hops"], undefined);
}));

test("hops: section metas count additions and quote the IBU target", withFreshApp((app) => {
  assert.equal(app.boilHopSectionMeta, "0 additions");
  assert.equal(app.whirlpoolHopSectionMeta, "0 additions");
  assert.equal(app.dryHopSectionMeta, "0 additions");

  app.setTargetIbu(40);
  app.setWhirlpoolFraction(0.25);

  app.openHopEditor();
  app.addCatalogHop("cascade");
  app.saveHopEditor();

  app.openWhirlpoolHopEditor();
  app.addCatalogWhirlpoolHop("citra");
  app.saveWhirlpoolHopEditor();

  app.openDryHopEditor();
  app.addCatalogDryHop("citra");
  app.saveDryHopEditor();
  app.compute();

  assert.match(app.boilHopSectionMeta, /^1 addition · 30(\.0)? IBU$/);
  assert.match(app.whirlpoolHopSectionMeta, /^1 addition · 10(\.0)? IBU$/);
  assert.equal(app.dryHopSectionMeta, "1 addition");
}));

test("hops: dry hops stay out of the card totals", withFreshApp((app) => {
  app.setTargetIbu(40);
  app.setWhirlpoolFraction(0);

  app.openHopEditor();
  app.addCatalogHop("cascade");
  app.saveHopEditor();
  app.compute();

  const boilMass = app.boilHopTotalMassDisplay;
  const totalMass = app.hopTotalMassDisplay;
  assert.notEqual(totalMass, "—");

  app.openDryHopEditor();
  app.addCatalogDryHop("citra");
  app.saveDryHopEditor();
  app.compute();

  assert.equal(app.dryHopRows.length, 1);
  assert.equal(app.boilHopTotalMassDisplay, boilMass);
  assert.equal(app.hopTotalMassDisplay, totalMass);
}));
