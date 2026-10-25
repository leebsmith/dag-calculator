// Offline stub completeness: every artifact-declared boundary output must be
// produced by the offline stub, or the dev/tests path silently blanks a readout.

import test from "node:test";
import assert from "node:assert/strict";

import { STUB_BOUNDARIES } from "../../frontend/src/adapters/stubBoundaries.js";
import { artifact } from "./util.js";

const HOP_SAMPLE = {
  boil_hops: [{ alpha_acid_pct: 0.1, boil_time_fraction: 1.0, pct: 1.0 }],
  whirlpool_hops: [
    {
      alpha_acid_pct: 0.1,
      duration_min: 30.0,
      initial_temp_c: 99.0,
      pct: 1.0,
      product_form: "t90_pellet",
    },
  ],
  boil_target_ibu: 40.0,
  whirlpool_target_ibu: 20.0,
  boil_time_min: 60.0,
  pre_boil_gravity: 1.048,
  post_boil_gravity: 1.055,
  post_boil_volume_l: 21.0,
  whirlpool_ambient_temp_c: 20.0,
  whirlpool_cooling_time_constant_min: 108.7,
};

const SAMPLE_INPUTS = {
  hop_bitterness_solver: HOP_SAMPLE,
};

function checkField(spec, value, label) {
  if (spec.dimension) {
    assert.equal(typeof value, "number", `${label} must be numeric`);
    assert.ok(Number.isFinite(value), `${label} must be finite`);
    return;
  }
  if (spec.taxonomy) {
    assert.equal(typeof value, "string", `${label} must be a taxonomy string`);
    return;
  }
  if (spec.type === "boolean") {
    assert.equal(typeof value, "boolean", `${label} must be boolean`);
  }
}

function checkCollection(spec, value, artifactSpec, label) {
  assert.ok(Array.isArray(value), `${label} must be an array`);
  const schema = artifactSpec.primitive_schemas[spec.item_schema];
  assert.ok(schema, `${label} has unknown item_schema "${spec.item_schema}"`);
  for (const [index, row] of value.entries()) {
    assert.deepEqual(
      Object.keys(row).sort(),
      Object.keys(schema).sort(),
      `${label}[${index}] fields`
    );
    for (const [field, fieldSpec] of Object.entries(schema)) {
      checkField(fieldSpec, row[field], `${label}[${index}].${field}`);
    }
  }
}

test("offline stubs cover and type every declared boundary output", () => {
  const a = artifact();
  for (const [id, node] of Object.entries(a.nodes)) {
    if (node.kind !== "boundary") continue;
    const stub = STUB_BOUNDARIES[node.binding];
    assert.ok(stub, `${id} has no offline stub for binding "${node.binding}"`);
    const declared = Object.keys(node.outputs);
    const outputs = stub(SAMPLE_INPUTS[node.binding] ?? {});
    const actual = new Set(Object.keys(outputs));
    const missing = declared.filter((key) => !actual.has(key));
    assert.deepEqual(missing, [], `${id} stub is missing outputs: ${missing.join(", ")}`);
    const extra = [...actual].filter((key) => !declared.includes(key));
    assert.deepEqual(extra, [], `${id} stub has undeclared outputs: ${extra.join(", ")}`);
    for (const [name, spec] of Object.entries(node.outputs)) {
      if (spec.type === "collection") {
        checkCollection(spec, outputs[name], a, `${id}.${name}`);
      } else {
        checkField(spec, outputs[name], `${id}.${name}`);
      }
    }
  }
});
