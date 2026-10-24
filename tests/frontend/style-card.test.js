import test from "node:test";
import assert from "node:assert/strict";

import { createStepApp } from "../../frontend/src/adapters/stepAdapter.js";
import { createReferenceCache } from "../../frontend/src/store/referenceCache.js";

const cache = createReferenceCache();

// A batch's style is its identity: it is sealed at creation and loaded as a
// snapshot, never selected from the workspace.
async function appWithStyle(styleId = "21A") {
  const app = createStepApp();
  await app.loadState({
    identity: {
      style: cache.references.style[styleId] ?? {},
      equipment: {},
      "water.source": {},
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

  const aa = app.master.getRoot("batch.apparent_attenuation");
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
  assert.equal(app.master.getRoot("batch.apparent_attenuation"), undefined);
});

test("the fermentation navigator writes the batch targets, not the declaration", async () => {
  const app = await appWithStyle("21A");

  app.resetStyleTarget();
  const info = app.styleTargetInfo;

  assert.ok(info.og > 1);
  assert.ok(Math.abs(app.master.getRoot("batch.apparent_attenuation") - info.aa) < 1e-9);
  assert.ok(Math.abs(app.master.getRoot("batch.target_abv") - info.abv) < 1e-9);
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
  const app = createStepApp();
  assert.equal(typeof app.fmt.formatGravity, "function");
  assert.equal(app.fmt.formatQuantity({ display: "1.5", unit: "kg" }), "1.5 kg");
});

test("the style card carries no water-flavor intent fields", () => {
  const app = createStepApp();
  app.boot();

  const ids = app.fieldsBySlice.style.map((f) => f.id);
  assert.equal(ids.some((id) => id.startsWith("batch.sulfate_chloride")), false);
  assert.equal(app.sulfateChlorideSpecified, undefined);
});
