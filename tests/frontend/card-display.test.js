// Display-surface coverage for the cards whose behaviour is exercised
// elsewhere: the readout getters, filters, and formatting helpers the templates
// bind to. Every test starts from the suite's one app reset to its baseline; the
// style-card cases load a different identity, which a reset cannot restore, so
// they keep their own boot.

import test from "node:test";
import assert from "node:assert/strict";

import { createTestApp, withFreshApp } from "./appHelpers.js";
import { createReferenceCache } from "../../frontend/src/store/referenceCache.js";
import { sugarEffect } from "../../frontend/src/views/producer/sugarEffect.js";

const cache = createReferenceCache();

async function styledApp(styleId = "21A") {
  const app = createTestApp();
  const water = Object.values(cache.references.water_report ?? {})[0] ?? {};
  await app.loadState({
    identity: {
      style: cache.references.style[styleId] ?? {},
      equipment: cache.references.equipment?.["herms-30l"] ?? {},
      "water.source": water,
    },
    roots: {},
    collections: {},
    selections: {},
  });
  await app.boot();
  app.compute();
  return app;
}

// --- Yeast -----------------------------------------------------------------

test("yeast card: attenuation, manufacturer, and tier filters compose", withFreshApp(async (app) => {
  const total = app.yeastCatalog.length;
  assert.ok(total > 0);

  const manufacturer = app.yeastManufacturers[0];
  assert.ok(manufacturer);
  assert.deepEqual(app.yeastManufacturers, [...new Set(app.yeastManufacturers)].sort());

  app.yeastManufacturerFilter = manufacturer;
  assert.ok(app.filteredYeasts.length > 0);
  assert.ok(app.filteredYeasts.every((y) => y.manufacturer === manufacturer));

  app.yeastAttenuationFilter = "super";
  assert.ok(app.filteredYeasts.every((y) => y.attenuation_pct >= 0.825));

  app.yeastManufacturerFilter = "";
  app.yeastAttenuationFilter = "low";
  assert.ok(app.filteredYeasts.every((y) => y.attenuation_pct < 0.705));

  app.yeastAttenuationFilter = "";
  assert.equal(app.filteredYeasts.length, total);
}));

// The search query this case leaves behind is card-local state, which a reset
// does not clear, so it keeps its own boot.
test("yeast card: the notes toggle gates note matching", async () => {
  const app = createTestApp();
  await app.boot();
  app.compute();
  const withNotes = app.yeastCatalog.find((y) => (y.notes ?? "").trim().length > 6);
  assert.ok(withNotes, "a seeded strain needs notes for this test");
  const term = withNotes.notes.split(/\s+/).find((word) => word.length > 5);

  app.yeastSearchQuery = term;
  app.yeastSearchNotes = false;
  const withoutNotes = app.filteredYeasts.map((y) => y.id);

  app.toggleYeastSearchNotes();
  assert.equal(app.yeastSearchNotes, true);
  const withNotesIds = app.filteredYeasts.map((y) => y.id);

  assert.ok(withNotesIds.includes(withNotes.id));
  assert.ok(withNotesIds.length >= withoutNotes.length);
});

test("yeast card: attenuation formatting and the selected-strain readouts", withFreshApp(async (app) => {
  const strain = app.yeastCatalog.find((y) => typeof y.attenuation_pct === "number");

  assert.equal(app.yeastAttenuation(strain), `${Math.round(strain.attenuation_pct * 1000) / 10}%`);
  assert.equal(app.yeastAttenuation(null), "");

  app.selectedYeastId = strain.id;
  assert.equal(app.selectedYeast, strain);
  if (typeof strain.temp_low_c === "number" && typeof strain.temp_high_c === "number") {
    assert.equal(app.selectedYeastTemp, `${strain.temp_low_c}–${strain.temp_high_c}°C`);
  }

  app.selectedYeastId = "";
  assert.equal(app.selectedYeast, null);
  assert.equal(app.selectedYeastTemp, "");
}));

