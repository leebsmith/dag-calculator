import test from "node:test";
import assert from "node:assert/strict";

import { ratioReadout } from "../../frontend/src/views/waterRatio.js";
import { createTestApp } from "./appHelpers.js";

test("ratioReadout compares the kettle ratio to the target-implied ratio", () => {
  const compared = ratioReadout(2, 3);
  assert.equal(compared.asSolved, 2);
  assert.equal(compared.target, 3);
  assert.equal(compared.asSolvedText, "2.0 : 1");
  assert.equal(compared.targetText, "3.0 : 1");
  assert.equal(compared.deltaFactorText, "0.67×");

  const asSolvedOnly = ratioReadout(2, null);
  assert.equal(asSolvedOnly.target, null);
  assert.equal(asSolvedOnly.targetText, null);
  assert.equal(asSolvedOnly.deltaFactor, null);
  assert.equal(asSolvedOnly.asSolvedText, "2.0 : 1");
});

test("the water summary compares against the target only when both flavor ions are checked with values", () => {
  const app = createTestApp();
  app.boot();
  app.selectWaterTarget("freeform");
  app.setRoot("water.salt_distribution", "PROPORTIONAL");
  app.toggleWaterTarget("so4");
  app.editWaterTarget("so4", "120");
  app.toggleWaterTarget("cl");
  app.editWaterTarget("cl", "40");
  app.compute();

  assert.match(app.waterSummary.ratioBasis, /split mode/);
  assert.equal(typeof app.waterSummary.ratio.asSolved, "number");
  assert.match(app.waterSummary.ratioLine, /target →/);
  assert.doesNotMatch(app.waterSummary.ratioLine, /intent/);

  app.selectWaterTarget("none");
  app.compute();
  assert.doesNotMatch(app.waterSummary.ratioLine, /target →/);

  app.selectWaterTarget("freeform");
  app.toggleWaterTarget("so4");
  app.editWaterTarget("so4", "120");
  app.setRoot("water.salt_distribution", "MASH_ONLY");
  app.compute();
  assert.doesNotMatch(app.waterSummary.ratioLine, /target →/, "one flavor ion is not a ratio");
  assert.match(app.waterSummary.ratioBasis, /sparge untreated, acid only/);
});
