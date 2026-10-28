import test from "node:test";
import assert from "node:assert/strict";

import { makeTraceMaltRow } from "../../frontend/src/views/producer/traceMaltRows.js";

const MALT = {
  id: "roast-barley",
  name: "Roast Barley",
  category: "ROASTED",
  yield_fraction: 0.7,
  yield_basis: "real",
  yield_provenance: { kind: "prior" },
  fermentability_fraction: 0,
  fermentability_provenance: { bound: "min" },
  fermentability_basis: "apparent",
  fermentability_method: "vendor",
  color_lovibond: 500,
  notes: "Sharp",
  moisture_fraction: 0.04,
  standard_malt: "roasted-barley",
};

test("makeTraceMaltRow copies the catalogue provenance onto a zero-mass row", () => {
  assert.deepEqual(makeTraceMaltRow(MALT), {
    catalog_id: "roast-barley",
    name: "Roast Barley",
    category: "ROASTED",
    mass_kg: 0,
    yield_fraction: 0.7,
    yield_basis: "real",
    yield_provenance: { kind: "prior" },
    fermentability_fraction: 0,
    fermentability_provenance: { bound: "min" },
    fermentability_basis: "apparent",
    fermentability_method: "vendor",
    color_lovibond: 500,
    notes: "Sharp",
  });
});

test("makeTraceMaltRow carries no parts, percent, or moisture", () => {
  const row = makeTraceMaltRow(MALT);

  assert.deepEqual(Object.keys(row).sort(), [
    "catalog_id",
    "category",
    "color_lovibond",
    "fermentability_basis",
    "fermentability_fraction",
    "fermentability_method",
    "fermentability_provenance",
    "mass_kg",
    "name",
    "notes",
    "yield_basis",
    "yield_fraction",
    "yield_provenance",
  ]);
  assert.equal("parts" in row, false);
  assert.equal("moisture_fraction" in row, false);
});

test("makeTraceMaltRow keeps a missing catalogue figure missing", () => {
  const row = makeTraceMaltRow({ id: "custom", name: "Custom" });

  assert.equal(row.mass_kg, 0);
  assert.equal(row.color_lovibond, undefined);
  assert.equal(row.fermentability_fraction, undefined);
});
