import test from "node:test";
import assert from "node:assert/strict";

import { createStepApp } from "../../frontend/src/adapters/stepAdapter.js";
import { kettleBlend, ionDelta } from "../../frontend/src/adapters/cards/water.js";
import { WATER_IONS } from "../../frontend/src/views/registry/water.js";
import waterTargetProfiles from "../../data/seeds/water_target_profiles.json" with { type: "json" };

async function loadWaterSource(app, source) {
  const identity = { ...app.engine.identity, "water.source": source };
  await app.loadState({ identity, roots: {}, collections: {}, selections: {} });
  app.compute();
}

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
  assert.equal(rows.sulfate_so4.valueText, "250.0");
  assert.equal(rows.sulfate_so4.deltaText, "-150.0");
  assert.equal(rows.chloride_cl.valueText, "50.0");

  for (const ion of ["calcium_ca", "magnesium_mg", "sodium_na", "alkalinity_as_caco3"]) {
    assert.equal(rows[ion].checked, false);
    assert.equal(rows[ion].status, "Auto");
    assert.equal(rows[ion].valueText, "(Auto)");
    assert.equal(rows[ion].deltaText, "—");
  }
});

test("checking an ion seeds a value from the water source", async () => {
  const app = createStepApp();
  app.boot();
  await loadWaterSource(app, {
    report_id: "w1",
    laboratory: "Ward",
    calcium_ca: 40,
    magnesium_mg: 8,
    sodium_na: 20,
    sulfate_so4: 75,
    chloride_cl: 25,
    total_alkalinity_caco3: 80,
  });
  app.selectWaterTarget("freeform");
  app.toggleWaterTarget("so4");
  app.compute();

  const row = app.waterSummary.ions.find((r) => r.ion === "sulfate_so4");
  assert.equal(row.checked, true);
  assert.equal(row.targetValue, 75);
  assert.equal(row.hint, "");
  assert.deepEqual(app.waterSummary.valuedPins, ["so4"]);
  assert.equal(app.waterSummary.mode, "CUSTOM");
  assert.equal(app.master.getRoot("water.target.sulfate_so4"), 75);
});

