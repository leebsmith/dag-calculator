import test from "node:test";
import assert from "node:assert/strict";

import { styleCentroid, sgToPlato, platoToSg, cutaiaAbv, apparentToRealAttenuation } from "../../frontend/src/engine/fermentation.js";
import {
  feasibleVertices,
  pointInRegion,
  oeSliceAt,
  aeSliceAt,
  edgeMargin,
  chebyshevCenter,
  targetFromExtract,
  extractFromTarget,
  limitHeadroom,
} from "../../frontend/src/engine/fermentation.js";

const BLACK_IPA = { og_min: 1.05, og_max: 1.085, fg_min: 1.01, fg_max: 1.018, abv_min: 5.5, abv_max: 9 };
const ENVELOPE = { ogMin: 1.05, ogMax: 1.085, fgMin: 1.01, fgMax: 1.018, abvMin: 5.5, abvMax: 9 };


test("sgToPlato and platoToSg match backend reference points", () => {
  assert.ok(Math.abs(sgToPlato(1.0)) < 0.01);
  assert.ok(Math.abs(platoToSg(12.0) - 1.0484) < 1e-3);
  assert.ok(Math.abs(sgToPlato(platoToSg(12.0)) - 12.0) < 0.05);
});

test("cutaiaAbv matches backend calculate_abv_and_attenuation", () => {
  assert.ok(Math.abs(cutaiaAbv(15.146, 2.875) - 6.687) < 1e-2);
  assert.ok(Math.abs(cutaiaAbv(8.154, 1.003) - 3.642) < 1e-2);
});

test("apparent ingredient attenuation converts to real at 12 °P", () => {
  const cases = [
    [0.81, 0.643],
    [0.80, 0.635],
    [0.50, 0.398],
    [0.15, 0.121],
  ];
  for (const [apparent, real] of cases) {
    assert.ok(
      Math.abs(apparentToRealAttenuation(apparent) - real) < 5e-4,
      `${apparent} -> ${apparentToRealAttenuation(apparent)} (expected ~${real})`
    );
  }
  assert.ok(
    Math.abs(
      apparentToRealAttenuation(1) - (1 - 0.49681569 * (0.372 + 0.00357 * 12))
    ) < 1e-12
  );
});

test("styleCentroid lands inside the style's ABV band", () => {
  const styles = {
    "21A": { og_min: 1.056, og_max: 1.07, fg_min: 1.008, fg_max: 1.014, abv_min: 5.5, abv_max: 7.5 },
    "22C": { og_min: 1.08, og_max: 1.12, fg_min: 1.016, fg_max: 1.03, abv_min: 8.0, abv_max: 12.0 },
    "25B": { og_min: 1.048, og_max: 1.065, fg_min: 1.002, fg_max: 1.008, abv_min: 3.5, abv_max: 9.5 },
    "1A": { og_min: 1.028, og_max: 1.04, fg_min: 0.998, fg_max: 1.008, abv_min: 2.8, abv_max: 4.2 },
  };
  for (const [id, s] of Object.entries(styles)) {
    const c = styleCentroid(s);
    assert.ok(c, `${id} should have a centroid`);
    assert.ok(c.aa > 0 && c.aa <= 1, `${id} AA in (0,1]`);
    assert.ok(c.abv >= s.abv_min && c.abv <= s.abv_max, `${id} ABV within band`);
    assert.ok(c.vertices.length >= 3, `${id} has a polygon`);
  }
});

test("styleCentroid returns null for stats-less styles", () => {
  assert.equal(styleCentroid({}), null);
  assert.equal(styleCentroid({ og_min: 1.05, og_max: 1.06 }), null);
});

test("slices are consistent with region membership", () => {
  const v = feasibleVertices(ENVELOPE);
  const c = styleCentroid(BLACK_IPA);
  assert.ok(pointInRegion(v, c.oe, c.ae));
  const oeBounds = oeSliceAt(v, c.ae);
  const aeBounds = aeSliceAt(v, c.oe);
  assert.ok(c.oe >= oeBounds[0] && c.oe <= oeBounds[1]);
  assert.ok(c.ae >= aeBounds[0] && c.ae <= aeBounds[1]);
});

test("edgeMargin is ~0 on the boundary and positive inside", () => {
  const v = feasibleVertices(ENVELOPE);
  const c = styleCentroid(BLACK_IPA);
  assert.ok(edgeMargin(v, c.oe, c.ae) > 0);
  const [vx, vy] = v[0];
  assert.ok(edgeMargin(v, vx, vy) < 1e-6);
});

test("the safest point has at least the centroid's margin", () => {
  const v = feasibleVertices(ENVELOPE);
  const c = styleCentroid(BLACK_IPA);
  const safest = chebyshevCenter(v);
  assert.ok(safest);
  assert.ok(safest.radius >= edgeMargin(v, c.oe, c.ae) - 1e-6);
});

test("the safest point is central, not an end of the max-margin ridge", () => {
  const v = feasibleVertices(ENVELOPE);
  const safest = chebyshevCenter(v);
  const xs = v.map(([x]) => x);
  const midpoint = (Math.min(...xs) + Math.max(...xs)) / 2;
  assert.ok(Math.abs(safest.oe - midpoint) < 0.5);
});

test("extractFromTarget inverts targetFromExtract", () => {
  const c = styleCentroid(BLACK_IPA);
  const t = targetFromExtract(c.oe, c.ae);
  const inv = extractFromTarget(t.aa, t.abv);
  assert.ok(Math.abs(inv.oe - c.oe) < 1e-6);
  assert.ok(Math.abs(inv.ae - c.ae) < 1e-6);
});

test("limitHeadroom reports the tightest of the six style limits", () => {
  const c = styleCentroid(BLACK_IPA);
  const nearest = limitHeadroom(ENVELOPE, c.oe, c.ae);
  assert.ok(nearest);
  assert.ok(["OG min", "OG max", "FG min", "FG max", "ABV min", "ABV max"].includes(nearest.label));
  assert.ok(nearest.headroom >= 0);
});
