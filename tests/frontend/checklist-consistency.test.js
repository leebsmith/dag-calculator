import test from "node:test";
import assert from "node:assert/strict";

import { withFreshApp } from "./appHelpers.js";
import { conditionHolds } from "../../frontend/src/views/producer/checklist/conditions.js";

function checklistRows(app) {
  return app.reportFormattedTables()["batch.brew_checklist"];
}

function allText(rows) {
  return rows
    .flatMap((row) => Object.values(row))
    .map((cell) => cell?.text ?? "")
    .join("\n");
}

test("hlt_top_up_needed follows the solver top-up", () => {
  assert.equal(
    conditionHolds("hlt_top_up_needed", { get: () => ({ "hlt.v_hlt_top_up": 0 }) }),
    false
  );
  assert.equal(
    conditionHolds("hlt_top_up_needed", { get: () => ({ "hlt.v_hlt_top_up": 0.5 }) }),
    true
  );
});

test("checklist text follows the solved batch", withFreshApp(async (app) => {
  app.setUnit("temperature", "degF");
  app.setRoot("batch.hlt_starting_volume_l", 56.78117676);
  app.compute();

  const rows = checklistRows(app);
  const row = (id) => rows.find((entry) => entry.step_id.text === id);

  assert.match(row("brew-day-setup").text.text, /Add 1 crushed metabisulfite tablet/);
  assert.doesNotMatch(allText(rows), /topped up/);
  assert.equal(rows.some((entry) => entry.step_id.text === "lauter-topup"), false);
  assert.doesNotMatch(allText(rows), /IBU IBU|SRM SRM|pH \d+\.\d+ pH/);
  assert.doesNotMatch(row("mash-out").text.text, / C for/);
  assert.match(row("mash-out").text.text, /°F/);
}));