test("clearing a checked ion's value unchecks it", () => {
  const app = createStepApp();
  app.boot();
  app.selectWaterTarget("freeform");
  app.toggleWaterTarget("so4");
  app.compute();

  app.editWaterTarget("so4", "");
  app.compute();

  const row = app.waterSummary.ions.find((r) => r.ion === "sulfate_so4");
  assert.equal(row.checked, false);
  assert.equal(app.master.getRoot("water.target.sulfate_so4"), undefined);
  assert.deepEqual(app.waterSummary.checkedPins, []);
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
  const target = (ion) => app.engine.get(`water.target.${ion}`);

  app.selectWaterTarget("soft-pilsner");
  app.compute();
  assert.equal(target("calcium_ca"), 15);
  assert.equal(target("magnesium_mg"), 3);
  assert.equal(target("sodium_na"), 4);
  assert.equal(target("alkalinity_as_caco3"), 15);
  assert.equal(app.engine.get("water.calcium_floor_ppm"), 50);
  assert.equal(app.waterSummary.mode, "OPTIMIZE");
  assert.equal(app.waterSummary.checkedPins.length, 6);
  assert.equal(app.waterTargetLocked, false);

  app.selectWaterTarget("hoppy-ipa");
  app.compute();
  assert.equal(target("sulfate_so4"), 250);
  assert.equal(target("chloride_cl"), 50);
  for (const ion of ["calcium_ca", "magnesium_mg", "sodium_na", "alkalinity_as_caco3"]) {
    assert.equal(Number.isFinite(target(ion)), false, `${ion} must not survive the profile switch`);
  }
  assert.equal(app.engine.get("water.calcium_floor_ppm"), 50);
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

test("target changes recalculate immediately and queue a save", () => {
  const app = createStepApp();
  app.boot();
  let saves = 0;
  app.onChange = () => {
    saves += 1;
  };

  app.selectWaterTarget("soft-pilsner");
  assert.equal(app.waterSummary.mode, "OPTIMIZE");
  assert.equal(saves, 1, "selecting a preset schedules the solve and the save");

  app.toggleWaterTarget("ca");
  const cleared = app.waterSummary.ions.find((row) => row.ion === "calcium_ca");
  assert.equal(app.master.getRoot("water.target.calcium_ca"), undefined);
  assert.equal(app.master.getRoot("water.target_profile_id"), "");
  assert.equal(cleared.checked, false);
  assert.equal(cleared.valueText, "(Auto)");
  assert.equal(cleared.deltaText, "—");
  assert.equal(app.waterSummary.checkedPins.length, 5);
  assert.equal(app.waterSummary.mode, "CUSTOM");
  assert.equal(saves, 2, "unchecking recalculates and queues a save");

  app.editWaterTarget("so4", "300");
  const edited = app.waterSummary.ions.find((row) => row.ion === "sulfate_so4");
  assert.equal(edited.valueText, "300.0");
  assert.notEqual(edited.deltaText, "—");
  assert.equal(saves, 3, "editing a target recalculates and queues a save");
});

test("source ions render only in the comparison grid", async () => {
  const app = createStepApp();
  app.boot();
  await loadWaterSource(app, {
    report_id: "25138",
    laboratory: "Ward Labs",
    calcium_ca: 40,
    magnesium_mg: 8,
    sodium_na: 20,
    sulfate_so4: 30,
    chloride_cl: 25,
    total_alkalinity_caco3: 80,
  });
  app.compute();

  const ids = app.fieldsBySlice.water.map((f) => f.id);
  for (const { ion } of WATER_IONS) {
    assert.ok(!ids.includes(`water.source_report.${ion}`), `${ion} readout must be gone`);
  }
  assert.equal(app.waterPlan.source.id, "water.source");
  assert.equal(app.waterPlan.target.id, "water.target_profile_id");
  assert.equal(app.waterPlan.mashPh.id, "water.target_mash_ph");
  assert.equal(app.waterTreatmentFields.length, 5);
  const rows = Object.fromEntries(app.waterSummary.ions.map((row) => [row.ion, row]));
  assert.equal(rows.calcium_ca.sourceText, "40.0");
  assert.equal(rows.magnesium_mg.sourceText, "8.0");
});

test("water readouts use the fixed precision policy", async () => {
  const app = createStepApp();
  app.boot();
  await loadWaterSource(app, {
    report_id: "25138",
    laboratory: "Ward Labs",
    calcium_ca: 40,
    magnesium_mg: 8,
    sodium_na: 20,
    sulfate_so4: 30,
    chloride_cl: 25,
    total_alkalinity_caco3: 80,
  });
  app.selectWaterTarget("hoppy-ipa");
  app.compute();

  const rows = Object.fromEntries(app.waterSummary.ions.map((row) => [row.ion, row]));
  assert.equal(rows.sulfate_so4.valueText, "250.0");
  assert.equal(rows.sulfate_so4.deltaText, "-150.0");
  assert.equal(rows.chloride_cl.postDoseText, "50.0");
  assert.equal(app.waterVerdict.predictedPh, "5.40");
  assert.equal(app.waterPrescription.mash[0].text, "2.0 g");
  assert.equal(app.waterPrescription.doseVolumeText, "16.0 L");
});

test("prescription suppresses doses that round to zero", () => {
  const app = createStepApp();
  app.boot();

  assert.equal(app.waterPrescription.suppressed, true);
  assert.ok(app.waterPrescription.mash.length > 0);
  assert.equal(
    app.waterPrescription.mash.some((dose) => dose.text.startsWith("0.0")),
    false
  );
  assert.equal(app.waterPrescription.sparge.length, 1);
  assert.equal(app.waterPrescription.spargeAcidPrescribed, false);
});

test("telemetry severity drives the warning count and keeps the full log in details", () => {
  const app = createStepApp();
  app.boot();
  app.boundaryExtras["solver.water"] = {
    telemetry: [
      { severity: "WARNING", code: "w", message: "warning message" },
      { severity: "ERROR", code: "e", message: "error message" },
      { severity: "INFO", code: "i", message: "info message" },
    ],
  };
  app.compute();

  assert.equal(app.waterWarningCount, 2);
  assert.equal(app.waterSummary.warningLabel, "2 warnings");
  assert.equal(app.waterDetails.telemetry.length, 3);
});

test("five and six checked are allowed and warned", () => {
  const app = createStepApp();
  app.boot();
  app.selectWaterTarget("freeform");
  for (const pin of ["ca", "mg", "na", "so4"]) {
    app.toggleWaterTarget(pin);
    app.editWaterTarget(pin, "100");
  }
  app.compute();
  assert.equal(app.waterSummary.mode, "CUSTOM");
  assert.equal(app.waterSummary.targetWarning, "");

  app.toggleWaterTarget("cl");
  app.editWaterTarget("cl", "100");
  app.compute();
  assert.equal(app.waterSummary.mode, "CUSTOM");
  assert.match(app.waterSummary.targetLine, /exactly determined, may be infeasible/);
  assert.match(app.waterSummary.targetWarning, /5 targets/);
  assert.match(app.waterSummary.targetWarning, /may fail/);

  app.toggleWaterTarget("alk");
  app.editWaterTarget("alk", "80");
  app.compute();
  assert.equal(app.waterSummary.mode, "OPTIMIZE");
  assert.match(app.waterSummary.targetLine, /best fit, nothing held exactly/);
  assert.match(app.waterSummary.targetWarning, /best fit, not exact/);
  assert.match(app.waterSummary.targetWarning, /guarantees no individual target/);
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
