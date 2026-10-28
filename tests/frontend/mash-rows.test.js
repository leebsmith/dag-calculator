import test from "node:test";
import assert from "node:assert/strict";

import {
  canonicalRestRows,
  isLgrBelowFloor,
  isRestOutsideBand,
  lgrSummary,
  mashTimeLabel,
  mashTimeSummaryLabel,
  materializeMashRests,
  restMinutes,
  restLabel,
  restPurposeLabel,
  restTempRangeLabel,
  temperatureLabel,
  thicknessLabel,
  wholeTemperature,
} from "../../frontend/src/views/producer/mashRows.js";
import { MASH_OUT_REST } from "../../frontend/src/views/mash.js";

test("mashRows: rest names and purposes come from the canon", () => {
  assert.equal(restLabel("mash_out"), "Mash-out");
  assert.equal(restLabel("beta_amylase"), "Beta-Amylase Rest");
  assert.equal(restLabel("made_up"), "made_up");
  assert.equal(restPurposeLabel("made_up"), "");
  assert.ok(restPurposeLabel("protein"));
});

test("mashRows: the recommended band is advice, never a gate", () => {
  assert.equal(isRestOutsideBand("beta_amylase", 63.5), false);
  assert.equal(isRestOutsideBand("beta_amylase", 61), true);
  assert.equal(isRestOutsideBand("beta_amylase", 66), true);
  assert.equal(isRestOutsideBand("made_up", 90), false);
  assert.equal(isRestOutsideBand("beta_amylase", null), false);
  assert.equal(isRestOutsideBand("beta_amylase", NaN), false);
});

test("mashRows: a materialized schedule is canonical order with mash-out on", () => {
  const rows = materializeMashRests([
    { rest_id: "dough_in", enabled: true, use_temp_c: 67, duration_min: 0 },
    { rest_id: "beta_amylase", enabled: true, use_temp_c: 63, duration_min: 40 },
  ]);

  assert.equal(rows[0].rest_id, "phytase");
  assert.equal(rows[rows.length - 1].rest_id, "mash_out");
  assert.deepEqual(
    rows.map((r) => r.rest_id).sort(),
    ["alpha_amylase", "beta_alpha_amylase", "beta_amylase", "beta_glucan", "ferulic", "mash_out", "phytase", "protein"]
  );
  assert.equal(rows.some((r) => r.rest_id === "dough_in"), false);

  const beta = rows.find((r) => r.rest_id === "beta_amylase");
  assert.equal(beta.enabled, true);
  assert.equal(beta.use_temp_c, 63);
  assert.equal(beta.duration_min, 40);

  const protein = rows.find((r) => r.rest_id === "protein");
  assert.equal(protein.enabled, false);
  assert.equal(protein.use_temp_c, null);
  assert.equal(protein.duration_min, null);

  const mashOut = rows.find((r) => r.rest_id === "mash_out");
  assert.equal(mashOut.enabled, true);
  assert.equal(mashOut.duration_min, MASH_OUT_REST.default_duration_min);

  assert.deepEqual(
    materializeMashRests(undefined).map((r) => r.rest_id),
    rows.map((r) => r.rest_id)
  );
});

test("mashRows: the canonical table joins the authored schedule onto the canon", () => {
  const rows = canonicalRestRows([
    { rest_id: "protein", enabled: true, use_temp_c: 52, duration_min: 15 },
  ]);

  assert.equal(rows[0].rest_id, "phytase");
  assert.equal(rows[0].name, "Phytase / Acid Rest");
  assert.equal(rows[0].enabled, false);
  assert.equal(rows[0].use_temp_c, null);

  const protein = rows.find((r) => r.rest_id === "protein");
  assert.equal(protein.enabled, true);
  assert.equal(protein.use_temp_c, 52);
  assert.equal(protein.duration_min, 15);

  assert.equal(rows.find((r) => r.rest_id === "mash_out").enabled, true);
});

test("mashRows: display-unit labels round the way the card reads them", () => {
  assert.equal(temperatureLabel(67), "67.0");
  assert.equal(temperatureLabel(null), "");
  assert.equal(temperatureLabel(NaN), "");

  assert.equal(thicknessLabel(2.5), "2.50");
  assert.equal(thicknessLabel(undefined), "");

  assert.equal(wholeTemperature(62.4), 62);
  assert.equal(wholeTemperature(null), "");

  assert.equal(restTempRangeLabel(62, 65), "62–65");
  assert.equal(restTempRangeLabel(62, null), "");
  assert.equal(restTempRangeLabel(NaN, 65), "");
});

test("mashRows: the time readouts are whole minutes", () => {
  assert.equal(mashTimeLabel(83.77777777777777), "84");
  assert.equal(mashTimeLabel(null), "");

  assert.equal(restMinutes(83.77777777777777, 13.777777777777779), 70);
  assert.equal(restMinutes(10, 20), 0);
  assert.equal(restMinutes(null, 5), null);

  assert.equal(mashTimeSummaryLabel(13.777777777777779, 70), "incl. 14 min ramp (70 min rests)");
  assert.equal(mashTimeSummaryLabel(null, 70), "");
  assert.equal(mashTimeSummaryLabel(14, null), "");
});

test("mashRows: the LGR floor comparison and the summary line", () => {
  assert.equal(isLgrBelowFloor(2.2, 2.5), true);
  assert.equal(isLgrBelowFloor(2.5, 2.5), false);
  assert.equal(isLgrBelowFloor(2.2, null), false);
  assert.equal(isLgrBelowFloor(null, 2.5), false);

  assert.equal(
    lgrSummary("2.50", "L/kg", "2.60"),
    "Mash thickness 2.50 L/kg · equipment minimum 2.60 L/kg"
  );
  assert.equal(lgrSummary("2.50", "L/kg", ""), "Mash thickness 2.50 L/kg");
  assert.equal(lgrSummary("", "L/kg", "2.60"), "");
});