test("yeast card: the result label reports truncation past the display cap", withFreshApp(async (app) => {
  assert.match(app.yeastResultLabel, /matching strain/);
  assert.equal(app.isYeastListTruncated, app.yeastResultCount > app.visibleYeasts.length);
  assert.ok(app.visibleYeasts.length <= 25);
}));

test("yeast card: tier filters toggle on and off", withFreshApp(async (app) => {
  app.toggleYeastAttenuation("high");
  assert.equal(app.yeastAttenuationFilter, "high");
  app.toggleYeastAttenuation("high");
  assert.equal(app.yeastAttenuationFilter, "");
}));

test("yeast card: diastaticus pills filter the tri-state STA1 field", withFreshApp(async (app) => {
  const tiers = app.yeastDiastaticusTiers;
  assert.deepEqual(tiers.map((tier) => tier.key), ["positive", "negative", "unknown"]);
  assert.equal(
    tiers.reduce((sum, tier) => sum + tier.count, 0),
    app.yeastCatalog.length
  );

  app.toggleYeastDiastaticus("positive");
  assert.ok(app.filteredYeasts.length > 0);
  assert.ok(app.filteredYeasts.every((y) => y.sta1 === true));

  app.toggleYeastDiastaticus("negative");
  assert.ok(app.filteredYeasts.length > 0);
  assert.ok(app.filteredYeasts.every((y) => y.sta1 === false));

  app.toggleYeastDiastaticus("unknown");
  assert.ok(app.filteredYeasts.length > 0);
  assert.ok(app.filteredYeasts.every((y) => y.sta1 !== true && y.sta1 !== false));

  app.toggleYeastDiastaticus("");
  assert.equal(app.yeastDiastaticusFilter, "");
  assert.equal(app.filteredYeasts.length, app.yeastCatalog.length);
}));

test("yeast card: the chooser is always mounted and Clear empties the selection", withFreshApp(async (app) => {
  assert.equal(app.selectedYeast?.id, "fermentis-safale-american-ale-us-05");

  app.clearYeastSelection();
  assert.equal(app.selectedYeast, null);
}));

test("yeast card: the derate help toggles", withFreshApp(async (app) => {
  assert.equal(app.derateHelpOpen, false);
  app.toggleDerateHelp();
  assert.equal(app.derateHelpOpen, true);
  app.toggleDerateHelp();
  assert.equal(app.derateHelpOpen, false);
}));

test("yeast card: derate is points off the strain maximum", withFreshApp(async (app) => {
  const aa = app.engine.resolve("batch.yeast.attenuation_pct");

  const input = { value: "4" };
  app.commitYeastDerate(input);
  assert.ok(Math.abs(app.master.getRoot("batch.attenuation_derate_points") - 0.04) < 1e-9);
  assert.ok(Math.abs(app.engine.get("batch.yeast_cap") - (aa - 0.04)) < 1e-9);

  const previous = app.yeastField("batch.attenuation_derate_points").display;
  const negative = { value: "-1" };
  app.commitYeastDerate(negative);
  assert.ok(Math.abs(app.master.getRoot("batch.attenuation_derate_points") - 0.04) < 1e-9);
  assert.equal(negative.value, previous);

  const tooHigh = { value: "26" };
  app.commitYeastDerate(tooHigh);
  assert.ok(Math.abs(app.master.getRoot("batch.attenuation_derate_points") - 0.04) < 1e-9);
  assert.equal(tooHigh.value, previous);

  const empty = { value: "" };
  app.commitYeastDerate(empty);
  assert.ok(Math.abs(app.master.getRoot("batch.attenuation_derate_points") - 0.04) < 1e-9);
  assert.equal(empty.value, previous);

  const zero = { value: "0" };
  app.commitYeastDerate(zero);
  assert.equal(app.master.getRoot("batch.attenuation_derate_points"), 0);
  assert.equal(app.engine.get("batch.yeast_cap"), aa);
}));

