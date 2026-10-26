// Ingredient-table provenance markers and the FG floor.
//
// A displayed figure must say whether it is measured, converted, assumed, or a
// published minimum, and a sub-gravity apparent extract must read as a floor
// rather than a number the model never produced.

import test from "node:test";
import assert from "node:assert/strict";

import { valuateCollection } from "../../frontend/src/views/producer/collection.js";
import { valuateScalar } from "../../frontend/src/views/producer/scalar.js";
import { figureMarkFor } from "../../frontend/src/views/producer/table.js";
import { nonlinearFns } from "../../frontend/src/views/producer/valuation.js";
import { callArtifactFunction } from "../../frontend/src/engine/artifactFunctions.js";
import { createTestApp } from "./appHelpers.js";
import { loadArtifact } from "./helpers.js";

const artifact = loadArtifact();

const CITATION = { kind: "vendor", bound: "point", vendor: "Bairds" };

function collectionRow(overrides) {
  return { fermentability_fraction: 0.87, ...overrides };
}

function marked(row) {
  const field = {
    id: "grist.major_malts",
    control: "collection-table",
    columns: [
      {
        id: "fermentability_fraction",
        dimension: "percentage",
        displayUnit: "pct",
        decimals: 1,
      },
    ],
  };
  const engine = { get: () => [row] };
  return valuateCollection(field, engine, artifact, {}, {}).rows[0].fermentability_fraction;
}

test("captured real figure is rendered as data", () => {
  assert.equal(
    marked(
      collectionRow({
        fermentability_fraction: 0.87,
        fermentability_basis: "real",
        fermentability_provenance: CITATION,
      })
    ),
    "87.0"
  );
});

test("captured apparent figure is marked as converted", () => {
  const marker = figureMarkFor("fermentability_fraction", {
    fermentability_basis: "apparent",
    fermentability_provenance: CITATION,
  });
  assert.equal(marker, "≈");
  assert.equal(
    marked(
      collectionRow({
        fermentability_fraction: 0.635,
        fermentability_basis: "apparent",
        fermentability_provenance: CITATION,
      })
    ),
    "≈63.5"
  );
});

test("a published minimum reads as a floor", () => {
  assert.equal(
    marked(
      collectionRow({
        fermentability_fraction: 0.87,
        fermentability_basis: "real",
        fermentability_provenance: { ...CITATION, bound: "min" },
      })
    ),
    "≥87.0"
  );
});

test("an assumed prior is marked as an assumption", () => {
  assert.equal(
    marked(
      collectionRow({
        fermentability_fraction: 0.643,
        fermentability_provenance: { kind: "prior", bound: "point" },
      })
    ),
    "~64.3"
  );
});

test("a yeast cap and a converted minimum compose", () => {
  assert.equal(
    marked(
      collectionRow({
        fermentability_fraction: 0.635,
        fermentability_basis: "apparent",
        fermentability_provenance: { ...CITATION, bound: "min" },
      })
    ),
    "≥≈63.5"
  );
});

test("the realized FG floors at 1.000 when apparent extract is not positive", () => {
  const field = { id: "batch.realized_fg", dimension: "gravity", control: "readout" };
  const engine = {
    resolve: () => 0.997,
    get: () => null,
    hasRoot: () => false,
    call: (id, args) => callArtifactFunction(id, args),
  };
  const out = valuateScalar(
    field,
    engine,
    { artifact, ui: { unitMode: { gravity: "SG" } } },
    nonlinearFns(artifact, engine)
  );

  assert.equal(out.display, "≤ 1.000");
  assert.equal(out.floored, true);
  assert.match(out.hint, /floored/);
});

test("the floor follows the display unit (Plato shows ≤ 0.0)", () => {
  const field = { id: "batch.realized_fg", dimension: "gravity", control: "readout" };
  const engine = {
    resolve: () => 0.997,
    get: () => null,
    hasRoot: () => false,
    call: (id, args) => callArtifactFunction(id, args),
  };
  const out = valuateScalar(
    field,
    engine,
    { artifact, ui: { unitMode: { gravity: "Plato" } } },
    nonlinearFns(artifact, engine)
  );

  assert.equal(out.display, "≤ 0.0");
});

test("a normal realized FG is displayed unfloored", () => {
  const field = { id: "batch.realized_fg", dimension: "gravity", control: "readout" };
  const engine = {
    resolve: () => 1.012,
    get: () => null,
    hasRoot: () => false,
    call: (id, args) => callArtifactFunction(id, args),
  };
  const out = valuateScalar(
    field,
    engine,
    { artifact, ui: { unitMode: { gravity: "SG" } } },
    nonlinearFns(artifact, engine)
  );

  assert.equal(out.display, "1.012");
  assert.equal(out.floored, undefined);
});

test("the card copies provenance and basis onto batch rows and converts apparent F", async () => {
  const app = createTestApp();
  await app.boot();

  app.openMaltEditor();
  app.addCatalogMalt("pilsen-md");
  app.saveMaltEditor();
  app.compute();

  const rows = app.engine.get("grist.major_malts");
  const row = rows.find((r) => r.catalog_id === "pilsen-md");
  assert.equal(row.fermentability_basis, "apparent");
  assert.equal(row.fermentability_method, "Final attenuation");
  assert.equal(row.fermentability_provenance.bound, "min");
  assert.match(app.maltFermentable(row), /^≥≈/);

  const index = rows.indexOf(row);
  const request = app.engine.boundaryRequest("solver.batch");
  const sent = request.inputs.grain_bill[index].fermentability_i;
  assert.ok(sent < 0.70, `expected a real fraction, got ${sent}`);
  assert.ok(Math.abs(sent - 0.635) < 5e-3);
});

test("an unknown STA1 status is never silent", async () => {
  const app = createTestApp();
  await app.boot();

  app.selectYeast("fermentis-safale-american-ale-us-05");
  app.compute();
  assert.ok(app.findingsById.sta1_unknown, "unknown status must surface");
  assert.equal(app.findingsById.sta1_unknown.severity, "warning");

  app.selectYeast("white-labs-california-ale-wlp001");
  app.compute();
  assert.equal(app.findingsById.sta1_unknown, undefined, "negative is silent");

  app.selectYeast("the-yeast-bay-dry-belgian-ale-wlp4025");
  app.compute();
  assert.equal(app.findingsById.sta1_unknown, undefined, "positive is silent");
});
