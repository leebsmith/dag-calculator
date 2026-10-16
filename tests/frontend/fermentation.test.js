import test from "node:test";
import assert from "node:assert/strict";

import { styleCentroid, sgToPlato, platoToSg, cutaiaAbv } from "../../frontend/src/engine/fermentation.js";

test("sgToPlato and platoToSg match backend reference points", () => {
  assert.ok(Math.abs(sgToPlato(1.0)) < 0.01);
  assert.ok(Math.abs(platoToSg(12.0) - 1.0484) < 1e-3);
  assert.ok(Math.abs(sgToPlato(platoToSg(12.0)) - 12.0) < 0.05);
});

test("cutaiaAbv matches backend calculate_abv_and_attenuation", () => {
  assert.ok(Math.abs(cutaiaAbv(15.146, 2.875) - 6.687) < 1e-2);
  assert.ok(Math.abs(cutaiaAbv(8.154, 1.003) - 3.642) < 1e-2);
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
