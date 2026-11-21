import test from "node:test";
import assert from "node:assert/strict";

import { createTestApp, withFreshApp } from "./appHelpers.js";
import { BOUNDARY_DOUBLE } from "../fixtures/boundaryDouble.js";
import { ionDelta } from "../../frontend/src/views/waterLogic.js";
import { WATER_IONS } from "../../frontend/src/views/registry/water.js";

async function loadWaterSource(app, source) {
  const identity = { ...app.engine.identity, "water.source": source };
  await app.loadState({ identity, roots: {}, collections: {}, selections: {} });
  app.compute();
}

test("kettle blend nodes reduce to the treated vector and the helper weights volumes", withFreshApp((app) => {
  app.compute();

  // The kettle blends the corrected (post-dose) vectors, not the salts-only ones.
  assert.equal(app.engine.get("water.kettle_blend.calcium_ca"), 60);
  assert.ok(
    Math.abs(
      app.engine.get("water.kettle_blend.alkalinity_as_caco3") -
        app.engine.call("blend_ion", [34, 12, 10, 14, 14])
    ) < 1e-9
  );
  for (const { ion } of WATER_IONS) {
    assert.equal(typeof app.engine.get(`water.kettle_blend.${ion}`), "number");
  }
  assert.equal(app.engine.call("blend_ion", [100, 0, 10, 0, 10]), 50);
  assert.equal(app.engine.call("blend_ion", [10, 10, 0, 0, 0]), null);
}));

test("kettle and target sulfate:chloride ratios come from the artifact", withFreshApp((app) => {
  app.compute();

  assert.ok(Math.abs(app.engine.get("water.kettle_blend.sulfate_chloride_ratio") - 2) < 1e-9);

  app.setRoot("water.target.sulfate_so4", 100);
  app.setRoot("water.target.chloride_cl", 50);
  app.compute();
  assert.ok(Math.abs(app.engine.get("water.target.sulfate_chloride_ratio") - 2) < 1e-9);

  app.setRoot("water.target.chloride_cl", 0);
  app.compute();
  assert.equal(app.engine.get("water.target.sulfate_chloride_ratio"), null);
}));

test("ionDelta is null when either side is missing", () => {
  assert.equal(ionDelta(10, 6), 4);
  assert.equal(ionDelta(null, 6), null);
  assert.equal(ionDelta(10, undefined), null);
});

test("the water summary and brew-day instruction branch on the mode", withFreshApp((app) => {
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
}));

test("the checked set drives the grid and the derived strategy", withFreshApp((app) => {
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
  assert.equal(rows.sulfate_so4.status, "Held");
  assert.equal(rows.sulfate_so4.valueText, "250.0");
  assert.equal(rows.sulfate_so4.deltaText, "-150.0");
  assert.equal(rows.chloride_cl.valueText, "50.0");

  for (const ion of ["calcium_ca", "magnesium_mg", "sodium_na", "alkalinity_as_caco3"]) {
    assert.equal(rows[ion].checked, false);
    assert.equal(rows[ion].status, "Floated");
    assert.equal(rows[ion].valueText, "(none)");
    assert.equal(rows[ion].deltaText, "—");
  }
}));

