import test from "node:test";
import assert from "node:assert/strict";

import { createStepApp } from "../../frontend/src/adapters/stepAdapter.js";

test("selectStyle seeds the envelope, fermentation, and fermentation targets", () => {
  const app = createStepApp();
  app.boot();
  app.selectStyle("21A");
  app.compute();

  assert.equal(app.master.getRoot("batch.style_id"), "21A");
  assert.equal(app.master.getRoot("batch.style_og_min"), 1.056);
  assert.equal(app.master.getRoot("batch.style_abv_max"), 7.5);
  assert.equal(app.master.getRoot("batch.fermentation"), "ale");

  const aa = app.master.getRoot("batch.apparent_attenuation");
  const abv = app.master.getRoot("batch.target_abv");
  assert.ok(typeof aa === "number" && aa > 0 && aa <= 1);
  assert.ok(typeof abv === "number" && abv >= 5.5 && abv <= 7.5);
});

test("clearStyleSelection clears the style id and resets fermentation", () => {
  const app = createStepApp();
  app.boot();
  app.selectStyle("21A");
  app.clearStyleSelection();
  app.compute();

  assert.equal(app.master.getRoot("batch.style_id"), "");
  assert.equal(app.master.getRoot("batch.fermentation"), "ale");
});

test("selecting a stats-less style does not seed fermentation targets", () => {
  const app = createStepApp();
  app.boot();
  app.selectStyle("34C");
  app.compute();

  assert.equal(app.master.getRoot("batch.style_id"), "34C");
  assert.equal(app.master.getRoot("batch.style_og_min"), undefined);
  assert.equal(app.master.getRoot("batch.apparent_attenuation"), undefined);
});

test("the picker initialises to the envelope centroid and seeds the roots", () => {
  const app = createStepApp();
  app.boot();
  app.selectStyle("21B Black IPA");
  app.compute();

  assert.ok(app.styleRegion.length >= 3);
  assert.ok(app.styleExtract);
  assert.ok(app.styleSafestPoint);
  const info = app.styleTargetInfo;
  assert.ok(info.og > 1 && info.og < 1.15);
  assert.ok(info.fg > 1 && info.fg < info.og);
  assert.ok(Math.abs(app.master.getRoot("batch.apparent_attenuation") - info.aa) < 1e-6);
  assert.ok(Math.abs(app.master.getRoot("batch.target_abv") - info.abv) < 1e-6);
});

test("moving the OE slider clamps into the region and re-seeds", () => {
  const app = createStepApp();
  app.boot();
  app.selectStyle("21B Black IPA");
  app.compute();

  const bounds = app.styleOeBounds;
  app.setStyleTargetOe(bounds[1] + 100); // beyond the region's OE max at the current AE
  assert.ok(app.styleExtract.oe <= bounds[1] + 1e-6);
  assert.ok(app.styleExtract.oe >= bounds[0] - 1e-6);
  const info = app.styleTargetInfo;
  assert.ok(Math.abs(app.master.getRoot("batch.apparent_attenuation") - info.aa) < 1e-6);
});

test("resetStyleTarget returns to the envelope centroid", () => {
  const app = createStepApp();
  app.boot();
  app.selectStyle("21B Black IPA");
  app.compute();
  const centroidOe = app.styleExtract.oe;

  app.setStyleTargetOe(app.styleOeBounds[0]);
  assert.notEqual(app.styleExtract.oe, centroidOe);

  app.resetStyleTarget();
  assert.ok(Math.abs(app.styleExtract.oe - centroidOe) < 1e-6);
});

test("the preview preserves the region's aspect ratio", () => {
  const app = createStepApp();
  app.boot();
  app.selectStyle("21B Black IPA");
  app.compute();

  const points = app.stylePreview.polygon.split(" ").map((p) => p.split(",").map(Number));
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const boxAspect = (Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys));

  const region = app.styleRegion;
  const rxs = region.map(([x]) => x);
  const rys = region.map(([, y]) => y);
  const regionAspect = (Math.max(...rxs) - Math.min(...rxs)) / (Math.max(...rys) - Math.min(...rys));

  assert.ok(Math.abs(boxAspect - regionAspect) < 0.02);
});

test("editing the envelope reshapes the region and keeps the target in-region", () => {
  const app = createStepApp();
  app.boot();
  app.selectStyle("21B Black IPA");
  app.compute();

  app.setRoot("batch.style_og_max", 1.1);
  app.compute();
  assert.ok(app.styleRegion.length >= 3);
  assert.ok(app.styleExtract);
  assert.ok(app.master.getRoot("batch.style_og_max") === 1.1);
});

test("target sliders: SRM/IBU bounds come from the style envelope", () => {
  const app = createStepApp();
  app.boot();
  app.selectStyle("21A");
  app.compute();

  const srm = app.styleSrmBounds;
  const ibu = app.styleIbuBounds;
  assert.ok(Array.isArray(srm) && srm[0] < srm[1]);
  assert.ok(Array.isArray(ibu) && ibu[0] < ibu[1]);
  assert.equal(srm[0], app.master.getRoot("batch.style_srm_min"));
  assert.equal(ibu[1], app.master.getRoot("batch.style_ibu_max"));
});

test("target sliders: whirlpool fraction splits the IBU target", () => {
  const app = createStepApp();
  app.boot();
  app.setTargetIbu(40);
  app.setWhirlpoolFraction(0.25);

  assert.equal(app.targetIbu, 40);
  assert.equal(app.whirlpoolPctDisplay, 25);
  assert.ok(Math.abs(app.boilIbu - 30) < 1e-9);
  assert.ok(Math.abs(app.whirlpoolIbu - 10) < 1e-9);
});

test("target sliders: selecting a style seeds the midpoints", () => {
  const app = createStepApp();
  app.boot();
  app.selectStyle("21A");
  app.compute();

  const ibumin = app.master.getRoot("batch.style_ibu_min");
  const ibumax = app.master.getRoot("batch.style_ibu_max");
  assert.ok(Math.abs(app.targetIbu - (ibumin + ibumax) / 2) < 1e-9);
});

test("IBU/GU ratio uses target IBU and the computed post-boil gravity", () => {
  const app = createStepApp();
  app.boot();
  app.setTargetIbu(40);
  app.compute();

  // Offline stub sg_post_boil = 1.055 -> 55 gravity units.
  assert.ok(Math.abs(app.ibuGu - 40 / 55) < 1e-9);
  assert.equal(app.ibuGuDisplay, "0.73");
});
