// The Fermentables card is one bill in three disclosures: the major grist, the
// trace malts and the sugars. The three open independently, their headers sum
// what each contributes, and the card-level strip rolls the bill up once — the
// total mass the three add to, and the colour the model derives from all three.

import test from "node:test";
import assert from "node:assert/strict";

import { withFreshApp } from "./appHelpers.js";
import { read } from "../guards/util.js";

const CARD = read("frontend/src/partials/step-fermentables.html");
const SUGAR_SECTION = read("frontend/src/partials/fermentables-sugar-section.html");

const billMass = (app) => app.maltMassField.value + app.traceMassField.value + app.sugarMassField.value;

test("the three sections start open and toggle independently", withFreshApp((app) => {
  assert.equal(app.maltSectionOpen, true);
  assert.equal(app.traceSectionOpen, true);
  assert.equal(app.sugarSectionOpen, true);

  app.toggleTraceSection();
  assert.equal(app.traceSectionOpen, false);
  assert.equal(app.maltSectionOpen, true);
  assert.equal(app.sugarSectionOpen, true);

  app.toggleTraceSection();
  app.toggleSugarSection();
  assert.equal(app.traceSectionOpen, true);
  assert.equal(app.sugarSectionOpen, false);
  assert.equal(app.maltSectionOpen, true);
}));

test("each section header counts its rows and sums its own mass", withFreshApp((app) => {
  const seededMalts = app.gristRows.length;
  assert.match(app.maltSectionMeta, new RegExp(`^${seededMalts} malts · .+$`));
  assert.equal(app.traceSectionMeta, "0 trace malts");
  assert.equal(app.sugarSectionMeta, "No sugars");

  app.openMaltEditor();
  app.addCatalogMalt(app.maltCatalog[0].id);
  app.saveMaltEditor();
  app.compute();
  assert.match(app.maltSectionMeta, new RegExp(`^${seededMalts + 1} malts · .+$`));

  app.openTraceEditor();
  app.addCatalogTrace(app.traceCatalog[0].id);
  app.saveTraceEditor();
  app.compute();
  assert.match(app.traceSectionMeta, /^1 trace malt · .+$/);

  app.openSugarEditor();
  app.addCatalogSugar(app.sugarCatalog[0].id);
  app.saveSugarEditor();
  app.compute();
  assert.match(app.sugarSectionMeta, /^1 sugar · .+$/);
}));

test("the roll-up is the whole bill, not one section", withFreshApp((app) => {
  assert.equal(app.gristTotalMassField.id, "grist.total_mass");
  assert.equal(app.beerColorField.id, "grist.finished_beer_srm");

  app.openSugarEditor();
  app.addCatalogSugar(app.sugarCatalog[0].id);
  app.draftRows[0].mass_kg = 0.5;
  app.saveSugarEditor();
  app.compute();

  assert.ok(app.sugarMassField.value > 0, "the sugar section contributes to the bill");
  assert.ok(Math.abs(app.gristTotalMassField.value - billMass(app)) < 1e-9);
  assert.ok(Math.abs(app.engine.get("grist.total_mass") - billMass(app)) < 1e-9);
  assert.ok(app.beerColorField.value > 0);
}));

test("the colour stays the Batch step's field, not this card's", withFreshApp((app) => {
  assert.equal(app.beerColorField.slice, "batch");
  assert.equal(app.beerColorField.label, "Beer color");
}));

test("the roll-up labels name their scope and no section strip claims beer color", () => {
  assert.match(CARD, /Total bill mass \(grist \+ trace \+ sugars\)/);
  assert.match(CARD, /Beer color \(whole bill\)/);
  assert.doesNotMatch(CARD, /Weighted (?:grist|trace|sugar) color/);

  assert.match(SUGAR_SECTION, /class="section-meta" x-text="sugarSectionMeta"/);
  assert.match(SUGAR_SECTION, /detail-toggle/);
  assert.match(SUGAR_SECTION, /class="detail-panel"/);
  assert.doesNotMatch(SUGAR_SECTION, /latePinPanelOpen \? 'Hide' : 'Show'/);
});