test("yeast card: a legacy multiplier derate migrates to points on load", withFreshApp(async (app) => {
  const aa = app.engine.resolve("batch.yeast.attenuation_pct");

  await app.loadState({
    roots: {
      "batch.yeast_id": "fermentis-safale-american-ale-us-05",
      "batch.attenuation_derate": 0.95,
    },
    collections: {},
    selections: {},
  });

  const points = app.master.getRoot("batch.attenuation_derate_points");
  assert.ok(Math.abs(points - (1 - 0.95) * aa) < 1e-9);
}));

// --- Late additions --------------------------------------------------------

test("late additions: the sugar draft fields resolve inside the card's slice", withFreshApp(async (app) => {
  const sugar = app.sugarCatalog[0];

  app.openSugarEditor();
  assert.equal(app.sugarEditorOpen, true);
  app.addCatalogSugar(sugar.id);

  const rows = app.draftRows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sugar_id, sugar.id);
  assert.equal(rows[0].yield_fraction, sugar.yield_fraction);

  assert.ok(app.sugarMassField);
  assert.ok(app.lateSugarField);
  assert.ok(app.sugarColorField);
  assert.ok(app.lateExtractField);
  assert.equal(app.sugarField(app.sugarMassField.id), app.sugarMassField);
  assert.equal(app.lateSugarField.control, "collection-table");

  app.saveSugarEditor();
  app.compute();
  assert.equal(app.sugarList.length, 1);
  assert.match(app.sugarResultLabel, /sugar/);
}));

test("late additions: the configure row counts the authored sugars", withFreshApp(async (app) => {
  assert.equal(app.sugarCountLabel, "No sugars");

  app.openSugarEditor();
  app.addCatalogSugar(app.sugarCatalog[0].id);
  app.saveSugarEditor();
  app.compute();
  assert.equal(app.sugarCountLabel, "1 sugar");

  app.openSugarEditor();
  app.addCatalogSugar(app.sugarCatalog[1].id);
  app.saveSugarEditor();
  app.compute();
  assert.equal(app.sugarCountLabel, "2 sugars");
}));

test("late additions: the draft mass and extract readouts follow the open draft", withFreshApp(async (app) => {
  const sugar = app.sugarCatalog[0];

  app.openSugarEditor();
  app.addCatalogSugar(sugar.id);
  app.editDraftCell(0, "mass_kg", 1.5);

  assert.match(app.sugarDraftMassDisplay, /\d/);
  assert.match(app.sugarDraftExtractDisplay, /\d/);

  assert.equal(app.draftDirty, true);
  app.cancelSugarEditor();
  assert.equal(app.draftDiscardOpen, true);
  assert.equal(app.sugarEditorOpen, true);

  app.confirmDraftDiscard();
  assert.equal(app.draftDiscardOpen, false);
  assert.equal(app.sugarEditorOpen, false);
}));

test("late additions: the sugar effect is derived at the current pin", withFreshApp(async (app) => {
  const sugar = app.sugarCatalog[0];

  assert.equal(app.sugarEffect.active, false, "no dose, no effect");
  assert.equal(app.sugarEffectDisplay, null);

  app.openSugarEditor();
  app.addCatalogSugar(sugar.id);
  app.editDraftCell(0, "mass_kg", 0.5);
  app.saveSugarEditor();
  await app.solveNow();
  app.compute();

  const effect = app.sugarEffect;
  assert.equal(effect.active, true);
  assert.ok(effect.share > 0 && effect.share < 1);
  assert.ok(effect.ogPoints > 0, "sugar raises the extract");
  assert.equal(effect.fgPoints, 0, "sugar leaves no residual extract");
  assert.ok(effect.abvPoints > 0, "sugar contributes alcohol");
  assert.ok(effect.gristKg > 0, "sugar displaces malt at the pin");

  assert.equal(app.sugarEffectDisplay.share, `${(effect.share * 100).toFixed(1)}%`);
  assert.match(app.sugarEffectDisplay.og, /^\+0\./);
  assert.match(app.sugarEffectDisplay.abv, /^\+\d/);
}));

