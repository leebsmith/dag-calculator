import test from "node:test";
import assert from "node:assert/strict";

import { createStepApp } from "../../frontend/src/adapters/stepAdapter.js";
import { kettleBlend, ionDelta } from "../../frontend/src/adapters/cards/water.js";

test("kettleBlend reduces to the mash vector when both vessels are identical", () => {
  const mash = { calcium_ca: 60, magnesium_mg: 5, sodium_na: 10, sulfate_so4: 100, chloride_cl: 50, alkalinity_as_caco3: 40 };
  const hlt = { ...mash };
  assert.deepEqual(kettleBlend(mash, hlt, 10, 14), mash);
});

test("kettleBlend volume-weights the two treated vectors", () => {
  const mash = { calcium_ca: 100, magnesium_mg: 0, sodium_na: 0, sulfate_so4: 0, chloride_cl: 0, alkalinity_as_caco3: 0 };
  const hlt = { calcium_ca: 0, magnesium_mg: 0, sodium_na: 0, sulfate_so4: 0, chloride_cl: 0, alkalinity_as_caco3: 0 };
  assert.equal(kettleBlend(mash, hlt, 10, 10).calcium_ca, 50);
});

test("kettleBlend returns null when no water reaches the kettle", () => {
  const ions = { calcium_ca: 10, magnesium_mg: 0, sodium_na: 0, sulfate_so4: 0, chloride_cl: 0, alkalinity_as_caco3: 0 };
  assert.equal(kettleBlend(ions, ions, 0, 0), null);
});

test("ionDelta is null when either side is missing", () => {
  assert.equal(ionDelta(10, 6), 4);
  assert.equal(ionDelta(null, 6), null);
  assert.equal(ionDelta(10, undefined), null);
});

test("the water summary and brew-day instruction branch on the mode", () => {
  const app = createStepApp();
  app.boot();
  app.setRoot("water.salt_distribution", "MASH_ONLY");
  app.compute();

  assert.equal(app.waterSummary.proportional, false);
  assert.match(app.waterInstruction("dough-in"), /dose the dry grist before underletting/i);
  assert.match(app.waterInstruction("batch-sparge"), /no salts in the HLT/i);

  app.setRoot("water.salt_distribution", "PROPORTIONAL");
  app.compute();
  assert.equal(app.waterSummary.proportional, true);
  assert.match(app.waterInstruction("batch-sparge"), /add .* to the HLT/i);
  assert.match(app.waterInstruction("brew-day-setup"), /metabisulfite/i);
});

test("the brew-day payload carries the derived water instruction", () => {
  const app = createStepApp();
  app.boot();
  app.toggleBrewDayStep("dough-in", true);
  app.compute();

  const sections = app.brewDayPayload.sections;
  const mashing = sections.find((s) => s.id === "mashing");
  const doughIn = mashing.steps.find((row) => row.id === "dough-in");
  assert.match(doughIn.instructions, /dose the dry grist before underletting/i);
});
