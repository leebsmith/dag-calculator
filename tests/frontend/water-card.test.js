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

test("the checked set drives the grid and the derived strategy", () => {
  const app = createStepApp();
  app.boot();
  app.selectWaterTarget("freeform");
  app.toggleWaterTarget("so4");
  app.editWaterTarget("so4", "250");
  app.toggleWaterTarget("cl");
  app.editWaterTarget("cl", "50");
  app.compute();

  assert.equal(app.waterSummary.mode, "CALCIUM_FLOOR");
  assert.deepEqual(app.waterSummary.valuedPins, ["so4", "cl"]);
  const rows = Object.fromEntries(app.waterSummary.ions.map((row) => [row.ion, row]));
  assert.equal(rows.sulfate_so4.checked, true);
  assert.equal(rows.sulfate_so4.status, "Target");
  assert.equal(rows.sulfate_so4.valueText, "250");
  assert.equal(rows.sulfate_so4.deltaText, "-150");
  assert.equal(rows.chloride_cl.valueText, "50");

  for (const ion of ["calcium_ca", "magnesium_mg", "sodium_na", "alkalinity_as_caco3"]) {
    assert.equal(rows[ion].checked, false);
    assert.equal(rows[ion].status, "Auto");
    assert.equal(rows[ion].valueText, "(Auto)");
    assert.equal(rows[ion].deltaText, "—");
  }
});

test("a checked ion with no value is excluded and hinted", () => {
  const app = createStepApp();
  app.boot();
  app.selectWaterTarget("freeform");
  app.toggleWaterTarget("so4");
  app.compute();

  const row = app.waterSummary.ions.find((r) => r.ion === "sulfate_so4");
  assert.equal(row.checked, true);
  assert.equal(row.status, "No value");
  assert.equal(row.hint, "no target entered");
  assert.deepEqual(app.waterSummary.valuedPins, []);
  assert.equal(app.waterSummary.mode, "BASELINE");
  assert.match(app.waterSummary.targetLine, /No targets/);
});

test("No targets locks the grid; Freeform unlocks it", () => {
  const app = createStepApp();
  app.boot();
  assert.equal(app.waterTargetLocked, true, "an untargeted draft opens locked");

  app.toggleWaterTarget("so4");
  app.compute();
  assert.deepEqual(app.waterSummary.checkedPins, [], "a locked grid ignores toggles");

  app.selectWaterTarget("freeform");
  assert.equal(app.waterTargetLocked, false);
  app.toggleWaterTarget("ca");
  app.editWaterTarget("ca", "60");
  app.compute();
  assert.deepEqual(app.waterSummary.checkedPins, ["ca"]);
  assert.equal(app.waterSummary.mode, "CUSTOM");
});

test("presets clear the previous targets, fill their ions and derive the strategy", () => {
  const app = createStepApp();
  app.boot();
  const target = (ion) => app.master.getRoot(`water.target.${ion}`);

  app.selectWaterTarget("soft-pilsner");
  app.compute();
  assert.equal(target("calcium_ca"), 15);
  assert.equal(target("magnesium_mg"), 3);
  assert.equal(target("sodium_na"), 4);
  assert.equal(target("alkalinity_as_caco3"), 15);
  assert.equal(app.master.getRoot("water.calcium_floor_ppm"), 15);
  assert.equal(app.waterSummary.mode, "OPTIMIZE");
  assert.equal(app.waterSummary.checkedPins.length, 6);
  assert.equal(app.waterTargetLocked, false);

  app.selectWaterTarget("hoppy-ipa");
  app.compute();
  assert.equal(target("sulfate_so4"), 250);
  assert.equal(target("chloride_cl"), 50);
  for (const ion of ["calcium_ca", "magnesium_mg", "sodium_na", "alkalinity_as_caco3"]) {
    assert.equal(target(ion), 0, `${ion} must not survive the profile switch`);
  }
  assert.equal(app.master.getRoot("water.calcium_floor_ppm"), 50);
  assert.equal(app.waterSummary.mode, "CALCIUM_FLOOR");
  assert.deepEqual(app.waterSummary.checkedPins, ["so4", "cl"]);
  assert.equal(app.master.getRoot("water.target_profile_id"), "hoppy-ipa");
});

test("toggling a checked ion detaches the preset", () => {
  const app = createStepApp();
  app.boot();
  app.selectWaterTarget("hoppy-ipa");
  app.toggleWaterTarget("cl");
  app.compute();

  assert.equal(app.master.getRoot("water.target_profile_id"), "");
  assert.equal(app.waterTargetSelection, "freeform");
  assert.deepEqual(app.waterSummary.checkedPins, ["so4"]);
  assert.equal(app.waterSummary.mode, "CUSTOM");
});

test("five and six checked are allowed and reported", () => {
  const app = createStepApp();
  app.boot();
  app.selectWaterTarget("freeform");
  for (const pin of ["ca", "mg", "na", "so4", "cl"]) {
    app.toggleWaterTarget(pin);
    app.editWaterTarget(pin, "100");
  }
  app.compute();
  assert.equal(app.waterSummary.mode, "CUSTOM");
  assert.match(app.waterSummary.targetLine, /exactly determined, may be infeasible/);

  app.toggleWaterTarget("alk");
  app.editWaterTarget("alk", "80");
  app.compute();
  assert.equal(app.waterSummary.mode, "OPTIMIZE");
  assert.match(app.waterSummary.targetLine, /best fit, nothing held exactly/);
});

test("the selector lists constraints first and keeps the pseudo-options at the ends", () => {
  const app = createStepApp();
  app.boot();
  app.compute();

  const options = app.waterTargetOptions;
  assert.equal(options[0].value, "none");
  assert.equal(options.at(-1).value, "freeform");
  const labels = Object.fromEntries(options.map((option) => [option.value, option.label]));
  assert.equal(labels["hoppy-ipa"], "SO₄/Cl — Hoppy / IPA");
  assert.equal(labels["malty-amber"], "SO₄/Cl/Alk — Malty / Amber");
  assert.equal(labels["soft-pilsner"], "All six — Soft Pilsner");

  const reports = app.fieldsById["water.source_report_id"].optionLabels;
  assert.equal(reports["25138"], "Ward Laboratories, Inc.");
  assert.equal(reports["ro-distilled"], "RO / Distilled (definition)");
  assert.equal(app.waterTargetSelection, "none");
});

test("every shipped profile declares a non-empty target set", () => {
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
