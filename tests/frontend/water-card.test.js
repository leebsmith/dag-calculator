import test from "node:test";
import assert from "node:assert/strict";

import { createStepApp } from "../../frontend/src/adapters/stepAdapter.js";
import { kettleBlend, ionDelta } from "../../frontend/src/adapters/cards/water.js";
import { WATER_IONS } from "../../frontend/src/views/registry/water.js";
import waterTargetProfiles from "../../data/seeds/water_target_profiles.json" with { type: "json" };

test("kettleBlend reduces to the mash vector when both vessels are identical", () => {
  const mash = { calcium_ca: 60, magnesium_mg: 5, sodium_na: 10, sulfate_so4: 100, chloride_cl: 50, alkalinity_as_caco3: 40 };
  const hlt = { ...mash };
  assert.deepEqual(kettleBlend(mash, hlt, 10, 14), mash);
});

test("kettleBlend volume-weights the two treated vectors", () => {
  const mash = { calcium_ca: 100, magnesium_mg: 0, sodium_na: 0, sulfate_so4: 0, chloride_cl: 0, alkalinity_as_caco3: 0 };
  const hlt = { calcium_ca: 0, magnesium_mg: 0, sodium_na: 0, sulfate_so4: 0, chloride_cl: 0, alkalinity_as_caco3: 0 };
  assert.equal(kettleBlend(mash, hlt, 10, 10).calcium_ca, 50);
});

test("kettleBlend returns null when no water reaches the kettle", () => {
  const ions = { calcium_ca: 10, magnesium_mg: 0, sodium_na: 0, sulfate_so4: 0, chloride_cl: 0, alkalinity_as_caco3: 0 };
  assert.equal(kettleBlend(ions, ions, 0, 0), null);
});

test("ionDelta is null when either side is missing", () => {
  assert.equal(ionDelta(10, 6), 4);
  assert.equal(ionDelta(null, 6), null);
  assert.equal(ionDelta(10, undefined), null);
});

test("the water summary and brew-day instruction branch on the mode", () => {
  const app = createStepApp();
  app.boot();
  app.setRoot("water.salt_distribution", "MASH_ONLY");
  app.compute();

  assert.equal(app.waterSummary.proportional, false);
  assert.match(app.waterInstruction("dough-in"), /dose the dry grist before underletting/i);
  assert.match(app.waterInstruction("batch-sparge"), /no salts in the HLT/i);

  app.setRoot("water.salt_distribution", "PROPORTIONAL");
  app.compute();
  assert.equal(app.waterSummary.proportional, true);
  assert.match(app.waterInstruction("batch-sparge"), /add .* to the HLT/i);
  assert.match(app.waterInstruction("brew-day-setup"), /metabisulfite/i);
});

test("the target column follows the routed mode's pin set", () => {
  const app = createStepApp();
  app.boot();
  app.setRoot("water.strategy", "CALCIUM_FLOOR");
  app.setRoot("water.target.sulfate_so4", 250);
  app.setRoot("water.target.chloride_cl", 50);
  app.compute();

  const rows = Object.fromEntries(app.waterSummary.ions.map((r) => [r.ion, r]));
  assert.deepEqual(
    app.waterSummary.ions.map((r) => r.ion),
    WATER_IONS.map((r) => r.ion)
  );

  assert.equal(rows.sulfate_so4.status, "Target");
  assert.equal(rows.sulfate_so4.targetText, "250");
  assert.equal(rows.chloride_cl.status, "Target");
  assert.equal(rows.chloride_cl.targetText, "50");
  assert.equal(rows.sulfate_so4.deltaText, "-150");

  for (const ion of ["calcium_ca", "magnesium_mg", "sodium_na", "alkalinity_as_caco3"]) {
    assert.equal(rows[ion].status, "Auto");
    assert.equal(rows[ion].targetText, "(Auto)");
    assert.equal(rows[ion].deltaText, "—");
  }
});

test("AUTO renders the router's resolved mode, not a blank target column", () => {
  const app = createStepApp();
  app.boot();
  app.setRoot("water.strategy", "AUTO");
  app.setRoot("water.target.sulfate_so4", 250);
  app.compute();

  assert.equal(app.waterSummary.resolvedMode, "CALCIUM_FLOOR");
  const sulfate = app.waterSummary.ions.find((r) => r.ion === "sulfate_so4");
  assert.equal(sulfate.status, "Target");
  assert.equal(sulfate.targetText, "250");
});

