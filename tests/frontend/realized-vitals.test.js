import test from "node:test";
import assert from "node:assert/strict";

import { createStepApp } from "../../frontend/src/adapters/stepAdapter.js";
import { sgToPlato, platoToSg, cutaiaAbv } from "../../frontend/src/engine/fermentation.js";

test("realized FG and ABV derived nodes match the canonical fermentation math", () => {
  const app = createStepApp();
  app.boot();
  app.compute();

  const og = app.freezePayload().valuation["solver.batch"].sg_post_boil; // stub: 1.055
  const aa = app.freezePayload().valuation["batch.apparent_attenuation"]; // default: 0.75
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

test("realized FG and ABV track an edited apparent attenuation", () => {
  const app = createStepApp();
  app.boot();
  app.setRoot("batch.apparent_attenuation", 0.8);
  app.compute();

  const valuation = app.freezePayload().valuation;
  const og = valuation["solver.batch"].sg_post_boil;
  const oe = sgToPlato(og);
  const ae = oe * (1 - 0.8);

  assert.ok(Math.abs(valuation["batch.realized_fg"] - platoToSg(ae)) < 1e-9);
  assert.ok(Math.abs(valuation["batch.realized_abv"] - cutaiaAbv(oe, ae)) < 1e-9);
});
