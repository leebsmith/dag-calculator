import test from "node:test";
import assert from "node:assert/strict";

import { createTestApp, withFreshApp } from "./appHelpers.js";

test("boil hops: parts normalize to IBU shares and mass back-calculates", withFreshApp((app) => {
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
}));

test("boil hops: parts renormalize when an addition is removed", withFreshApp((app) => {
  app.openHopEditor();
  app.addCatalogHop("cascade");
  app.addCatalogHop("citra");
  app.removeHop(0);
  app.saveHopEditor();
  app.compute();

  assert.equal(app.hopRows.length, 1);
  assert.ok(Math.abs(app.hopRows[0].pct - 1) < 1e-9);
}));

test("the hop mass unit seeds from the saved mass preference", withFreshApp((app) => {
  assert.equal(app.hopMassUnit, "g");
}));

test("hop mass unit cycles and changes the readout", withFreshApp((app) => {
  app.openHopEditor();
  app.addCatalogHop("cascade");
  app.saveHopEditor();
  app.compute();

  assert.equal(app.hopMassUnit, "g");
  assert.match(app.hopMass(app.hopRows[0]), /g$/);

  app.toggleHopMassUnit(); // lb
  assert.equal(app.hopMassUnit, "lb");
  assert.match(app.hopMass(app.hopRows[0]), /lb$/);

  app.toggleHopMassUnit(); // kg
  app.toggleHopMassUnit(); // oz
  app.toggleHopMassUnit(); // back to g
  assert.equal(app.hopMassUnit, "g");
}));

test("one hop mass pill follows the master until overridden", withFreshApp((app) => {
  app.setTargetIbu(40);
  app.setWhirlpoolFraction(0.25);

  app.openHopEditor();
  app.addCatalogHop("cascade");
  app.saveHopEditor();

  app.openWhirlpoolHopEditor();
  app.addCatalogWhirlpoolHop("citra");
  app.saveWhirlpoolHopEditor();
  app.compute();

  app.setUnit("mass", "kg");
  assert.equal(app.hopMassUnit, "kg");
  assert.match(app.hopMass(app.hopRows[0]), /kg$/);
  assert.match(app.whirlpoolHopMass(app.whirlpoolHopRows[0]), /kg$/);
  assert.match(app.boilHopTotalMassDisplay, /kg$/);
  assert.match(app.whirlpoolHopTotalMassDisplay, /kg$/);

  app.toggleHopMassUnit(); // kg -> oz override
  assert.equal(app.hopMassUnit, "oz");
  assert.match(app.hopMass(app.hopRows[0]), /oz$/);
  assert.match(app.whirlpoolHopMass(app.whirlpoolHopRows[0]), /oz$/);

  app.setUnit("mass", "lb");
  assert.equal(app.hopMassUnit, "oz"); // the override survives a master change
}));

test("whirlpool hops: parts normalize to IBU shares and mass back-calculates", withFreshApp((app) => {
  app.setTargetIbu(40);
  app.setWhirlpoolFraction(0.25);

  app.openWhirlpoolHopEditor();
  app.addCatalogWhirlpoolHop("cascade");
  app.addCatalogWhirlpoolHop("citra");
  app.saveWhirlpoolHopEditor();
  app.compute();

  assert.equal(app.whirlpoolHopRows.length, 2);
  for (const row of app.whirlpoolHopRows) {
    assert.ok(Math.abs(row.pct - 0.5) < 1e-9, `pct=${row.pct}`);
    assert.ok(Math.abs(row.ibu - 5) < 1e-9, `ibu=${row.ibu}`);
    assert.equal(row.minutes, 30);
    assert.equal(row.initial_temp_c, 95);
    assert.ok(typeof row.mass_kg === "number" && row.mass_kg > 0, `mass=${row.mass_kg}`);
  }

  const cascade = app.whirlpoolHopRows.find((r) => r.hop_id === "cascade");
  const citra = app.whirlpoolHopRows.find((r) => r.hop_id === "citra");
  assert.ok(cascade.mass_kg > citra.mass_kg);
  assert.match(app.whirlpoolHopTotalMassDisplay, /(oz|g|kg|lb)/);
}));

