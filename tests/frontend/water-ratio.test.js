import test from "node:test";
import assert from "node:assert/strict";

import { sulfateChloride, ratioReadout } from "../../frontend/src/views/waterRatio.js";
import { createStepApp } from "../../frontend/src/adapters/stepAdapter.js";

const IONS = { calcium_ca: 0, magnesium_mg: 0, sodium_na: 0, sulfate_so4: 0, chloride_cl: 0, alkalinity_as_caco3: 0 };

test("sulfateChloride divides sulfate by chloride and guards zero chloride", () => {
  assert.equal(sulfateChloride({ ...IONS, sulfate_so4: 100, chloride_cl: 50 }), 2);
  assert.equal(sulfateChloride({ ...IONS, sulfate_so4: 100, chloride_cl: 0 }), null);
  assert.equal(sulfateChloride(null), null);
});

test("ratioReadout emits no intent when unspecified and a factor when specified", () => {
  const kettle = { ...IONS, sulfate_so4: 100, chloride_cl: 50 };
  const unspecified = ratioReadout(kettle, "unspecified", 3.0);
  assert.equal(unspecified.asSolved, 2);
  assert.equal(unspecified.intent, null);
  assert.equal(unspecified.intentText, null);
  assert.equal(unspecified.deltaFactor, null);

  const specified = ratioReadout(kettle, "specified", 4.0);
  assert.equal(specified.intent, 4.0);
  assert.equal(specified.deltaFactor, 0.5);
  assert.equal(specified.deltaFactorText, "0.50×");
});

test("the water summary exposes the kettle ratio and basis for both modes", () => {
  const app = createStepApp();
  app.boot();
  app.setRoot("batch.sulfate_chloride_target_mode", "specified");
  app.setRoot("batch.sulfate_chloride_target_ratio", 3);
  app.setRoot("water.salt_distribution", "PROPORTIONAL");
  app.compute();

  assert.match(app.waterSummary.ratioBasis, /split mode/);
  assert.equal(typeof app.waterSummary.ratio.asSolved, "number");
  assert.match(app.waterSummary.ratioLine, /intent →/);

  app.setRoot("water.salt_distribution", "MASH_ONLY");
  app.compute();
  assert.match(app.waterSummary.ratioBasis, /sparge untreated, acid only/);
});
