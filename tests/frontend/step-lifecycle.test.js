import test from "node:test";
import assert from "node:assert/strict";

import { createStepApp } from "../../frontend/src/adapters/stepAdapter.js";

const ENVELOPE = {
  "batch.style_id": "21A",
  "batch.style_og_min": 1.056,
  "batch.style_og_max": 1.07,
  "batch.style_fg_min": 1.01,
  "batch.style_fg_max": 1.018,
  "batch.style_abv_min": 5.5,
  "batch.style_abv_max": 7.5,
  "batch.target_srm": 20,
  "batch.target_ibu": 55,
};

const HOP_ROWS = [
  {
    hop_id: "cascade",
    name: "Cascade",
    alpha_acid_pct: 0.055,
    boil_time_fraction: 1,
    parts: 10,
    pct: 1,
  },
];

const SUGAR_ROWS = [
  {
    sugar_id: "table-sugar",
    name: "Table Sugar",
    mass_kg: 0.5,
    yield_fraction: 1,
    color_lovibond: 0,
    notes: "",
  },
];

function customMashRests(app) {
  return app.mashRests.map((rest) =>
    rest.rest_id === "beta_alpha_amylase" ? { ...rest, use_temp_c: 68 } : { ...rest }
  );
}

test("loadState rebinds the style card to the new engine", async () => {
  const app = createStepApp();
  await app.boot();

  await app.loadState({ roots: ENVELOPE });

  assert.equal(app.selectedStyleId, "21A");
  assert.equal(app.styleEnvelope.ogMin, 1.056);
  assert.ok(app.styleRegion.length >= 3);
  assert.equal(app.targetSrm, 20);
  assert.equal(app.targetIbu, 55);
});

test("scheduled solves and status writes target the reactive binding", async () => {
  const app = createStepApp();
  const proxy = {
    compute() {
      this.computes += 1;
    },
    computes: 0,
    boundaryStatuses: {},
    boundaryError: null,
  };
  app.bindReactive(proxy);

  await app.solveNow();
  assert.equal(proxy.computes, 1);

  app.teardown();
  assert.deepEqual(Object.keys(proxy.boundaryStatuses).sort(), ["solver.batch", "solver.water"]);
  assert.equal(proxy.boundaryError, null);
});

test("loadState rebinds the mash card to the loaded rest collection", async () => {
  const app = createStepApp();
  await app.boot();
  const rests = customMashRests(app);

  await app.loadState({ collections: { "mash.rests": rests } });

  const beta = app.mashRests.find((r) => r.rest_id === "beta_alpha_amylase");
  assert.equal(beta.use_temp_c, 68);
  assert.equal(app.doughInInheritedTempC, 68);
});

test("loadState rebinds the hop card to the loaded rows", async () => {
  const app = createStepApp();
  await app.boot();
  app.setTargetIbu(40);
  app.setWhirlpoolFraction(0);

  await app.loadState({
    roots: { "batch.target_ibu": 40, "batch.whirlpool_ibu_fraction": 0 },
    collections: { "batch.boil_hops": HOP_ROWS },
  });

  assert.equal(app.hopRows.length, 1);
  assert.equal(app.hopRows[0].hop_id, "cascade");
  assert.ok(app.hopRows[0].mass_kg > 0);
});

test("loadState rebinds the yeast card to the loaded selection", async () => {
  const app = createStepApp();
  await app.boot();
  const yeastId = app.yeastCatalog[0].id;

  await app.loadState({ roots: { "batch.yeast_id": yeastId } });

  assert.equal(app.selectedYeastId, yeastId);
});

test("loadState rebinds draft rows and their readouts", async () => {
  const app = createStepApp();
  await app.boot();

  await app.loadState({ collections: { "batch.sugars": SUGAR_ROWS } });
  app.openDraft("batch.sugars");

  assert.equal(app.draftRows.length, 1);
  assert.match(app.sugarDraftMassDisplay, /0\.5/);
  app.closeDraft();
});

test("teardown restores baseline card state", async () => {
  const app = createStepApp();
  await app.boot();
  app.setTargetIbu(40);
  const yeastId = app.yeastCatalog[0].id;

  await app.loadState({
    roots: { ...ENVELOPE, "batch.yeast_id": yeastId },
    collections: {
      "mash.rests": customMashRests(app),
      "batch.boil_hops": HOP_ROWS,
      "batch.sugars": SUGAR_ROWS,
    },
  });
  app.teardown();

  assert.equal(app.selectedStyleId, "");
  assert.equal(app.styleEnvelope, null);
  assert.equal(app.styleRegion.length, 0);
  assert.equal(app.targetSrm, 0);
  assert.equal(app.targetIbu, 30);
  assert.equal(app.selectedYeastId, "");
  assert.equal(app.hopRows.length, 0);
  assert.equal(app.sugarList.length, 0);
  const beta = app.mashRests.find((r) => r.rest_id === "beta_alpha_amylase");
  assert.equal(beta.use_temp_c, 67);
});