test("whirlpool hops: lupulin defaults, band selector, and the cool-flowable warning", withFreshApp((app) => {
  app.setTargetIbu(40);
  app.setWhirlpoolFraction(0.25);

  app.openWhirlpoolHopEditor();
  app.setWhirlpoolHopCatalogForm("lupulin_pellet");
  app.addCatalogWhirlpoolHop("cryo-cascade");
  app.inspectWhirlpoolHopRow(0);

  assert.equal(app.whirlpoolHopActiveRow.product_form, "lupulin_pellet");
  assert.equal(app.whirlpoolHopActiveRow.initial_temp_c, 76);
  assert.equal(app.whirlpoolHopActiveRow.duration_min, 25);
  assert.equal(app.whirlpoolHopActiveRow.t90_replacement_ratio, 2);
  assert.equal(app.whirlpoolStartBandValue, "custom");

  app.setWhirlpoolStartBand("isomerization_floor");
  assert.equal(app.whirlpoolHopActiveRow.initial_temp_c, 77.5);
  assert.equal(app.whirlpoolStartBandValue, "isomerization_floor");
  assert.match(app.whirlpoolStartBandHint, /isomerization/i);

  app.saveWhirlpoolHopEditor();
  app.compute();
  assert.equal(app.whirlpoolHopRows[0].product_form, "lupulin_pellet");
  assert.equal(app.whirlpoolHopTemperatureWarning, "");

  app.openWhirlpoolHopEditor();
  app.setWhirlpoolHopCatalogForm("flowable_extract");
  app.addCatalogWhirlpoolHop("dynaboost-centennial");
  app.inspectWhirlpoolHopRow(app.draftRows.length - 1);
  app.setWhirlpoolStartBand("isomerization_floor");
  app.saveWhirlpoolHopEditor();
  app.compute();

  assert.match(app.whirlpoolHopTemperatureWarning, /disperses poorly/);
  assert.match(app.whirlpoolHopTemperatureWarning, /0\.8[0-9]/);

  // The catalog form is card-local state the reset does not clear.
  app.setWhirlpoolHopCatalogForm("t90_pellet");
}));

test("whirlpool hops: a colder later charge shows the inferred chill and a zero rest is a note", withFreshApp((app) => {
  app.setTargetIbu(40);
  app.setWhirlpoolFraction(0.25);

  app.openWhirlpoolHopEditor();
  app.setWhirlpoolHopCatalogForm("lupulin_pellet");
  app.addCatalogWhirlpoolHop("cryo-cascade");
  app.inspectWhirlpoolHopRow(0);
  app.patchDraftRow(0, { duration_min: 30, initial_temp_c: 99 });
  app.addCatalogWhirlpoolHop("cryo-citra");
  app.inspectWhirlpoolHopRow(1);
  app.patchDraftRow(1, { duration_min: 20, initial_temp_c: 76.7 });
  app.saveWhirlpoolHopEditor();
  app.compute();

  assert.equal(app.whirlpoolHopRows.length, 2);
  assert.match(app.whirlpoolInferredChills[0], /Chill inferred at 10\.0 min/);
  assert.equal(app.whirlpoolZeroRestNote, "");

  app.openWhirlpoolHopEditor();
  app.patchDraftRow(1, { duration_min: 0 });
  app.saveWhirlpoolHopEditor();
  app.compute();

  assert.equal(app.whirlpoolHopRows[1].mass_kg, null);
  assert.match(app.whirlpoolZeroRestNote, /0-minute charge/);

  app.setWhirlpoolHopCatalogForm("t90_pellet");
}));

test("whirlpool hops: rest duration and initial temperature drive the mass", withFreshApp((app) => {
  app.setTargetIbu(40);
  app.setWhirlpoolFraction(0.25);
  app.openWhirlpoolHopEditor();
  app.addCatalogWhirlpoolHop("cascade");
  app.editDraftCell(0, "duration_min", 30);
  app.editDraftCell(0, "initial_temp_c", 99);
  app.saveWhirlpoolHopEditor();
  app.compute();
  const hotLong = app.whirlpoolHopRows[0].mass_kg;

  app.openWhirlpoolHopEditor();
  app.editDraftCell(0, "duration_min", 15);
  app.editDraftCell(0, "initial_temp_c", 80);
  app.saveWhirlpoolHopEditor();
  app.compute();
  const coolShort = app.whirlpoolHopRows[0].mass_kg;

  assert.ok(coolShort > hotLong, `${coolShort} should exceed ${hotLong}`);
}));