test("checking an ion seeds a value from the water source", async () => {
  const app = createTestApp();
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

test("clearing a checked ion's value unchecks it", withFreshApp((app) => {
  app.selectWaterTarget("freeform");
  app.toggleWaterTarget("so4");
  app.compute();

  app.editWaterTarget("so4", "");
  app.compute();

  const row = app.waterSummary.ions.find((r) => r.ion === "sulfate_so4");
  assert.equal(row.checked, false);
  assert.equal(app.master.getRoot("water.target.sulfate_so4"), undefined);
  assert.deepEqual(app.waterSummary.checkedPins, []);
}));

test("legacy values without a checked set do not invent objectives", async () => {
  const app = createTestApp();
  await app.boot();
  await app.loadState({
    roots: {
      "water.target.sulfate_so4": 120,
      "water.target.alkalinity_as_caco3": 60,
    },
  });
  app.compute();
  assert.deepEqual(app.waterSummary.checkedPins, []);
  assert.equal(app.waterTargetSelection, "none");
  assert.equal(app.waterSummary.mode, "BASELINE");
});

test("a pristine batch floats calcium and states the pH objective", withFreshApp((app) => {
  app.compute();
  const ca = app.waterSummary.ions.find((row) => row.ion === "calcium_ca");
  assert.equal(ca.checked, false);
  assert.equal(ca.valueText, "(none)");
  assert.equal(ca.status, "Floated");
  assert.equal(app.waterPlan.floor.display, "50");
  assert.equal(app.waterPlan.ceiling.display, "150");
  assert.match(app.waterPlan.floorNotice, /no ion objectives are held/);
  assert.match(app.waterVerdict.phLine, /→/);
}));

test("the calcium band exposes both ends and commits the ceiling", withFreshApp((app) => {
  assert.equal(app.waterPlan.floor.id, "water.calcium_floor_ppm");
  assert.equal(app.waterPlan.ceiling.id, "water.calcium_ceiling_ppm");

  app.editWaterNumber("ceiling", app.waterPlan.ceiling, "115");
  app.commitWaterNumber("ceiling", app.waterPlan.ceiling);
  app.compute();

  assert.equal(app.waterPlan.ceiling.display, "115");
  assert.equal(app.engine.get("water.calcium_ceiling_ppm"), 115);
}));

test("the band shows a seed badge while both ends inherit", withFreshApp((app) => {
  app.compute();

  for (const bound of ["floor", "ceiling"]) {
    assert.equal(app.waterPlan.provenance[bound].showSeed, true, bound);
    assert.equal(app.waterPlan.provenance[bound].showReset, false, bound);
  }
  assert.equal(app.waterPlan.provenance.mashPh.showSeed, false);
  assert.equal(app.waterPlan.provenance.mashPh.showReset, false);
}));

test("an authored ceiling offers a reset back to the profile", withFreshApp((app) => {
  app.editWaterNumber("ceiling", app.waterPlan.ceiling, "115");
  app.commitWaterNumber("ceiling", app.waterPlan.ceiling);
  app.compute();

  assert.equal(app.waterPlan.provenance.ceiling.showSeed, false);
  assert.equal(app.waterPlan.provenance.ceiling.showReset, true);

  app.resetWaterField(app.waterPlan.ceiling);
  app.compute();

  assert.equal(app.engine.hasRoot("water.calcium_ceiling_ppm"), false);
  assert.equal(app.waterPlan.ceiling.display, "150");
  assert.equal(app.waterPlan.provenance.ceiling.showSeed, true);
}));

test("an authored mash pH resets to its constant default", withFreshApp((app) => {
  app.editWaterNumber("mashph", app.waterPlan.mashPh, "5.2");
  app.commitWaterNumber("mashph", app.waterPlan.mashPh);
  app.compute();

  assert.equal(app.waterPlan.provenance.mashPh.showSeed, false);
  assert.equal(app.waterPlan.provenance.mashPh.showReset, true);
  assert.equal(app.waterPlan.provenance.mashPh.resetTitle, "Reset to the default value");

  app.resetWaterField(app.waterPlan.mashPh);
  app.compute();

  assert.equal(app.engine.hasRoot("water.target_mash_ph"), false);
  assert.equal(app.waterPlan.mashPh.display, "5.4");
  assert.equal(app.waterPlan.provenance.mashPh.showReset, false);
}));

test("clearing every objective also clears the calcium ceiling", withFreshApp((app) => {
  app.setRoot("water.calcium_ceiling_ppm", 120);
  app.setRoot("water.calcium_floor_ppm", 60);
  app.compute();

  app.resetWaterTargets();
  app.compute();

  assert.equal(app.engine.hasRoot("water.calcium_ceiling_ppm"), false);
  assert.equal(app.engine.hasRoot("water.calcium_floor_ppm"), false);
  assert.equal(app.waterPlan.ceiling.display, "150");
}));

test("checking an ion on a preset keeps the other checked values", withFreshApp((app) => {
  app.selectWaterTarget("malty-amber");
  app.editWaterTarget("alk", "90");
  app.toggleWaterTarget("ca");
  app.compute();

  assert.deepEqual(app.waterSummary.checkedPins, ["so4", "cl", "alk", "ca"]);
  assert.equal(app.master.getRoot("water.target.sulfate_so4"), 50);
  assert.equal(app.master.getRoot("water.target.chloride_cl"), 120);
  assert.equal(app.master.getRoot("water.target.alkalinity_as_caco3"), 90);
  assert.equal(app.engine.get("water.target.sulfate_so4"), 50);
  assert.equal(app.engine.get("water.target.chloride_cl"), 120);
  assert.equal(app.master.getRoot("water.target_profile_id"), "");
}));

test("a failed solve keeps the messages that preceded it", async () => {
  const failure = {
    code: "ION_TARGET_BELOW_SOURCE",
    message: "Target below source for SO4 50.0 ppm against a source of 60.0 ppm.",
    details: {},
    messages: [
      {
        code: "GUARDRAIL_CALCIUM_FLOOR_OVERRIDDEN",
        category: "GUARDRAIL",
        severity: "WARNING",
        message: "floor overridden",
        context: {},
      },
      {
        code: "ION_TARGET_BELOW_SOURCE",
        category: "VALIDATION",
        severity: "ERROR",
        message: "Target below source for SO4 50.0 ppm against a source of 60.0 ppm.",
        context: {},
      },
    ],
  };
  const fetchImpl = async (url, options) => {
    if (url.includes("water")) {
      return { ok: false, status: 422, json: async () => failure };
    }
    const body = JSON.parse(options.body);
    const data = url.includes("batch")
      ? BOUNDARY_DOUBLE.batch_sparge_solver(body)
      : BOUNDARY_DOUBLE.hop_bitterness_solver(body);
    return { ok: true, status: 200, json: async () => data };
  };
  const app = createTestApp({ remote: true, fetchImpl });
  await app.boot();

  assert.equal(app.boundaryError.code, "ION_TARGET_BELOW_SOURCE");
  assert.deepEqual(
    app.waterDetails.telemetry.map((entry) => entry.code),
    ["ION_TARGET_BELOW_SOURCE", "GUARDRAIL_CALCIUM_FLOOR_OVERRIDDEN"]
  );
  assert.equal(app.waterWarningCount, 1);
});

test("an unreachable mash pH objective is reported, not approximated", withFreshApp((app) => {
  app.compute();
  app.boundaryExtras["solver.water"] = {
    telemetry: [
      {
        code: "TARGET_MASH_PH_UNREACHABLE",
        category: "ENZYMATIC",
        severity: "WARNING",
        message: "Target 6.5 is above the model ceiling.",
        context: {},
      },
    ],
    warnings: ["Target 6.5 is above the model ceiling."],
    notes: [],
  };
  app.compute();

  assert.equal(app.waterVerdict.status, "High");
  assert.match(app.waterVerdict.phLine, /6\.00/);
  assert.equal(app.waterWarningCount, 1);
  assert.equal(app.waterDetails.telemetry[0].code, "TARGET_MASH_PH_UNREACHABLE");
}, {
  boundaries: {
    ...BOUNDARY_DOUBLE,
    water_chemistry_solver: (inputs) => ({
      ...BOUNDARY_DOUBLE.water_chemistry_solver(inputs),
      "prescription.mash_ph_status": "HIGH",
      "prescription.predicted_mash_ph": 6.0,
    }),
  },
}));

test("an emptied objective set reloads with one name and keeps the floor", async () => {
  const app = createTestApp();
  await app.boot();
  app.selectWaterTarget("malty-amber");
  app.compute();
  for (const pin of [...app.waterSummary.checkedPins]) app.toggleWaterTarget(pin);
  app.editWaterNumber("floor", app.waterPlan.floor, "35");
  app.commitWaterNumber("floor", app.waterPlan.floor);
  app.compute();
  assert.equal(app.waterTargetSelection, "none");

  const state = app.draftState();
  const app2 = createTestApp();
  await app2.boot();
  await app2.loadState(state);
  app2.compute();

  assert.equal(app2.waterTargetSelection, "none");
  assert.equal(app2.waterPlan.floor.display, "35");
  assert.deepEqual(app2.waterSummary.checkedPins, []);
  assert.equal(app2.waterSummary.mode, "BASELINE");

  app2.toggleWaterTarget("so4");
  app2.compute();
  assert.deepEqual(app2.waterSummary.checkedPins, ["so4"]);
});

test("the kettle follows the HLT vector when the distribution changes", withFreshApp((app) => {
  const row = (a) => a.waterSummary.ions.find((r) => r.ion === "alkalinity_as_caco3");
  app.compute();
  const proportionalKettle = row(app).kettleText;
  const postDose = row(app).postDoseText;

  app.setRoot("water.salt_distribution", "MASH_ONLY");
  app.compute();

  assert.notEqual(row(app).kettleText, proportionalKettle);
  assert.equal(row(app).postDoseText, postDose);
  assert.equal(app.waterSummary.proportional, false);
}, {
  boundaries: {
    ...BOUNDARY_DOUBLE,
    water_chemistry_solver: (inputs) => ({
      ...BOUNDARY_DOUBLE.water_chemistry_solver(inputs),
      "post_dose_hlt_ions.alkalinity_as_caco3":
        inputs.salt_distribution === "MASH_ONLY" ? 78.0 : 34.0,
    }),
  },
}));

test("a minimum above a pinned calcium objective says the objective wins", withFreshApp((app) => {
  app.selectWaterTarget("freeform");
  app.toggleWaterTarget("ca");
  app.editWaterTarget("ca", "60");
  app.compute();
  assert.match(app.waterPlan.floorNotice, /Not used while calcium is an objective/);

  app.editWaterNumber("floor", app.waterPlan.floor, "200");
  app.commitWaterNumber("floor", app.waterPlan.floor);
  app.compute();
  assert.match(app.waterPlan.floorNotice, /objective wins/);
}));

test("a held ion the pH correction moved is labelled pre-correction", withFreshApp((app) => {
  app.selectWaterTarget("freeform");
  for (const pin of ["so4", "cl", "ca", "alk"]) app.toggleWaterTarget(pin);
  app.editWaterTarget("ca", "60");
  app.editWaterTarget("alk", "60");
  app.compute();

  const rows = Object.fromEntries(app.waterSummary.ions.map((row) => [row.ion, row]));
  assert.equal(rows.alkalinity_as_caco3.status, "Held (pre-correction)");
  assert.equal(rows.alkalinity_as_caco3.hint, "moved by the mash-pH correction");
  assert.equal(rows.alkalinity_as_caco3.deltaText, "-26.0");
  assert.equal(rows.calcium_ca.status, "Held");
}));

test("a floated ion moved by the pH correction names its driver", withFreshApp((app) => {
  app.compute();
  const alk = app.waterSummary.ions.find((row) => row.ion === "alkalinity_as_caco3");
  assert.equal(alk.checked, false);
  assert.equal(alk.hint, "moved by the mash-pH correction");
}));

test("a floated ion is not annotated when the correction is zero", withFreshApp((app) => {
  app.compute();
  const alk = app.waterSummary.ions.find((row) => row.ion === "alkalinity_as_caco3");
  assert.equal(alk.hint, "");
}, {
  boundaries: {
    ...BOUNDARY_DOUBLE,
    water_chemistry_solver: (inputs) => ({
      ...BOUNDARY_DOUBLE.water_chemistry_solver(inputs),
      "prescription.predicted_mash_ph": 5.62,
    }),
  },
}));

test("the empty objective set is interactive and reads No objectives", withFreshApp((app) => {
  assert.equal(app.waterTargetSelection, "none");

  app.toggleWaterTarget("so4");
  app.compute();
  assert.deepEqual(app.waterSummary.checkedPins, ["so4"]);
  assert.equal(app.waterTargetSelection, "freeform");

  app.toggleWaterTarget("so4");
  app.compute();
  assert.deepEqual(app.waterSummary.checkedPins, []);
  assert.equal(app.waterTargetSelection, "none");
  assert.equal(app.waterSummary.mode, "BASELINE");
}));

test("presets clear the previous targets, fill their ions and derive the strategy", withFreshApp((app) => {
  const target = (ion) => app.engine.get(`water.target.${ion}`);

  app.selectWaterTarget("soft-pilsner");
  app.compute();
  assert.equal(target("calcium_ca"), 15);
  assert.equal(target("magnesium_mg"), 3);
  assert.equal(target("sodium_na"), 4);
  assert.equal(target("alkalinity_as_caco3"), 15);
  assert.equal(app.engine.get("water.calcium_floor_ppm"), 15);
  assert.equal(app.waterSummary.mode, "OPTIMIZE");
  assert.equal(app.waterSummary.checkedPins.length, 6);
  assert.equal(app.waterTargetSelection, "soft-pilsner");

  app.selectWaterTarget("hoppy-ipa");
  app.compute();
  assert.equal(target("sulfate_so4"), 140);
  assert.equal(target("chloride_cl"), 70);
  for (const ion of ["calcium_ca", "magnesium_mg", "sodium_na", "alkalinity_as_caco3"]) {
    assert.equal(Number.isFinite(target(ion)), false, `${ion} must not survive the profile switch`);
  }
  assert.equal(app.engine.get("water.calcium_floor_ppm"), 50);
  assert.equal(app.waterSummary.mode, "CALCIUM_FLOOR");
  assert.deepEqual(app.waterSummary.checkedPins, ["so4", "cl"]);
  assert.equal(app.master.getRoot("water.target_profile_id"), "hoppy-ipa");

  app.selectWaterTarget("burton-ipa");
  app.compute();
  assert.equal(target("sulfate_so4"), 250);
  assert.equal(target("chloride_cl"), 50);
  assert.equal(app.master.getRoot("water.target_profile_id"), "burton-ipa");
}));

test("toggling a checked ion detaches the preset", withFreshApp((app) => {
  app.selectWaterTarget("hoppy-ipa");
  app.toggleWaterTarget("cl");
  app.compute();

  assert.equal(app.master.getRoot("water.target_profile_id"), "");
  assert.equal(app.waterTargetSelection, "freeform");
  assert.deepEqual(app.waterSummary.checkedPins, ["so4"]);
  assert.equal(app.waterSummary.mode, "CUSTOM");
}));

test("target changes recalculate immediately and queue a save", withFreshApp((app) => {
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
  assert.equal(cleared.valueText, "(none)");
  assert.equal(cleared.deltaText, "—");
  assert.equal(app.waterSummary.checkedPins.length, 5);
  assert.equal(app.waterSummary.mode, "CUSTOM");
  assert.equal(saves, 2, "unchecking recalculates and queues a save");

  app.editWaterTarget("so4", "300");
  const edited = app.waterSummary.ions.find((row) => row.ion === "sulfate_so4");
  assert.equal(edited.valueText, "300.0");
  assert.notEqual(edited.deltaText, "—");
  assert.equal(saves, 3, "editing a target recalculates and queues a save");
}));

test("source ions render only in the comparison grid", async () => {
  const app = createTestApp();
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
  assert.equal(app.waterPlan.source.title, "Ward Labs");
  assert.match(app.waterPlan.source.detail, /report 25138/);
  assert.equal(app.waterPlan.target.id, "water.target_profile_id");
  assert.equal(app.waterPlan.mashPh.id, "water.target_mash_ph");
  assert.equal(app.waterTreatmentFields.length, 5);
  const rows = Object.fromEntries(app.waterSummary.ions.map((row) => [row.ion, row]));
  assert.equal(rows.calcium_ca.sourceText, "40.0");
  assert.equal(rows.magnesium_mg.sourceText, "8.0");
});

test("water readouts use the fixed precision policy", async () => {
  const app = createTestApp();
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
  app.selectWaterTarget("burton-ipa");
  app.compute();

  const rows = Object.fromEntries(app.waterSummary.ions.map((row) => [row.ion, row]));
  assert.equal(rows.sulfate_so4.valueText, "250.0");
  assert.equal(rows.sulfate_so4.deltaText, "-150.0");
  assert.equal(rows.chloride_cl.postDoseText, "50.0");
  assert.equal(app.waterVerdict.predictedPh, "5.40");
  assert.equal(
    app.waterVerdict.phLine,
    "5.62 → 5.40 · grist 88% lactic acid 0.5 mL"
  );
  assert.equal(app.waterPrescription.mash[0].text, "2.0 g");
  assert.equal(app.waterPrescription.doseVolumeText, "16.0 L");
});

test("prescription suppresses doses that round to zero", withFreshApp((app) => {
  assert.equal(app.waterPrescription.suppressed, true);
  assert.ok(app.waterPrescription.mash.length > 0);
  assert.equal(
    app.waterPrescription.mash.some((dose) => dose.text.startsWith("0.0")),
    false
  );
  assert.equal(app.waterPrescription.sparge.length, 1);
  assert.equal(app.waterPrescription.spargeAcidPrescribed, false);
}));

test("telemetry severity drives the warning count and keeps the full log in details", withFreshApp((app) => {
  app.boundaryExtras["solver.water"] = {
    telemetry: [
      { severity: "WARNING", code: "w", message: "warning message" },
      { severity: "ERROR", code: "e", message: "error message" },
      { severity: "INFO", code: "i", message: "info message" },
    ],
  };
  app.compute();

  assert.equal(app.waterWarningCount, 1);
  assert.equal(app.waterSummary.warningLabel, "1 warning");
  assert.equal(app.waterDetails.telemetry.length, 3);
}));

test("five and six checked are allowed and warned", withFreshApp((app) => {
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
  assert.match(app.waterSummary.targetWarning, /5 objectives/);
  assert.match(app.waterSummary.targetWarning, /may fail/);

  app.toggleWaterTarget("alk");
  app.editWaterTarget("alk", "80");
  app.compute();
  assert.equal(app.waterSummary.mode, "OPTIMIZE");
  assert.match(app.waterSummary.targetLine, /best fit, nothing held exactly/);
  assert.match(app.waterSummary.targetWarning, /best fit, not exact/);
  assert.match(app.waterSummary.targetWarning, /no individual objective/);
}));

test("the selector lists constraints first and keeps the pseudo-options at the ends", withFreshApp((app) => {
  app.compute();

  const options = app.waterTargetOptions;
  assert.equal(options[0].value, "none");
  assert.equal(options.at(-1).value, "freeform");
  const labels = Object.fromEntries(options.map((option) => [option.value, option.label]));
  assert.equal(labels["hoppy-ipa"], "SO₄/Cl — Hoppy / IPA");
  assert.equal(labels["burton-ipa"], "SO₄/Cl — Burton-style IPA");
  assert.equal(labels["west-coast-ipa"], "SO₄/Cl — West Coast IPA");
  assert.equal(labels["hazy-ipa"], "SO₄/Cl — Hazy IPA");
  assert.equal(labels["malty-amber"], "SO₄/Cl/Alk — Malty / Amber");
  assert.equal(labels["soft-pilsner"], "All six — Soft Pilsner");

  assert.equal(app.waterTargetSelection, "none");
}));

test("the checklist payload carries the derived water dose", withFreshApp((app) => {
  const rows = app.brewDayPayload.phases.flatMap((phase) =>
    phase.sections.flatMap((section) => section.rows)
  );
  const doughIn = rows.find((row) => row.step_id === "dough-in");
  assert.match(doughIn.text, /dose the dry grist before underletting/i);
}));

test("the prescription names the deliverable surplus, not the treated residual", withFreshApp((app) => {
  app.compute();

  const surplus = app.engine.get("batch.surplus_sparge_capacity");
  assert.equal(surplus, 1);
  assert.equal(app.waterSummary.residualHlt, 0);
  assert.notEqual(app.waterSummary.residualHlt, surplus);

  const note = app.waterSummary.notes.find((line) => line.startsWith("Deliverable surplus:"));
  assert.ok(note, "the surplus note names its basis");
  assert.match(note, /beyond the sparge demand/);
}));

function lactateExpected(app) {
  const acid =
    app.engine.resolve("solver.water.mash_additions.acid_l") +
    app.engine.resolve("solver.water.sparge_additions.acid_l");
  const volume = app.engine.resolve("solver.batch.cascade.v_post_boil");
  return (acid * 1000 * 1056) / volume;
}

test("added lactate is the acid load over the knockout volume", withFreshApp((app) => {
  app.compute();

  const value = app.engine.get("water.added_lactate_ppm");
  assert.ok(Math.abs(value - lactateExpected(app)) < 1e-9);
  assert.ok(value < 400, "the fixture dose is below the sensory threshold");

  const relation = app.relations.find((row) => row.id === "lactate_below_sensory_threshold");
  assert.equal(relation.holds, true);
}));

test("phosphoric acid carries no lactate load", withFreshApp((app) => {
  app.setRoot("water.acid_medium", "PHOSPHORIC_85");
  app.compute();

  assert.equal(app.engine.get("water.added_lactate_ppm"), 0);
  const relation = app.relations.find((row) => row.id === "lactate_below_sensory_threshold");
  assert.equal(relation.holds, true);
}));

test("a high lactic dose warns at the sensory threshold", withFreshApp((app) => {
  app.compute();

  assert.ok(app.engine.get("water.added_lactate_ppm") > 400);
  const finding = app.findings.find((row) => row.id === "lactate_below_sensory_threshold");
  assert.ok(finding, "the acid load is reported");
  assert.equal(finding.severity, "warning");
  assert.match(finding.message, /Added lactate/);
  assert.match(finding.message, /400/);
}, {
  boundaries: {
    ...BOUNDARY_DOUBLE,
    water_chemistry_solver: () => ({
      ...BOUNDARY_DOUBLE.water_chemistry_solver(),
      "mash_additions.acid_l": 0.009,
    }),
  },
}));