test("late additions: reading the sugar effect does not change the recipe", withFreshApp(async (app) => {
  const sugar = app.sugarCatalog[0];
  app.openSugarEditor();
  app.addCatalogSugar(sugar.id);
  app.editDraftCell(0, "mass_kg", 0.5);
  app.saveSugarEditor();
  await app.solveNow();
  app.compute();

  const before = JSON.stringify(app.draftState());
  void app.sugarEffect;
  void app.sugarEffectDisplay;
  assert.equal(JSON.stringify(app.draftState()), before, "readouts must not mutate state");
  assert.equal(app.master.getRoot("batch.target_abv"), undefined);
}));

test("sugarEffect is defensive about incomplete batches", () => {
  assert.equal(sugarEffect({}).active, false);
  assert.equal(
    sugarEffect({
      extractTotalKg: 0,
      sugarExtractKg: 0.5,
      sgPostBoil: 1.05,
      apparentAttenuation: 0.75,
    }).active,
    false
  );
});

// --- Trace malts -----------------------------------------------------------

test("trace malts: the catalog draft installs into the trace slice", withFreshApp(async (app) => {
  const malt = app.traceCatalog[0];

  app.openTraceEditor();
  assert.equal(app.traceEditorOpen, true);
  app.addCatalogTrace(malt.id);

  assert.equal(app.draftRows.length, 1);
  assert.equal(app.draftRows[0].catalog_id, malt.id);
  assert.ok(app.traceMaltField);
  assert.ok(app.traceMassField);
  assert.ok(app.traceColorField);
  assert.match(app.traceMaltField.id, /^grist\.trace_malts/);

  app.saveTraceEditor();
  app.compute();
  assert.equal(app.traceMaltRows.length, 1);
  assert.match(app.traceDraftMassDisplay, /\d/);
}));

// --- Hops ------------------------------------------------------------------

test("hops: the alpha band is context and out-of-band values are flagged", withFreshApp(async (app) => {
  app.openHopEditor();
  app.addCatalogHop("cascade");
  app.saveHopEditor();
  app.compute();

  const record = cache.references.hop.cascade;
  const row = app.hopRows[0];

  assert.equal(app.hopAlphaRange(row), `stock ${(record.alpha_acid_min_pct * 100).toFixed(1)}–${(record.alpha_acid_max_pct * 100).toFixed(1)}%`);
  assert.equal(app.hopAlphaOutsideStock(row), false);

  assert.equal(app.hopAlphaOutsideStock({ ...row, alpha_acid_pct: record.alpha_acid_max_pct + 0.5 }), true);
  assert.equal(app.hopAlphaOutsideStock({ ...row, alpha_acid_pct: record.alpha_acid_min_pct - 0.5 }), true);
  assert.equal(app.hopAlphaOutsideStock({ hop_id: "nope" }), false);
  assert.equal(app.hopAlphaRange({ hop_id: "nope" }), "");

  assert.equal(app.hopAlpha(row), `${(row.alpha_acid_pct * 100).toFixed(1)}%`);
  assert.equal(app.hopAlpha({}), "—");
}));

test("hops: setHopAlpha clamps to 0–100% and leaves other rows alone", withFreshApp(async (app) => {
  app.openHopEditor();
  app.addCatalogHop("cascade");
  app.addCatalogHop("citra");
  app.saveHopEditor();
  app.compute();

  app.setHopAlpha("boil", 0, 250);
  assert.equal(app.engine.get("batch.boil_hops")[0].alpha_acid_pct, 1);

  app.setHopAlpha("boil", 0, -4);
  assert.equal(app.engine.get("batch.boil_hops")[0].alpha_acid_pct, 0);

  app.setHopAlpha("boil", 99, 5);
  assert.equal(app.engine.get("batch.boil_hops").length, 2);
}));

