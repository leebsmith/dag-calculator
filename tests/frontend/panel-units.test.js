import test from "node:test";
import assert from "node:assert/strict";

import { artifact } from "../guards/util.js";
import { createFindingFormatter } from "../../frontend/src/views/producer/finding.js";
import { buildPanel } from "../../frontend/src/views/panelView.js";

const ARTIFACT = artifact();
const format = (unitMode = { mass: "lb", volume: "gal" }) =>
  createFindingFormatter(ARTIFACT, {}, { unitMode });

test("a forced unit beats the user's preference for a dose", () => {
  const units = format();
  assert.equal(units({ value: 0.00907, dimension: "mass" }), "0.02 lb");
  assert.equal(units({ value: 0.00907, dimension: "mass", unit: "g" }), "9.1 g");
  assert.equal(units({ value: 0.0001, dimension: "volume", unit: "ml" }), "0.1 mL");
});

test("a unit the dimension does not have is ignored", () => {
  const units = format();
  assert.equal(units({ value: 0.00907, dimension: "mass", unit: "ml" }), "0.02 lb");
});

test("the water group lists nonzero doses in grams and millilitres", () => {
  const doses = {
    "solver.water.prescription.mash_ph_status": "OPTIMAL",
    "solver.water.prescription.residual_hlt_water_l": 25,
    "batch.sparge_salted_volume": 40,
    "solver.water.mash_additions.gypsum_kg": 0.00907,
    "solver.water.mash_additions.cacl2_kg": 0,
    "solver.water.mash_additions.acid_l": 0.0004,
    "solver.water.sparge_additions.acid_l": 0,
  };
  const panel = buildPanel({
    artifact: ARTIFACT,
    read: (path) => doses[path] ?? null,
    format: format(),
  });
  const water = panel.groups.find((group) => group.id === "water");
  const rows = Object.fromEntries(water.rows.map((row) => [row.label, row.display]));

  assert.equal(rows["Mash gypsum"], "9.1 g");
  assert.equal(rows["Mash acid"], "0.4 mL");
  assert.equal(rows["pH status"], "Optimal");
  assert.equal("Mash calcium chloride" in rows, false, "a zero dose is not listed");
  assert.equal("Sparge acid" in rows, false, "a zero dose is not listed");
});
