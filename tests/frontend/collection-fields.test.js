// Per-row computed collection `fields` (grammar §2.2): a collection may declare
// derived row values beside its authored `item_schema` fields. They evaluate per
// row, are never written into collection state, and add one graph edge per
// declared input path.

import test from "node:test";
import assert from "node:assert/strict";

import { buildGraph, createCalculator } from "../../frontend/src/engine/index.js";
import { validateCollectionFields } from "../../frontend/src/engine/units.js";
import { validateArtifact } from "../../frontend/src/engine/validate.js";

const DIMENSIONS = {
  dimensionless: { base_unit: "1", kind: "identity", units: {} },
  percentage: { base_unit: "fraction", kind: "identity", units: {} },
  mass: { base_unit: "kg", kind: "linear", units: { g: { factor: 0.001 } } },
};

const MASS_FIELD = {
  inputs: { m_grist: "solver.scale.m_grist" },
  expr: {
    op: "*",
    args: [{ ref: "row.pct" }, { ref: "m_grist" }],
  },
  output: { dimension: "mass" },
};

function synthetic({ fields = { mass_kg: MASS_FIELD }, boundaryInputs = { total: "batch.parts_total" } } = {}) {
  return {
    schema_version: 10,
    dimensions: DIMENSIONS,
    constants: {},
    taxonomies: {},
    functions: {},
    primitive_schemas: {
      row: {
        parts: { dimension: "dimensionless" },
        pct: { dimension: "percentage", domain: { gte: 0, lte: 1 } },
      },
    },
    nodes: {
      "batch.parts_total": { kind: "root", dimension: "dimensionless", default: 100 },
      "batch.rows": { kind: "collection", item_schema: "row", fields },
      "solver.scale": {
        kind: "boundary",
        binding: "scale_solver",
        resolution: "direct",
        inputs: boundaryInputs,
        outputs: { m_grist: { dimension: "mass" } },
      },
    },
  };
}

const BOUNDARIES = {
  scale_solver: ({ total }) => ({ m_grist: total / 20 }),
};

function create(doc, options = {}) {
  return createCalculator(doc, {
    boundaries: BOUNDARIES,
    collections: { "batch.rows": [{ parts: 100, pct: 0.5 }, { parts: 50, pct: 0.25 }] },
    ...options,
  });
}

test("a computed row field reads authored row values and its declared inputs", () => {
  const engine = create(synthetic());
  const rows = engine.get("batch.rows");
  assert.deepEqual(
    rows.map((row) => row.mass_kg),
    [2.5, 1.25]
  );
  assert.equal(rows[0].pct, 0.5, "authored fields survive alongside computed ones");
});

test("a computed row field may read a boundary output the boundary does not consume", () => {
  const doc = synthetic();
  const { adjacency } = buildGraph(doc);
  assert.deepEqual(adjacency["batch.rows"], ["solver.scale"]);
  assert.deepEqual(adjacency["solver.scale"], ["batch.parts_total"]);
});

test("a computed row field referencing a boundary that consumes the collection is a cycle", () => {
  const doc = synthetic({ boundaryInputs: { rows: "batch.rows" } });
  assert.throws(() => create(doc), /Cycle detected/);
});

test("computed row fields are materialized on read, never written into collection state", () => {
  const rows = [{ parts: 100, pct: 0.5 }];
  const engine = create(synthetic(), { collections: { "batch.rows": rows } });
  assert.equal(engine.get("batch.rows")[0].mass_kg, 2.5);
  assert.equal("mass_kg" in rows[0], false, "the draft's row object stays authored-only");
});

test("a computed row field recomputes when an input changes", () => {
  const engine = create(synthetic());
  assert.equal(engine.get("batch.rows")[0].mass_kg, 2.5);
  engine.setRoot("batch.parts_total", 40);
  assert.equal(engine.get("batch.rows")[0].mass_kg, 1.0);
});

test("a boolean row field is a declared value spec, not a quantity", () => {
  const fields = {
    heavy: {
      inputs: { cutoff: "batch.parts_total" },
      expr: { op: "gt", args: [{ ref: "row.parts" }, { ref: "cutoff" }] },
      output: { type: "boolean" },
    },
  };
  const engine = create(synthetic({ fields }));
  engine.setRoot("batch.parts_total", 60);
  assert.equal(engine.get("batch.rows")[0].heavy, true);
  assert.equal(engine.get("batch.rows")[1].heavy, false);
});

test("validateArtifact rejects malformed computed fields", () => {
  const shadow = synthetic();
  shadow.nodes["batch.rows"].fields = { pct: MASS_FIELD };
  assert.throws(() => validateArtifact(shadow), /shadows an item_schema field/);

  const noInputs = synthetic();
  noInputs.nodes["batch.rows"].fields = { mass_kg: { ...MASS_FIELD, inputs: null } };
  assert.throws(() => validateArtifact(noInputs), /must declare an "inputs" object/);

  const danglingInput = synthetic();
  danglingInput.nodes["batch.rows"].fields = {
    mass_kg: { ...MASS_FIELD, inputs: { m_grist: "nope.missing" } },
  };
  assert.throws(() => validateArtifact(danglingInput), /field "mass_kg" input "m_grist" references unknown/);

  const reserved = synthetic();
  reserved.nodes["batch.rows"].fields = {
    mass_kg: { ...MASS_FIELD, inputs: { "row.pct": "batch.parts_total" } },
  };
  assert.throws(() => validateArtifact(reserved), /collides with the reserved "row" alias/);

  const unknownRowField = synthetic();
  unknownRowField.nodes["batch.rows"].fields = {
    mass_kg: {
      ...MASS_FIELD,
      expr: { op: "*", args: [{ ref: "row.mass" }, { ref: "m_grist" }] },
    },
  };
  assert.throws(() => validateArtifact(unknownRowField), /references unknown row field "row.mass"/);

  const noOutput = synthetic();
  noOutput.nodes["batch.rows"].fields = { mass_kg: { inputs: MASS_FIELD.inputs, expr: MASS_FIELD.expr } };
  assert.throws(() => validateArtifact(noOutput), /field "mass_kg" must declare an "output"/);

  const unknownDimension = synthetic();
  unknownDimension.nodes["batch.rows"].fields = {
    mass_kg: { ...MASS_FIELD, output: { dimension: "nope" } },
  };
  assert.throws(() => validateArtifact(unknownDimension), /has unknown dimension "nope"/);

  const unknownConstant = synthetic();
  unknownConstant.nodes["batch.rows"].fields = {
    mass_kg: { ...MASS_FIELD, expr: { const: "NOPE" } },
  };
  assert.throws(() => validateArtifact(unknownConstant), /unknown constant "NOPE"/);
});

test("validateCollectionFields rejects a field whose dimension disagrees with its expression", () => {
  const doc = synthetic();
  assert.equal(validateCollectionFields(doc), undefined);

  const wrong = synthetic();
  wrong.nodes["batch.rows"].fields = {
    mass_kg: { ...MASS_FIELD, output: { dimension: "percentage" } },
  };
  assert.throws(
    () => createCalculator(wrong),
    /field "mass_kg" declares dimension "percentage" but its expression infers "mass"/
  );
});
