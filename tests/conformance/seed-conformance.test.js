// Step G — seed/schema conformance.
//
// Asserts every catalog seed is a flat id-keyed map whose components conform to
// their `primitive_schema` (present-field types, domain bounds, taxonomy values),
// and that `mash-schedules` rows conform to `mash_rest`.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { loadArtifact } from "../frontend/helpers.js";

const artifact = loadArtifact();

function readSeed(name) {
  const url = new URL(`../../data/seeds/${name}`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8"));
}

const OPS = {
  gt: (a, b) => a > b,
  gte: (a, b) => a >= b,
  lt: (a, b) => a < b,
  lte: (a, b) => a <= b,
  eq: (a, b) => a === b,
  ne: (a, b) => a !== b,
};

function domainHolds(domain, value) {
  if (!domain) return true;
  for (const [op, limit] of Object.entries(domain)) {
    const test = OPS[op];
    if (!test) continue;
    if (typeof limit === "number" && !test(value, limit)) return false;
  }
  return true;
}

// Catalogs: file -> schema, plus the schema's identity field.
const CATALOGS = [
  ["equipment.json", "equipment", "id"],
  ["malts.json", "malt", "id"],
  ["sugars.json", "sugar", "id"],
  ["yeasts.json", "yeast", "id"],
  ["water_reports.json", "water_report", "report_id"],
  ["water_target_profiles.json", "water_target", "id"],
];

function checkComponent(schema, component, label) {
  for (const [field, value] of Object.entries(component)) {
    assert.ok(field in schema, `${label} has undeclared field "${field}"`);
    const spec = schema[field];
    if (value === null || value === undefined) continue;
    if (spec.dimension) {
      assert.equal(typeof value, "number", `${label}.${field} must be a number`);
      if (spec.domain) {
        assert.ok(
          domainHolds(spec.domain, value),
          `${label}.${field}=${value} violates ${JSON.stringify(spec.domain)}`
        );
      }
    }
    if (spec.taxonomy) {
      assert.ok(
        artifact.taxonomies[spec.taxonomy]?.includes(value),
        `${label}.${field}="${value}" is not in taxonomy ${spec.taxonomy}`
      );
    }
    if (spec.type === "boolean") {
      assert.equal(typeof value, "boolean", `${label}.${field} must be a boolean`);
    }
  }
}

for (const [file, schemaName, idField] of CATALOGS) {
  test(`seed ${file} conforms to ${schemaName}`, () => {
    const data = readSeed(file);
    assert.ok(
      data && typeof data === "object" && !Array.isArray(data),
      `${file} must be a flat id-keyed object`
    );
    assert.ok(Object.keys(data).length > 0, `${file} must not be empty`);
    const schema = artifact.primitive_schemas[schemaName];
    assert.ok(schema, `unknown schema ${schemaName}`);

    for (const [key, component] of Object.entries(data)) {
      assert.ok(component && typeof component === "object", `${schemaName} "${key}" must be an object`);
      assert.equal(
        component[idField],
        key,
        `${schemaName} "${key}" ${idField} does not match its key`
      );
      checkComponent(schema, component, `${schemaName} "${key}"`);
    }
  });
}

test("mash-schedules.json conforms to mash_rest", () => {
  const schedules = readSeed("mash-schedules.json");
  const schema = artifact.primitive_schemas.mash_rest;
  assert.ok(schedules && typeof schedules === "object" && !Array.isArray(schedules));
  for (const [sid, schedule] of Object.entries(schedules)) {
    assert.ok(Array.isArray(schedule.rests), `schedule "${sid}" must have a rests[] list`);
    for (const rest of schedule.rests) {
      checkComponent(schema, rest, `mash_rest "${sid}"`);
    }
  }
});