test("hops: whirlpool form labels and row readouts", withFreshApp(async (app) => {
  const row = { product_form: "flowable_extract" };
  assert.match(app.hopForm(row), /extract/i);
  assert.match(app.hopForm({}), /T-90|pellet/i);
  assert.equal(app.hopIbu({ ibu: 22.44 }), "22.4");
  assert.equal(app.hopIbu({}), "—");
  assert.equal(app.hopPct({ pct: 0.5 }), "50.0%");
  assert.equal(app.hopPct({}), "—");
  assert.equal(app.hopBoilPct({ boil_time_fraction: 0.25 }), "25%");
  assert.equal(app.hopMinutes({ minutes: 60 }), "60 min");
}));

// --- Style -----------------------------------------------------------------

test("style card: declaration readouts format gravity and vitals", async () => {
  const app = await styledApp("21A");
  const style = app.engine.identity.style;

  assert.equal(app.styleGravity(style), app.styleGravity(style));
  assert.match(app.styleVitals(style), / \/ /);
  assert.deepEqual(app.styleSrmBounds, [6, 14]);
  assert.deepEqual(app.styleIbuBounds, [40, 70]);
});

test("style card: the planned balance readouts are derived from targets", async () => {
  const app = await styledApp("21A");
  app.setTargetIbu(40);
  app.compute();

  assert.equal(app.ibuGuDisplay, app.ibuGu.toFixed(2));
  assert.match(app.boilIbuDisplay, /\d/);
  assert.match(app.whirlpoolIbuDisplay, /\d/);
  assert.equal(app.whirlpoolPctDisplay, Math.round(app.whirlpoolFraction * 100));
});

test("style card: the preview geometry stays inside the declared box", async () => {
  const app = await styledApp("21A");

  const preview = app.stylePreview;
  assert.ok(preview);
  assert.ok(preview.width >= 64);
  assert.ok(preview.height >= 64);
  assert.equal(preview.polygon.split(" ").length >= 3, true);
  assert.ok(Number.isFinite(Number(preview.marker.x)));
  assert.ok(Number.isFinite(Number(preview.marker.y)));
});

test("style card: the conformance summary renders the scored dimensions", async () => {
  const app = await styledApp("21A");
  const summary = app.conformanceSummary;

  assert.ok(summary, "a style with ranges must score");
  assert.equal(typeof summary.sai, "number");
  assert.ok(summary.dimensions.length > 0);
  for (const dimension of summary.dimensions) {
    assert.ok(dimension.label);
    assert.ok(dimension.value !== "");
    assert.ok(dimension.status);
  }
});

test("style card: the summary is null without a conformance baseline", () => {
  const app = createTestApp();
  assert.equal(app.conformanceSummary, null);
});

// --- Mash ------------------------------------------------------------------

test("mash card: rest names, purposes, and bound formatting come from the canon", async () => {
  const app = createTestApp();
  await app.boot();

  assert.equal(app.restName("mash_out"), "Mash-out");
  assert.ok(app.restPurpose("protein"));
  assert.equal(app.restName("made_up"), "made_up");
  assert.equal(app.restPurpose("made_up"), "");

  assert.match(app.restTempRangeDisplay("protein"), /\d+–\d+/);
  assert.equal(app.restTempRangeDisplay("made_up"), "");
  assert.equal(typeof app.restBoundDisplay("protein", "min"), "number");
  assert.equal(app.restBoundDisplay("made_up", "min"), "");

  const rest = app.mashRests.find(
    (r) => typeof r.use_temp_c === "number" && Number.isFinite(r.use_temp_c)
  );
  assert.ok(rest, "a scheduled rest must carry a temperature");
  assert.match(app.restUseTempDisplay(rest), /^\d+\.\d$/);
  assert.equal(app.restUseTempDisplay({ rest_id: "mash_out", use_temp_c: null }), "");
  assert.equal(app.restUseTempDisplay(null), "");
});