test("whirlpool flowable extract uses CoA alpha, grams, and the hot scalar", withFreshApp((app) => {
  app.setTargetIbu(40);
  app.setWhirlpoolFraction(0.25);
  app.openWhirlpoolHopEditor();
  app.addCatalogWhirlpoolHop("cascade");
  app.patchDraftRow(0, { product_form: "flowable_extract", alpha_acid_pct: 0.45 });
  app.saveWhirlpoolHopEditor();
  app.compute();

  const extract = app.whirlpoolHopRows[0];
  assert.equal(extract.product_form, "flowable_extract");
  assert.match(app.hopForm(extract), /extract/i);
  assert.equal(app.hopMassUnit, "g");
  assert.match(app.whirlpoolHopMass(extract), /g$/);
  assert.equal(extract.ibu, 10);
  assert.ok(extract.mass_kg > 0);

  app.openWhirlpoolHopEditor();
  app.patchDraftRow(0, { product_form: "t90_pellet" });
  app.saveWhirlpoolHopEditor();
  app.compute();
  const pellet = app.whirlpoolHopRows[0];
  assert.ok(extract.mass_kg < pellet.mass_kg, "extract needs less mass at the same alpha");
  assert.ok(Math.abs(pellet.mass_kg / extract.mass_kg - 1.15) < 1e-9);
}));

// The catalog form this case leaves set is card-local state, which a reset does
// not clear, so it keeps its own boot.
test("whirlpool catalog switches to products and copies form, alpha, and ratio", () => {
  const app = createTestApp();
  app.boot();
  app.setTargetIbu(40);
  app.setWhirlpoolFraction(0.5);
  app.compute();

  app.openWhirlpoolHopEditor();
  app.openWhirlpoolHopSearch();
  app.setWhirlpoolHopCatalogForm("flowable_extract");
  assert.ok(app.whirlpoolHopCatalog.some((item) => item.id === "dynaboost-citra"));
  assert.ok(app.whirlpoolHopCatalog.some((item) => item.id === "incognito-citra"));
  app.addCatalogWhirlpoolHop("dynaboost-citra");
  app.saveWhirlpoolHopEditor();
  app.compute();

  const row = app.whirlpoolHopRows[0];
  assert.equal(row.name, "DynaBoost Citra");
  assert.equal(row.product_form, "flowable_extract");
  assert.equal(row.alpha_acid_pct, 0.425);
  assert.equal(row.t90_replacement_ratio, 10);
  assert.match(app.whirlpoolHopMass(row), /g$/);
});

// The inspector this case leaves open is card-local state, which a reset does not
// clear, so it keeps its own boot.
test("inspector shows the T-90 equivalent only when the row carries a ratio", () => {
  const app = createTestApp();
  app.boot();
  app.setTargetIbu(40);
  app.setWhirlpoolFraction(0.5);
  app.compute();

  app.openWhirlpoolHopEditor();
  app.openWhirlpoolHopSearch();
  app.setWhirlpoolHopCatalogForm("flowable_extract");
  app.addCatalogWhirlpoolHop("dynaboost-citra");
  app.saveWhirlpoolHopEditor();
  app.openWhirlpoolHopEditor();
  app.inspectWhirlpoolHopRow(0);
  assert.match(app.whirlpoolHopT90Equivalent, /T-90 equivalent \(1:10\)/);

  app.openWhirlpoolHopSearch();
  app.setWhirlpoolHopCatalogForm("flowable_extract");
  app.addCatalogWhirlpoolHop("flowable-co2-extract-generic");
  app.saveWhirlpoolHopEditor();
  app.openWhirlpoolHopEditor();
  app.inspectWhirlpoolHopRow(1);
  assert.match(app.whirlpoolHopT90Equivalent, /T-90 equivalent \(1:8\)/);

  app.openWhirlpoolHopSearch();
  app.setWhirlpoolHopCatalogForm("t90_pellet");
  app.addCatalogWhirlpoolHop("cascade");
  app.saveWhirlpoolHopEditor();
  app.openWhirlpoolHopEditor();
  app.inspectWhirlpoolHopRow(2);
  assert.equal(app.whirlpoolHopT90Equivalent, "");
});

test("flowable extract doses above the 4 g/gal ceiling warn", withFreshApp((app) => {
  app.setTargetIbu(100);
  app.setWhirlpoolFraction(1);
  app.openWhirlpoolHopEditor();
  app.addCatalogWhirlpoolHop("cascade");
  app.patchDraftRow(0, { product_form: "flowable_extract", alpha_acid_pct: 0.45 });
  app.saveWhirlpoolHopEditor();
  app.compute();

  assert.match(app.whirlpoolHopDoseWarning, /4 g\/gal/);
}));