test("BASELINE floats every ion", () => {
  const app = createStepApp();
  app.boot();
  app.setRoot("water.strategy", "BASELINE");
  app.compute();

  for (const row of app.waterSummary.ions) {
    assert.equal(row.status, "Auto");
    assert.equal(row.targetText, "(Auto)");
  }
});

test("switching profiles resets the previous profile's targets and returns to AUTO", () => {
  const app = createStepApp();
  app.boot();

  const applyProfile = (id) => {
    app.setRoot("water.target_profile_id", id);
    app.pickSelection("water.target_profile_id", id);
    app.copyInCascade("water.target_profile_id");
    app.compute();
  };
  const target = (ion) => app.fieldsById[`water.target.${ion}`]?.value;

  applyProfile("soft-pilsner");
  assert.equal(target("calcium_ca"), 15);
  assert.equal(target("magnesium_mg"), 3);
  assert.equal(target("sodium_na"), 4);
  assert.equal(target("alkalinity_as_caco3"), 15);
  assert.equal(app.fieldsById["water.calcium_floor_ppm"].value, 15);
  assert.equal(app.waterSummary.mode, "AUTO");

  applyProfile("hoppy-ipa");
  assert.equal(target("sulfate_so4"), 250);
  assert.equal(target("chloride_cl"), 50);
  for (const ion of ["calcium_ca", "magnesium_mg", "sodium_na", "alkalinity_as_caco3"]) {
    assert.equal(target(ion), 0, `${ion} must not survive the profile switch`);
  }
  assert.equal(app.fieldsById["water.calcium_floor_ppm"].value, 50);
  assert.equal(app.waterSummary.mode, "AUTO");
});

test("every shipped profile declares only the ions its mode targets", () => {
  const modes = {
    "soft-pilsner": ["calcium_ca", "magnesium_mg", "sodium_na", "sulfate_so4", "chloride_cl", "alkalinity_as_caco3"],
    "balanced-pale": ["sulfate_so4", "chloride_cl"],
    "hoppy-ipa": ["sulfate_so4", "chloride_cl"],
    "malty-amber": ["sulfate_so4", "chloride_cl", "alkalinity_as_caco3"],
    "dark-stout": ["sulfate_so4", "chloride_cl", "alkalinity_as_caco3"],
    "belgian-golden-tripel": ["sulfate_so4", "chloride_cl"],
    "belgian-saison": ["sulfate_so4", "chloride_cl"],
  };

  for (const [id, expected] of Object.entries(modes)) {
    const profile = waterTargetProfiles[id];
    const declared = WATER_IONS.map((row) => row.ion).filter(
      (ion) => typeof profile[ion] === "number" && profile[ion] > 0
    );
    assert.deepEqual(declared, expected, `${id} declares unexpected ions`);
  }
});

test("Mode 5 caps the pin set at four and never empties it", () => {
  const app = createStepApp();
  app.boot();
  app.setRoot("water.strategy", "CUSTOM");

  for (const ion of ["ca", "mg", "na", "so4"]) app.toggleWaterPin(ion);
  assert.equal(app.waterPinDisabled("cl"), true);
  app.toggleWaterPin("cl");
  assert.deepEqual(app.waterSummary.pinnedIons, ["ca", "mg", "na", "so4"]);

  for (const ion of ["ca", "mg", "na", "so4"]) app.toggleWaterPin(ion);
  assert.deepEqual(app.waterSummary.pinnedIons, ["so4"]);
});

test("reference pickers show names and the held / best-fit / float vocabulary", () => {
  const app = createStepApp();
  app.boot();
  app.compute();

  const profiles = app.fieldsById["water.target_profile_id"].optionLabels;
  assert.equal(profiles["hoppy-ipa"], "Hoppy / IPA — SO₄/Cl held");
  assert.equal(profiles["malty-amber"], "Malty / Amber — SO₄/Cl/alk held");
  assert.equal(profiles["soft-pilsner"], "Soft Pilsner — all six, best fit");

  const reports = app.fieldsById["water.source_report_id"].optionLabels;
  assert.equal(reports["25138"], "Ward Laboratories, Inc.");
  assert.equal(reports["ro-distilled"], "RO / Distilled (definition)");
});

test("the brew-day payload carries the derived water instruction", () => {
  const app = createStepApp();
  app.boot();
  app.toggleBrewDayStep("dough-in", true);
  app.compute();

  const sections = app.brewDayPayload.sections;
  const mashing = sections.find((s) => s.id === "mashing");
  const doughIn = mashing.steps.find((row) => row.id === "dough-in");
  assert.match(doughIn.instructions, /dose the dry grist before underletting/i);
});
