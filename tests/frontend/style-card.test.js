import test from "node:test";
import assert from "node:assert/strict";

import { createTestApp, TEST_YEAST_ID } from "./appHelpers.js";
import { createStepApp } from "../../frontend/src/adapters/stepAdapter.js";
import { identityFixture } from "./helpers.js";
import { createReferenceCache } from "../../frontend/src/store/referenceCache.js";
import { errorCounters, resetErrorObservability } from "../../frontend/src/observability.js";

const cache = createReferenceCache();

const HTTP_BATCH = {
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

const HTTP_WATER = {
  strategy: "CALCIUM_FLOOR",
  prescription: {
    predicted_mash_ph: 5.4,
    mash_ph_status: "OPTIMAL",
    residual_hlt_water_l: 0.0,
  },
};

async function httpAppWithStyle(styleId = "21A") {
  const fetchImpl = async (url) => ({
    ok: true,
    status: 200,
    json: async () => (url === "/solve/batch" ? HTTP_BATCH : HTTP_WATER),
  });
  const app = createTestApp({ useHttp: true, fetchImpl, debounceMs: 60_000 });
  await app.loadState({
    identity: {
      ...identityFixture(),
      style: cache.references.style[styleId] ?? {},
    },
    roots: {},
    collections: {},
    selections: {},
  });
  return app;
}

// A batch's style is its identity: it is sealed at creation and loaded as a
// snapshot, never selected from the workspace.
async function appWithStyle(styleId = "21A") {
  const app = createTestApp();
  await app.loadState({
    identity: {
      ...identityFixture(),
      style: cache.references.style[styleId] ?? {},
    },
    roots: {},
    collections: {},
    selections: {},
  });
  app.compute();
  return app;
}

test("the sealed style declaration seeds the residual targets", async () => {
  const app = await appWithStyle("21A");

  assert.equal(app.engine.identity.style.id, "21A");
  assert.deepEqual(app.styleSrmBounds, [6, 14]);
  assert.deepEqual(app.styleIbuBounds, [40, 70]);
  assert.equal(app.master.getRoot("batch.fermentation"), "ale");

  const aa = app.engine.resolve("solver.batch.apparent_attenuation");
  const abv = app.engine.get("batch.target_abv");
  assert.ok(typeof aa === "number" && aa > 0 && aa <= 1);
  assert.ok(typeof abv === "number" && abv >= 5.5 && abv <= 7.5);
});

test("the style declaration is read-only and has no workspace selector", async () => {
  const app = await appWithStyle("21A");

  const field = app.fieldsById["style.og_min"];
  assert.equal(field.value, 1.056);
  assert.equal(field.editable, false);
  app.edit(field, "1.040");
  assert.equal(app.engine.identity.style.og_min, 1.056);

  // Identity is frozen at creation: the workspace cannot write it.
  assert.equal(app.selectStyle, undefined);
  assert.equal(app.clearStyleSelection, undefined);
  assert.equal(app.setIdentityComponent, undefined);
});

test("a stats-less style leaves the residuals unseeded", async () => {
  const app = await appWithStyle("34C");

  assert.equal(app.engine.identity.style.id, "34C");
  assert.equal(Number.isFinite(app.engine.identity.style.og_min), false);
  assert.equal(app.master.getRoot("batch.target_abv"), undefined);
});

test("the style navigator reads the solved targets", async () => {
  const app = await appWithStyle("21A");
  const info = app.styleTargetInfo;

  assert.ok(info.og > 1);
  assert.ok(
    Math.abs(app.engine.resolve("solver.batch.apparent_attenuation") - info.aa) < 1e-9
  );
  assert.ok(
    Math.abs(app.engine.resolve("batch.realized_abv") - info.abv) < 1e-6
  );
});

test("the ABV target is free and is not clamped to the fixed-AA ray", async () => {
  const app = await appWithStyle("21A");
  const bounds = app.styleAbvBounds;
  assert.ok(bounds);

  const target = Math.round((bounds[1] + 1.0) * 10) / 10;
  app.setStyleTargetAbv(target);
  assert.equal(app.master.getRoot("batch.target_abv"), target);

  app.compute();
  assert.equal(app.master.getRoot("batch.target_abv"), target);

  const invalid = { value: "" };
  app.setStyleTargetAbv(invalid);
  assert.equal(app.master.getRoot("batch.target_abv"), target);
  assert.equal(invalid.value, target.toFixed(1));
});

test("the ABV cache keeps the style card off the boundary during an edit", async () => {
  const app = await httpAppWithStyle("21A");
  const before = app.styleAbvBounds;
  assert.ok(before);

  resetErrorObservability();
  app.setRoot("batch.target_abv", (before[0] + before[1]) / 2);

  assert.deepEqual(app.styleAbvBounds, before);
  assert.ok(app.stylePreview);
  assert.deepEqual(
    Object.keys(errorCounters()).filter((key) => key.includes("No boundary binding registered")),
    []
  );
  app.teardown();
});

test("a new batch seeds the style ABV midpoint and leaves it free", async () => {
  const app = createStepApp();
  await app.loadState({
    identity: {
      ...identityFixture(),
      style: cache.references.style["21A"] ?? {},
    },
    roots: {},
    collections: {},
    selections: {},
  });

  assert.equal(app.master.getRoot("batch.target_abv"), undefined);
  assert.equal(app.engine.get("batch.target_abv"), 6.5);
  assert.equal(app.styleAbvTarget, 6.5);
  assert.equal(app.styleAbvBounds, null);

  app.selectYeast(TEST_YEAST_ID);
  app.compute();

  assert.equal(app.master.getRoot("batch.target_abv"), undefined);
  assert.equal(app.engine.get("batch.target_abv"), 6.5);
  assert.equal(app.styleAbvTouched, false);
});

test("the style card exposes the blend AA, malt cap, and sugar lift", async () => {
  const app = await appWithStyle("21A");
  assert.equal(app.attenuationBlend, app.styleSolvedAa);
  assert.equal(app.attenuationCap, app.styleSolvedCap);
  assert.ok(app.attenuationSugarLift >= 0);
});

test("the batch Target ABV is a read-only readout", async () => {
  const app = await appWithStyle("21A");
  const field = app.fieldsById["batch.target_abv"];
  assert.equal(field.control, "readout");
  assert.equal(field.editable, false);
  assert.equal(field.target, null);
});

test("IBU/GU uses the planned target and the navigator's OG", async () => {
  const app = await appWithStyle("21A");
  app.resetStyleTarget();
  app.setTargetIbu(40);

  const og = app.styleTargetInfo.og;
  const expected = 40 / ((og - 1) * 1000);
  assert.ok(Math.abs(app.ibuGu - expected) < 1e-9);
  assert.equal(app.ibuGuDisplay, expected.toFixed(2));
});

test("fieldsById indexes the projected models and powers the envelope grid", async () => {
  const app = await appWithStyle("21A");

  assert.equal(app.fieldsById["style.og_min"].id, "style.og_min");
  assert.equal(app.styleField, undefined);

  const envelope = app.styleEnvelopeFields;
  assert.equal(envelope.length, 10);
  assert.deepEqual(
    envelope.map((row) => row.id),
    [
      "style.og_min",
      "style.og_max",
      "style.fg_min",
      "style.fg_max",
      "style.ibu_min",
      "style.ibu_max",
      "style.srm_min",
      "style.srm_max",
      "style.abv_min",
      "style.abv_max",
    ]
  );
  for (const row of envelope) {
    assert.equal(row.field.id, row.id);
    assert.equal(typeof row.step, "string");
    assert.equal(typeof row.provenance.showSeed, "boolean");
  }
});

test("utils namespace is exposed to templates", () => {
  const app = createTestApp();
  assert.equal(typeof app.fmt.formatGravity, "function");
  assert.equal(app.fmt.formatQuantity({ display: "1.5", unit: "kg" }), "1.5 kg");
});

test("the style card carries no water-flavor intent fields", () => {
  const app = createTestApp();
  app.boot();

  const ids = app.fieldsBySlice.style.map((f) => f.id);
  assert.equal(ids.some((id) => id.startsWith("batch.sulfate_chloride")), false);
  assert.equal(app.sulfateChlorideSpecified, undefined);
});
