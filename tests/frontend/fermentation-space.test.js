// The fermentation-space plot: axes, contours, the composition locus, and the
// pinned locus. The geometry is host-side, so these are structural assertions.

import test from "node:test";
import assert from "node:assert/strict";

import { createTestApp } from "./appHelpers.js";
import { createReferenceCache } from "../../frontend/src/store/referenceCache.js";

const cache = createReferenceCache();

async function styledApp(styleId = "21B Black IPA") {
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

function coordinates(path) {
  return [...path.matchAll(/([\d.-]+)\s+([\d.-]+)/g)].map(([, x, y]) => [
    Number(x),
    Number(y),
  ]);
}

test("the plane carries axes, contours, a locus, and a pinned locus", async () => {
  const app = await styledApp();
  const preview = app.stylePreview;

  assert.equal(preview.ticks.x.length, 5);
  assert.equal(preview.ticks.y.length, 5);
  assert.match(preview.ticks.x[0].label, /^\d+\.\d$/);
  assert.ok(preview.tickMarks.length > 0);

  assert.ok(preview.contours.length > 0, "iso-ABV contours");
  assert.ok((preview.contours.match(/M/g) ?? []).length >= 3, "several contours");
  assert.ok(preview.locus.length > 0, "composition locus");
  assert.ok(preview.pinPath.length > 0, "pinned locus");
  assert.match(preview.summary, /OG \d\.\d{3}, FG \d\.\d{3}, ABV \d/);
});

test("every plotted coordinate stays inside the viewBox", async () => {
  const app = await styledApp();
  const preview = app.stylePreview;

  for (const path of [preview.contours, preview.locus, preview.pinPath]) {
    for (const [x, y] of coordinates(path)) {
      assert.ok(x >= -0.5 && x <= preview.width + 0.5, `x ${x} outside`);
      assert.ok(y >= -0.5 && y <= preview.height + 0.5, `y ${y} outside`);
    }
  }
  for (const [x, y] of coordinates(preview.polygon.replace(/,/g, " "))) {
    assert.ok(x >= 0 && x <= preview.width);
    assert.ok(y >= 0 && y <= preview.height);
  }
});

test("the composition locus passes through the solved point", async () => {
  const app = await styledApp();
  const preview = app.stylePreview;
  const markerX = Number(preview.marker.x);
  const markerY = Number(preview.marker.y);

  const points = coordinates(preview.locus).sort((a, b) => a[0] - b[0]);
  const left = points.filter(([x]) => x <= markerX).at(-1);
  const right = points.find(([x]) => x >= markerX);
  assert.ok(left && right, "the dot lies inside the sampled span");
  const t = (markerX - left[0]) / (right[0] - left[0] || 1);
  const locusY = left[1] + (right[1] - left[1]) * t;
  assert.ok(Math.abs(locusY - markerY) < 1, "the locus passes through the dot");
});

test("the pinned locus follows the pin kind", async () => {
  const app = await styledApp();

  app.setScalePin("og");
  app.compute();
  const vertical = coordinates(app.stylePreview.pinPath);
  assert.equal(vertical.length, 2);
  assert.equal(vertical[0][0], vertical[1][0], "OG is a vertical line");

  app.setScalePin("fg");
  app.compute();
  const horizontal = coordinates(app.stylePreview.pinPath);
  assert.equal(horizontal.length, 2);
  assert.equal(horizontal[0][1], horizontal[1][1], "FG is a horizontal line");

  app.setScalePin("abv");
  app.compute();
  assert.ok(coordinates(app.stylePreview.pinPath).length > 2, "ABV is a contour");
  assert.match(app.stylePreview.pinLabel, /^ABV [\d.]+%$/);
});

test("the pinned label names the pin's own target", async () => {
  const app = await styledApp();

  app.setScalePin("og");
  app.setScaleTarget("1.0675");
  app.compute();
  assert.equal(app.stylePreview.pinLabel, "OG 1.067");

  app.setScalePin("fg");
  app.setScaleTarget("1.014");
  app.compute();
  assert.equal(app.stylePreview.pinLabel, "FG 1.014");
});