test("whirlpool ambient follows the global temperature unit", withFreshApp((app) => {
  app.setUnit("temperature", "degF");

  assert.equal(app.whirlpoolAmbientField.unit, "°F");
  assert.equal(app.whirlpoolAmbientField.display, "68");

  app.edit(app.whirlpoolAmbientField, "77");
  assert.equal(app.master.getRoot("batch.whirlpool_ambient_temp_c"), 25);
}));

test("whirlpool cooling time constant changes the required mass", withFreshApp((app) => {
  app.setTargetIbu(40);
  app.setWhirlpoolFraction(0.25);
  app.openWhirlpoolHopEditor();
  app.addCatalogWhirlpoolHop("cascade");
  app.saveWhirlpoolHopEditor();
  app.compute();
  const slowCoolingMass = app.whirlpoolHopRows[0].mass_kg;

  app.edit(app.whirlpoolCoolingField, "60");
  app.compute();
  const fastCoolingMass = app.whirlpoolHopRows[0].mass_kg;

  assert.ok(fastCoolingMass > slowCoolingMass, `${fastCoolingMass} should exceed ${slowCoolingMass}`);
}));

test("total hop mass includes boil and whirlpool additions", withFreshApp((app) => {
  app.setTargetIbu(40);
  app.setWhirlpoolFraction(0.25);
  app.openHopEditor();
  app.addCatalogHop("cascade");
  app.saveHopEditor();
  app.openWhirlpoolHopEditor();
  app.addCatalogWhirlpoolHop("citra");
  app.saveWhirlpoolHopEditor();
  app.compute();

  assert.equal(app.hopRows.length, 1);
  assert.equal(app.whirlpoolHopRows.length, 1);
  assert.ok(app.hopTotalMassKg > app.hopRows[0].mass_kg);
  assert.ok(app.hopTotalMassKg > app.whirlpoolHopRows[0].mass_kg);
}));

test("http: the hop boundary rows merge into the card", async () => {
  const calls = [];
  const batch = {
    sg_post_boil: 1.055,
    v_pre_boil: 24.0,
    s_post_boil_target: 2.6,
    m_grist: 4.7,
    cascade: {
      v_strike: 14.0,
      v_run1: 10.0,
      v_run2: 14.0,
      v_sparge: 14.0,
      s_run1: 2.0,
      s_run2: 0.6,
      sg_pre_boil: 1.048,
      v_post_boil: 21.0,
      mash_thickness_l_per_kg: 3.0,
    },
    max_achievable_abv: 10.0,
    real_attenuation: 0.76,
    apparent_attenuation: 0.75,
    hlt: { v_hlt_debt: 1.0, v_hlt_after_strike: 16.0, v_hlt_top_up: 0.0, v_sparge_deliverable: 15.0 },
    mash_thickness_l_per_kg: 3.0,
  };
  const water = {
    strategy: "CALCIUM_FLOOR",
    prescription: { predicted_mash_ph: 5.4, mash_ph_status: "OPTIMAL", residual_hlt_water_l: 0.0 },
  };
  const hops = {
    boil_rows: [{ minutes: 60.0, ibu: 40.0, mass_kg: 0.02 }],
    whirlpool_rows: [],
    boil_mass_kg: 0.02,
    whirlpool_mass_kg: 0.0,
    total_mass_kg: 0.02,
  };
  const fetchImpl = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    const body = url === "/solve/batch" ? batch : url === "/solve/water" ? water : hops;
    return { ok: true, status: 200, json: async () => body };
  };
  const app = createTestApp({ useHttp: true, fetchImpl });
  await app.loadState({
    roots: { "batch.target_ibu": 40, "batch.whirlpool_ibu_fraction": 0 },
    collections: {
      "batch.boil_hops": [
        {
          hop_id: "cascade",
          name: "Cascade",
          alpha_acid_pct: 0.06,
          boil_time_fraction: 1,
          parts: 10,
          pct: 1,
        },
      ],
    },
  });
  await app.solveNow();

  assert.ok(calls.some((call) => call.url === "/solve/hops"));
  assert.equal(app.hopRows[0].mass_kg, 0.02);
  assert.equal(app.hopRows[0].minutes, 60);
  assert.equal(app.hopRows[0].ibu, 40);
});
