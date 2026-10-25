import test from "node:test";
import assert from "node:assert/strict";

import { createTestApp } from "./appHelpers.js";
import { sgToPlato, platoToSg, cutaiaAbv } from "../../frontend/src/engine/fermentation.js";

test("realized FG and ABV derived nodes match the canonical fermentation math", () => {
  const app = createTestApp();
  app.boot();
  app.compute();

  const og = app.freezePayload().valuation["solver.batch"].sg_post_boil; // stub: 1.055
  const aa = app.freezePayload().valuation["solver.batch"].aa_batch; // stub aa_batch: 0.75
  const oe = sgToPlato(og);
  const ae = oe * (1 - aa);

  const valuation = app.freezePayload().valuation;
  const fg = valuation["batch.realized_fg"];
  const abv = valuation["batch.realized_abv"];

  assert.equal(typeof fg, "number");
  assert.equal(typeof abv, "number");
  assert.ok(Math.abs(fg - platoToSg(ae)) < 1e-9);
  assert.ok(Math.abs(abv - cutaiaAbv(oe, ae)) < 1e-9);
});
