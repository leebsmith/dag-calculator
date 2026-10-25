// Equipment seed and ingest contract: one imperial map, every schema field
// present in every shipped profile, and every imperial key declared.

import test from "node:test";
import assert from "node:assert/strict";

import {
  IMPERIAL_KEYS,
  IMPERIAL_UNIT,
  ingestEquipment,
} from "../../frontend/src/store/equipmentIngest.js";
import { artifact, read } from "./util.js";

const FIXTURE = JSON.parse(
  read("tests/conformance/fixtures/equipment-imperial-map.json")
);
const SEED = JSON.parse(read("data/seeds/equipment.json"));

function dimensionedFields(a) {
  const schema = a.primitive_schemas.equipment;
  return Object.entries(schema)
    .filter(([, spec]) => spec.dimension && spec.dimension !== "percentage")
    .map(([field]) => field);
}

test("the frontend imperial map matches the shared fixture", () => {
  assert.deepEqual(IMPERIAL_KEYS, FIXTURE.keys);
  assert.deepEqual(IMPERIAL_UNIT, FIXTURE.units);
});

test("every dimensioned equipment field has an imperial mapping", () => {
  const a = artifact();
  const mapped = new Set(Object.keys(IMPERIAL_KEYS));
  assert.deepEqual(
    [...dimensionedFields(a)].sort(),
    [...mapped].sort(),
    "schema fields and imperial map diverge"
  );

  const schema = a.primitive_schemas.equipment;
  for (const [metricKey, imperialKey] of Object.entries(IMPERIAL_KEYS)) {
    assert.ok(schema[metricKey], `map key "${metricKey}" is not an equipment field`);
    const dimension = schema[metricKey].dimension;
    assert.ok(
      a.dimensions[dimension]?.units?.[IMPERIAL_UNIT[dimension]],
      `"${metricKey}" imperial unit ${IMPERIAL_UNIT[dimension]} is not in dimension ${dimension}`
    );
    assert.ok(imperialKey, `"${metricKey}" has no imperial key`);
  }
});

test("every shipped profile declares every schema field after ingest", () => {
  const a = artifact();
  const ingested = ingestEquipment(SEED, a);
  const required = Object.keys(a.primitive_schemas.equipment).filter(
    (field) => !["id", "name", "description"].includes(field)
  );

  for (const [id, component] of Object.entries(ingested)) {
    const missing = required.filter((field) => !(field in component));
    assert.deepEqual(missing, [], `${id} is missing: ${missing.join(", ")}`);
  }
});

test("every raw seed key is a schema field or a declared imperial key", () => {
  const a = artifact();
  const schema = a.primitive_schemas.equipment;
  const imperial = new Set(Object.values(IMPERIAL_KEYS));
  const identity = new Set(["id", "name", "description"]);

  for (const [id, profile] of Object.entries(SEED)) {
    const data = profile?.data ?? profile;
    for (const key of Object.keys(data)) {
      if (identity.has(key) || schema[key]) continue;
      assert.ok(imperial.has(key), `${id}: undeclared key "${key}"`);
    }
  }
});
