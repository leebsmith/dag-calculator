import test from "node:test";
import assert from "node:assert/strict";

import { createTestApp, withFreshApp } from "./appHelpers.js";
import { BOUNDARY_DOUBLE } from "../fixtures/boundaryDouble.js";
import { CUSTOM_COOLING_CURVE } from "../../frontend/src/adapters/cards/hopsCoolingCurve.js";

test("boil hops: parts normalize to IBU shares and the served mass renders", withFreshApp((app) => {
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
    assert.equal(row.mass_kg, 0.012); // served by the double
  }
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

test("a hop already in the draft stays in the catalogue", withFreshApp((app) => {
  app.openHopEditor();
  app.addCatalogHop("cascade");
  assert.deepEqual(app.hopDraftCounts, { cascade: 1 });
  assert.ok(
    app.hopFilteredCatalog.some((item) => item.id === "cascade"),
    "the drawer still offers the hop, so it can be dosed twice"
  );

  app.addCatalogHop("cascade");
  assert.equal(app.hopDraftCounts.cascade, 2);
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

test("whirlpool hops: parts normalize to IBU shares and the served mass renders", withFreshApp((app) => {
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
    assert.equal(row.mass_kg, 0.012); // served by the double
  }
  assert.match(app.whirlpoolHopTotalMassDisplay, /(oz|g|kg|lb)/);
}));

test("whirlpool hops: the summary sorts by initial temperature", withFreshApp((app) => {
  app.setTargetIbu(40);
  app.setWhirlpoolFraction(0.25);

  app.openWhirlpoolHopEditor();
  app.addCatalogWhirlpoolHop("cascade");
  app.addCatalogWhirlpoolHop("citra");
  app.patchDraftRow(0, { initial_temp_c: 70 });
  app.patchDraftRow(1, { initial_temp_c: 90 });
  app.saveWhirlpoolHopEditor();
  app.compute();

  assert.deepEqual(
    app.whirlpoolHopRows.map((row) => row.initial_temp_c),
    [90, 70]
  );
  assert.deepEqual(
    app.whirlpoolHopRows.map((row) => row.source_index),
    [1, 0]
  );

  app.setHopAlpha("whirlpool", app.whirlpoolHopRows[0].source_index, "11");
  assert.equal(app.engine.get("batch.whirlpool_hops")[1].alpha_acid_pct, 0.11);

  assert.equal(app.whirlpoolCoolingCeiling.length, 31);
  assert.equal(app.whirlpoolCoolingCeiling[0].tempC, 99);
  assert.equal(app.whirlpoolCeilingMinute(app.whirlpoolCoolingCeiling[10]), "10");
  assert.match(app.whirlpoolCeilingTemp(app.whirlpoolCoolingCeiling[0]), /99/);
}));

test("whirlpool hops: the draft table previews a live cooling ceiling", withFreshApp((app) => {
  app.openWhirlpoolHopEditor();
  app.addCatalogWhirlpoolHop("cascade");
  app.patchDraftRow(0, { addition_at_min: 0, initial_temp_c: 99 });
  app.addCatalogWhirlpoolHop("citra");
  app.patchDraftRow(1, { addition_at_min: 10, initial_temp_c: 76.7 });
  app.addCatalogWhirlpoolHop("saaz");
  app.patchDraftRow(2, { addition_at_min: 10, initial_temp_c: 95 });

  const columns = app.draftColumns.map((column) => column.id);
  assert.ok(columns.includes("ceiling_c"));

  const rows = app.draftDisplayRows;
  assert.equal(rows[0].ceiling_c, "99.0");
  assert.equal(rows[1].ceiling_c, "92.1");
  assert.equal(rows[2].ceiling_c, "76.7");
  assert.equal(rows[0].ceiling_above, false);
  assert.equal(rows[1].ceiling_above, false);
  assert.equal(rows[2].ceiling_above, true);
  assert.equal(app.draftRowBadge(rows[2], "ceiling_c")?.text, "above");
}));

test("whirlpool hops: lupulin defaults and the band selector", withFreshApp((app) => {
  app.setTargetIbu(40);
  app.setWhirlpoolFraction(0.25);

  app.openWhirlpoolHopEditor();
  app.setWhirlpoolHopCatalogForm("lupulin_pellet");
  app.addCatalogWhirlpoolHop("cryo-citra");
  app.inspectWhirlpoolHopRow(0);

  assert.equal(app.whirlpoolHopActiveRow.product_form, "lupulin_pellet");
  assert.equal(app.whirlpoolHopActiveRow.initial_temp_c, 76);
  assert.equal(app.whirlpoolHopActiveRow.addition_at_min, 5);
  assert.equal(app.whirlpoolStartBandValue, "custom");

  app.setWhirlpoolStartBand("isomerization_floor");
  assert.equal(app.whirlpoolHopActiveRow.initial_temp_c, 77.5);
  assert.equal(app.whirlpoolStartBandValue, "isomerization_floor");
  assert.match(app.whirlpoolStartBandHint, /isomerization/i);

  app.saveWhirlpoolHopEditor();
  app.compute();
  assert.equal(app.whirlpoolHopRows[0].product_form, "lupulin_pellet");

  // The leaf never restricts the stage; the picker offers all four.
  assert.deepEqual(
    app.whirlpoolHopForms.map((form) => form.value),
    ["whole_cone", "t90_pellet", "lupulin_pellet", "flowable_extract"]
  );

  // The catalog form is card-local state the reset does not clear.
  app.setWhirlpoolHopCatalogForm("t90_pellet");
}));

test("whirlpool hops: a colder later charge shows the served chill and a zero rest is a note", withFreshApp((app) => {
  app.setTargetIbu(40);
  app.setWhirlpoolFraction(0.25);

  app.openWhirlpoolHopEditor();
  app.setWhirlpoolHopCatalogForm("lupulin_pellet");
  app.addCatalogWhirlpoolHop("cryo-citra");
  app.inspectWhirlpoolHopRow(0);
  app.patchDraftRow(0, { addition_at_min: 0, initial_temp_c: 99 });
  app.addCatalogWhirlpoolHop("cryo-citra");
  app.inspectWhirlpoolHopRow(1);
  app.patchDraftRow(1, { addition_at_min: 10, initial_temp_c: 76.7 });
  app.saveWhirlpoolHopEditor();
  app.compute();

  assert.equal(app.whirlpoolHopRows.length, 2);
  assert.match(app.whirlpoolInferredChills[0], /Chill inferred at 10\.0 min/);
  assert.equal(app.whirlpoolZeroRestNote, "");

  app.openWhirlpoolHopEditor();
  app.patchDraftRow(1, { addition_at_min: 30 });
  app.saveWhirlpoolHopEditor();
  app.compute();

  assert.equal(app.whirlpoolHopRows[1].mass_kg, null);
  assert.match(app.whirlpoolZeroRestNote, /0-minute charge/);

  app.setWhirlpoolHopCatalogForm("t90_pellet");
}, {
  boundaries: {
    ...BOUNDARY_DOUBLE,
    hop_bitterness_solver: (inputs = {}) => ({
      ...BOUNDARY_DOUBLE.hop_bitterness_solver(inputs),
      whirlpool_rows: (inputs.whirlpool_hops ?? []).map((row) => {
        const minutes = Math.max(0, (inputs.whirlpool_knockout_min ?? 30) - (row.addition_at_min ?? 0));
        return {
          minutes,
          ibu: (row.pct ?? 0) * (inputs.whirlpool_target_ibu ?? 0),
          mass_kg: minutes === 0 ? null : 0.012,
          effective_minutes: 15,
          alpha_mass_kg: minutes === 0 ? null : 0.0012,
        };
      }),
      whirlpool_chills: [{ at_min: 10, from_temp_c: 92.1, to_temp_c: 76.7 }],
    }),
  },
}));

test("whirlpool hops: rest duration and initial temperature reach the hop request", (() => {
  let request = null;
  return withFreshApp((app) => {
    app.setTargetIbu(40);
    app.setWhirlpoolFraction(0.25);
    app.openWhirlpoolHopEditor();
    app.addCatalogWhirlpoolHop("cascade");
    app.editDraftCell(0, "addition_at_min", 0);
    app.editDraftCell(0, "initial_temp_c", 99);
    app.saveWhirlpoolHopEditor();
    app.compute();

    assert.equal(request.whirlpool_hops[0].addition_at_min, 0);
    assert.equal(request.whirlpool_hops[0].initial_temp_c, 99);

    app.openWhirlpoolHopEditor();
    app.editDraftCell(0, "addition_at_min", 15);
    app.editDraftCell(0, "initial_temp_c", 80);
    app.saveWhirlpoolHopEditor();
    app.compute();

    assert.equal(request.whirlpool_hops[0].addition_at_min, 15);
    assert.equal(request.whirlpool_hops[0].initial_temp_c, 80);
  }, {
    boundaries: {
      ...BOUNDARY_DOUBLE,
      hop_bitterness_solver: (inputs = {}) => {
        request = inputs;
        return BOUNDARY_DOUBLE.hop_bitterness_solver(inputs);
      },
    },
  });
})());

test("whirlpool flowable extract keeps its form, alpha and served mass", withFreshApp((app) => {
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
  assert.equal(extract.mass_kg, 0.012);
}));

// The catalog form this case leaves set is card-local state, which a reset does
// not clear, so it keeps its own boot.
test("whirlpool catalog switches to products and copies form and alpha", () => {
  const app = createTestApp();
  app.boot();
  app.setTargetIbu(40);
  app.setWhirlpoolFraction(0.5);
  app.compute();

  app.openWhirlpoolHopEditor();
  app.openWhirlpoolHopSearch();
  app.setWhirlpoolHopCatalogForm("flowable_extract");
  assert.ok(app.whirlpoolHopCatalog.some((item) => item.id === "dynaboost"));
  assert.ok(app.whirlpoolHopCatalog.some((item) => item.id === "incognito"));
  app.addCatalogWhirlpoolHop("dynaboost");
  app.saveWhirlpoolHopEditor();
  app.compute();

  const row = app.whirlpoolHopRows[0];
  assert.equal(row.name, "DynaBoost");
  assert.equal(row.product_form, "flowable_extract");
  assert.equal(row.alpha_acid_pct, 0.425);
  assert.match(app.whirlpoolHopMass(row), /g$/);
});

test("whole cone renders the null mass until the solver returns one", withFreshApp((app) => {
  app.setTargetIbu(40);
  app.setWhirlpoolFraction(0);
  app.openHopEditor();
  app.addCatalogHop("cascade");
  app.patchDraftRow(0, { product_form: "whole_cone" });
  app.saveHopEditor();
  app.compute();

  assert.equal(app.hopRows[0].product_form, "whole_cone");
  assert.equal(app.hopRows[0].mass_kg, null);

  app.openHopEditor();
  app.patchDraftRow(0, { cone_utilization: 0.85 });
  app.saveHopEditor();
  app.compute();
  assert.equal(app.hopRows[0].mass_kg, 0.012);
}, {
  boundaries: {
    ...BOUNDARY_DOUBLE,
    hop_bitterness_solver: (inputs = {}) => {
      const outputs = BOUNDARY_DOUBLE.hop_bitterness_solver(inputs);
      outputs.boil_rows = outputs.boil_rows.map((row, index) => {
        const source = (inputs.boil_hops ?? [])[index] ?? {};
        if (source.product_form !== "whole_cone") return row;
        const solved = source.cone_utilization != null;
        return { ...row, mass_kg: solved ? 0.012 : null, alpha_mass_kg: solved ? 0.0012 : null };
      });
      return outputs;
    },
  },
}));

test("extract doses above the 4 g/gal ceiling warn on the boil", withFreshApp((app) => {
  app.setTargetIbu(200);
  app.openHopEditor();
  app.addCatalogHop("cascade");
  app.patchDraftRow(0, { product_form: "flowable_extract", alpha_acid_pct: 0.45 });
  app.saveHopEditor();
  app.compute();

  assert.match(app.hopDoseWarning, /4 g\/gal/);
}, {
  boundaries: {
    ...BOUNDARY_DOUBLE,
    hop_bitterness_solver: (inputs = {}) => {
      const outputs = BOUNDARY_DOUBLE.hop_bitterness_solver(inputs);
      outputs.boil_rows = outputs.boil_rows.map((row) => ({
        ...row,
        mass_kg: 0.05,
        alpha_mass_kg: 0.0225,
      }));
      outputs.boil_mass_kg = 0.05 * outputs.boil_rows.length;
      outputs.total_mass_kg = outputs.boil_mass_kg + outputs.whirlpool_mass_kg;
      return outputs;
    },
  },
}));

test("the kettle offers four leaves and seeds an extract late", withFreshApp((app) => {
  assert.deepEqual(
    app.hopForms.map((form) => form.value),
    ["whole_cone", "t90_pellet", "lupulin_pellet", "flowable_extract"]
  );

  app.openHopEditor();
  app.setHopCatalogForm("flowable_extract");
  app.addCatalogHop("dynaboost");
  app.inspectHopRow(0);

  assert.equal(app.hopActiveRow.product_form, "flowable_extract");
  assert.equal(app.hopActiveRow.alpha_acid_pct, 0.425);
  assert.equal(app.hopActiveRow.boil_time_fraction, 0.25);
  app.cancelHopEditor();
  // The catalog form is card-local state the reset does not clear.
  app.setHopCatalogForm("t90_pellet");
}));

test("whirlpool ambient follows the global temperature unit", withFreshApp((app) => {
  app.setUnit("temperature", "degF");

  assert.equal(app.whirlpoolAmbientField.unit, "°F");
  assert.equal(app.whirlpoolAmbientField.display, "68");

  app.edit(app.whirlpoolAmbientField, "77");
  assert.equal(app.master.getRoot("batch.whirlpool_ambient_temp_c"), 25);
}));

test("whirlpool cooling time constant reaches the hop request", (() => {
  let request = null;
  return withFreshApp((app) => {
    app.setTargetIbu(40);
    app.setWhirlpoolFraction(0.25);
    app.openWhirlpoolHopEditor();
    app.addCatalogWhirlpoolHop("cascade");
    app.saveWhirlpoolHopEditor();
    app.compute();
    const slowCooling = request.whirlpool_cooling_time_constant_min;

    app.edit(app.whirlpoolCoolingField, "60");
    app.compute();

    assert.equal(slowCooling, 108.7);
    assert.equal(request.whirlpool_cooling_time_constant_min, 60);
  }, {
    boundaries: {
      ...BOUNDARY_DOUBLE,
      hop_bitterness_solver: (inputs = {}) => {
        request = inputs;
        return BOUNDARY_DOUBLE.hop_bitterness_solver(inputs);
      },
    },
  });
})());

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

test("whirlpool assumptions help toggles from the card", withFreshApp((app) => {
  assert.equal(app.whirlpoolHelpOpen, false);
  app.toggleWhirlpoolHelp();
  assert.equal(app.whirlpoolHelpOpen, true);
  app.toggleWhirlpoolHelp();
  assert.equal(app.whirlpoolHelpOpen, false);
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
  const app = createTestApp({ remote: true, fetchImpl });
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

function coolingCurveClient() {
  const docs = new Map();
  let sequence = 0;
  return {
    async listCatalog(kind) {
      return [...docs.values()].filter((record) => record.kind === kind);
    },
    async createCatalog(kind, component) {
      const id = `curve-${++sequence}`;
      const record = { id, kind, component: { ...component, id } };
      docs.set(id, record);
      return record;
    },
    async deleteCatalog(kind, id) {
      docs.delete(id);
      return null;
    },
  };
}

function newtonCurve() {
  return {
    name: "Garage kettle",
    start_temp_c: 100,
    ambient_temp_c: 20,
    points: [5, 10, 15, 20].map((time) => ({
      time_min: time,
      temp_c: 20 + 80 * Math.exp(-0.02 * time),
    })),
  };
}

async function coolingCurveApp(curve = newtonCurve()) {
  const app = createTestApp({ libraryClient: coolingCurveClient() });
  await app.library.refresh();
  const record = await app.library.create("cooling_curve", curve);
  await app.refreshLibraryItems();
  app.compute();
  return { app, id: record.id };
}

test("cooling curve selection copies only tau and the id", async () => {
  const { app, id } = await coolingCurveApp();
  app.setRoot("batch.whirlpool_ambient_temp_c", 25);
  app.selectCoolingCurve(id);

  assert.equal(app.master.getRoot("batch.cooling_curve_id"), id);
  assert.ok(
    Math.abs(app.master.getRoot("batch.whirlpool_cooling_time_constant_min") - 50) < 1e-6
  );
  assert.equal(app.master.getRoot("batch.whirlpool_ambient_temp_c"), 25);
  assert.equal(app.coolingCurveStatus, "Garage kettle");
  assert.match(app.coolingCurveSummary, /k 0\.0200\/min/);
  assert.ok(app.coolingCurveWarnings.some((warning) => warning.includes("measured at")));
});

test("default cooling resets the time constant and clears the id", async () => {
  const { app, id } = await coolingCurveApp();
  app.selectCoolingCurve(id);
  app.selectCoolingCurve("");

  assert.equal(app.master.getRoot("batch.cooling_curve_id"), "");
  assert.equal(app.master.getRoot("batch.whirlpool_cooling_time_constant_min"), 108.7);
  assert.equal(app.coolingCurveStatus, "Default cooling");
  assert.equal(app.coolingCurveValue, "");
});

test("a manual time-constant edit clears the id and reads as custom", async () => {
  const { app, id } = await coolingCurveApp();
  app.selectCoolingCurve(id);
  app.editWhirlpoolCooling("60");

  assert.equal(app.master.getRoot("batch.cooling_curve_id"), "");
  assert.equal(app.master.getRoot("batch.whirlpool_cooling_time_constant_min"), 60);
  assert.equal(app.coolingCurveStatus, "Custom");
  assert.equal(app.coolingCurveValue, CUSTOM_COOLING_CURVE);
});

test("an ambient edit keeps the selected curve", async () => {
  const { app, id } = await coolingCurveApp();
  app.selectCoolingCurve(id);
  app.edit(app.whirlpoolAmbientField, "25");

  assert.equal(app.master.getRoot("batch.cooling_curve_id"), id);
  assert.ok(
    Math.abs(app.master.getRoot("batch.whirlpool_cooling_time_constant_min") - 50) < 1e-6
  );
  assert.equal(app.master.getRoot("batch.whirlpool_ambient_temp_c"), 25);
});

test("a deleted curve keeps the copied roots and reads as missing", async () => {
  const { app, id } = await coolingCurveApp();
  app.selectCoolingCurve(id);
  await app.library.remove("cooling_curve", id);
  await app.refreshLibraryItems();

  assert.equal(app.master.getRoot("batch.cooling_curve_id"), id);
  assert.ok(
    Math.abs(app.master.getRoot("batch.whirlpool_cooling_time_constant_min") - 50) < 1e-6
  );
  assert.equal(app.coolingCurveStatus, "Missing curve");
  assert.ok(app.coolingCurveWarnings.some((warning) => warning.includes("Missing curve")));
});

test("the selected curve survives draft load and freeze", async () => {
  const { app, id } = await coolingCurveApp();
  app.selectCoolingCurve(id);
  const state = app.draftState();

  app.teardown();
  await app.loadState(state);

  assert.equal(app.master.getRoot("batch.cooling_curve_id"), id);
  assert.ok(
    Math.abs(app.master.getRoot("batch.whirlpool_cooling_time_constant_min") - 50) < 1e-6
  );
  assert.equal(app.freezePayload().valuation["batch.cooling_curve_id"], id);
});
