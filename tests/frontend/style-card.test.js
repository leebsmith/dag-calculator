import test from "node:test";
import assert from "node:assert/strict";

import { createTestApp, TEST_YEAST_ID } from "./appHelpers.js";
import { createStepApp } from "../../frontend/src/adapters/stepAdapter.js";
import { identityFixture } from "./helpers.js";
import { createReferenceCache } from "../../frontend/src/store/referenceCache.js";
import { raySegment } from "../../frontend/src/engine/fermentation.js";

const cache = createReferenceCache();

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

  const aa = app.engine.get("batch.apparent_attenuation");
  const abv = app.master.getRoot("batch.target_abv");
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

test("the fermentation navigator writes the batch targets, not the declaration", async () => {
  const app = await appWithStyle("21A");

  app.resetStyleTarget();
  const info = app.styleTargetInfo;

  assert.ok(info.og > 1);
  assert.ok(Math.abs(app.engine.get("batch.apparent_attenuation") - info.aa) < 1e-9);
  assert.ok(Math.abs(app.master.getRoot("batch.target_abv") - info.abv) < 1e-9);
});

test("the ABV input writes the target and clamps to the fixed-AA ray", async () => {
  const app = await appWithStyle("21A");
  const bounds = app.styleAbvBounds;
  const aa = app.engine.get("batch.apparent_attenuation");
  assert.ok(bounds);
  assert.ok(raySegment(app.styleRegion, aa));

  const target = Math.round(((bounds[0] + bounds[1]) / 2) * 10) / 10;
  app.setStyleTargetAbv(target);
  assert.ok(Math.abs(app.master.getRoot("batch.target_abv") - target) < 1e-9);
  const { oe, ae } = app.styleExtract;
  const ray = raySegment(app.styleRegion, aa);
  assert.ok(oe >= ray.oeMin - 1e-9 && oe <= ray.oeMax + 1e-9);
  assert.ok(Math.abs(ae - oe * (1 - aa)) < 1e-9);
  assert.ok(Math.abs(app.styleTargetInfo.abv - target) < 1e-9);
  assert.equal(app.styleAbvTouched, true);

  app.compute();
  assert.ok(Math.abs(app.master.getRoot("batch.target_abv") - target) < 1e-9);

  const invalid = { value: "" };
  app.setStyleTargetAbv(invalid);
  assert.ok(Math.abs(app.master.getRoot("batch.target_abv") - target) < 1e-9);
  assert.equal(invalid.value, target.toFixed(1));

  app.setStyleTargetAbv(bounds[1] + 10);
  const high = app.master.getRoot("batch.target_abv");
  assert.ok(high <= bounds[1] + 1e-9);
  assert.ok(high >= bounds[0] - 1e-9);
  assert.equal(Math.round(high * 10) / 10, high);

  app.setStyleTargetAbv(bounds[0] - 10);
  const low = app.master.getRoot("batch.target_abv");
  assert.ok(low >= bounds[0] - 1e-9);
  assert.ok(low <= bounds[1] + 1e-9);
  assert.equal(Math.round(low * 10) / 10, low);
});

test("a new batch seeds the style ABV midpoint and centers it on the first yeast", async () => {
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

  assert.equal(app.master.getRoot("batch.target_abv"), 6.5);
  assert.equal(app.styleAbvBounds, null);

  app.selectYeast(TEST_YEAST_ID);
  app.compute();

  const bounds = app.styleAbvBounds;
  assert.ok(bounds);
  const midpoint = Math.round(((bounds[0] + bounds[1]) / 2) * 10) / 10;
  assert.ok(Math.abs(app.master.getRoot("batch.target_abv") - midpoint) < 1e-9);
  assert.equal(app.styleAbvTouched, false);
});

test("the batch Target ABV is a read-only readout", async () => {
  const app = await appWithStyle("21A");
  const field = app.fieldsById["batch.target_abv"];
  assert.equal(field.control, "readout");
  assert.equal(field.editable, false);
  assert.equal(field.target, null);
});

test("the Belgian advisory is a readout and does not mutate the recipe", async () => {
  const app = await appWithStyle("21A");
  app.styleExtract = { oe: 12, ae: 4 };

  const targetBefore = app.master.getRoot("batch.target_abv");
  const gristBefore = app.engine.get("grist.major_malts");

  app.setBelgianTargetAa(70);
  const advisory = app.styleBelgian;
  assert.equal(advisory.ok, true, advisory.reason);
  assert.ok(advisory.sucroseKg > 0);
  assert.match(app.styleBelgianMessage, /sucrose/);
  assert.equal(advisory.ae, 4);
  assert.ok(advisory.targetOe > 12);

  assert.equal(app.master.getRoot("batch.target_abv"), targetBefore);
  assert.deepEqual(app.engine.get("grist.major_malts"), gristBefore);
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
