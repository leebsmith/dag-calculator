import test from "node:test";
import assert from "node:assert/strict";

import {
  chebyshevCenter,
  cutaiaAbv,
  feasibleVertices,
} from "../../frontend/src/engine/fermentation.js";
import { stylePlotModel } from "../../frontend/src/views/producer/stylePlot.js";

const ENVELOPE = {
  ogMin: 1.056,
  ogMax: 1.075,
  fgMin: 1.01,
  fgMax: 1.018,
  abvMin: 5.5,
  abvMax: 7.5,
};

function fixture({ pin = "abv", target = 6.5 } = {}) {
  const region = feasibleVertices(ENVELOPE);
  const safestPoint = chebyshevCenter(region);
  const point = { oe: safestPoint.oe, ae: safestPoint.ae };
  return { region, safestPoint, point, pin, target };
}

function coordinate(value) {
  const numeric = Number(value);
  assert.ok(Number.isFinite(numeric), `"${value}" is not a coordinate`);
  return numeric;
}

test("the plot model projects the region, the point, and every tick", () => {
  const input = fixture();
  const model = stylePlotModel(input);

  assert.equal(model.width, 376);
  assert.equal(model.height, 366);
  assert.deepEqual(model.plot, { x: 44, y: 12, w: 320, h: 320 });
  assert.equal(model.polygon.split(" ").length, input.region.length);

  for (const axis of ["x", "y"]) {
    assert.equal(model.ticks[axis].length, 5);
    for (const tick of model.ticks[axis]) {
      assert.equal(typeof tick.label, "string");
      coordinate(tick.x);
      coordinate(tick.y);
    }
  }

  const markerX = coordinate(model.marker.x);
  const markerY = coordinate(model.marker.y);
  const safestX = coordinate(model.safest.x);
  const safestY = coordinate(model.safest.y);
  for (const [x, y] of [
    [markerX, markerY],
    [safestX, safestY],
  ]) {
    assert.ok(x >= model.plot.x && x <= model.plot.x + model.plot.w);
    assert.ok(y >= model.plot.y && y <= model.plot.y + model.plot.h);
  }

  assert.match(model.summary, /^Fermentation space: OG 1\.\d{3}, FG 1\.\d{3}, ABV \d+\.\d%/);
  assert.match(model.summary, /Contours are iso-ABV every 1%/);
  assert.ok(model.contours.startsWith("M"));
  assert.ok(model.locus.startsWith("M"));
});

test("every integer ABV in the window keeps its own contour", () => {
  const envelope = {
    ogMin: 1.028,
    ogMax: 1.1,
    fgMin: 1.004,
    fgMax: 1.035,
    abvMin: 2.5,
    abvMax: 11.5,
  };
  const region = feasibleVertices(envelope);
  const safestPoint = chebyshevCenter(region);
  const model = stylePlotModel({
    region,
    point: { oe: safestPoint.oe, ae: safestPoint.ae },
    safestPoint,
    pin: "abv",
    target: 6.5,
  });

  const abvs = region.map(([oe, ae]) => cutaiaAbv(oe, ae));
  const integers = Math.floor(Math.max(...abvs)) - Math.ceil(Math.min(...abvs)) + 1;
  assert.ok(integers > 6);
  assert.ok((model.contours.match(/M/g) ?? []).length >= integers);
});

test("the ABV pin draws an iso-ABV contour with its own label", () => {
  const model = stylePlotModel(fixture({ pin: "abv", target: 6.5 }));

  assert.ok(model.pinPath.startsWith("M"));
  assert.equal(model.pinLabel, "ABV 6.5%");
  assert.equal(model.pinLabelAnchor, "middle");
});

test("the OG pin draws a vertical line and the FG pin a horizontal one", () => {
  const og = stylePlotModel(fixture({ pin: "og", target: 1.06 }));
  assert.match(og.pinPath, /^M[\d.]+ 12 L[\d.]+ 332$/);
  assert.equal(og.pinLabel, "OG 1.060");
  assert.equal(og.pinLabelAnchor, "start");

  const fg = stylePlotModel(fixture({ pin: "fg", target: 1.014 }));
  assert.match(fg.pinPath, /^M44 [\d.]+ L364 [\d.]+$/);
  assert.equal(fg.pinLabel, "FG 1.014");
  assert.equal(fg.pinLabelAnchor, "end");
});

test("an unpinned plot has no pin geometry", () => {
  const model = stylePlotModel(fixture({ target: null }));
  assert.equal(model.pinPath, "");
  assert.equal(model.pinLabel, "");
});

test("a degenerate region or a missing point draws nothing", () => {
  const input = fixture();
  assert.equal(stylePlotModel({ ...input, region: input.region.slice(0, 2) }), null);
  assert.equal(stylePlotModel({ ...input, region: null }), null);
  assert.equal(stylePlotModel({ ...input, point: null }), null);
  assert.equal(stylePlotModel({ ...input, safestPoint: null }), null);
});
