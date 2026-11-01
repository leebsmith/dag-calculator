import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CATALOGS,
  CATALOG_KINDS,
  SEED_KEY_TO_CATALOG,
  isUserItem,
  validateComponent,
} from "../../frontend/src/store/userCatalog.js";
import { loadArtifact } from "./helpers.js";

const artifact = loadArtifact();
const registry = {
  ...JSON.parse(readFileSync(new URL("../../data/catalogs.json", import.meta.url), "utf8")),
  ...JSON.parse(
    readFileSync(new URL("../../data/record_catalogs.json", import.meta.url), "utf8")
  ),
};

const PARITY = JSON.parse(
  readFileSync(
    new URL("../../tests/conformance/fixtures/record-schema-cases.json", import.meta.url),
    "utf8"
  )
);

const CURVE = {
  name: "Garage kettle",
  measured_at: "2026-11-01",
  ambient_temp_c: 12,
  start_temp_c: 99,
  points: [
    { time_min: 10, temp_c: 80 },
    { time_min: 20, temp_c: 68 },
  ],
};

test("legacy identity helpers", () => {
  assert.equal(isUserItem("u:house-malt"), true);
  assert.equal(isUserItem("6f2a0c"), false);
  assert.equal(isUserItem(null), false);
});

test("the registry is the shared data/catalogs.json", () => {
  assert.deepEqual(CATALOG_KINDS, Object.keys(registry));
  for (const [kind, meta] of Object.entries(registry)) {
    assert.deepEqual(CATALOGS[kind], {
      label: meta.label,
      schema: meta.schema,
      schemaSource: meta.schema_source ?? "artifact",
      referencesKey: meta.references_key,
      seedKey: meta.seed_key,
      idField: meta.id_field,
      titleField: meta.title_field,
    });
  }
});

test("seed keys map back to their catalog kind", () => {
  assert.equal(SEED_KEY_TO_CATALOG.hops, "hop");
  assert.equal(SEED_KEY_TO_CATALOG.hopProducts, "hop_product");
  assert.equal(SEED_KEY_TO_CATALOG.yeasts, "yeast");
  assert.equal(SEED_KEY_TO_CATALOG.waterReports, "water_report");
  assert.equal(SEED_KEY_TO_CATALOG.waterTargets, "water_target");
  assert.equal(SEED_KEY_TO_CATALOG.coolingCurves, "cooling_curve");
});

test("record schemas validate flat lists and the measured date", () => {
  assert.deepEqual(validateComponent(artifact, "cooling_curve", CURVE), []);
  assert.ok(
    validateComponent(artifact, "cooling_curve", { ...CURVE, measured_at: "" }).some((e) =>
      e.field === "measured_at"
    )
  );
  assert.ok(
    validateComponent(artifact, "cooling_curve", { ...CURVE, measured_at: "11/01/2026" }).some(
      (e) => e.message.includes("ISO date")
    )
  );
  assert.ok(
    validateComponent(artifact, "cooling_curve", {
      ...CURVE,
      points: [{ time_min: 10, temp_c: 80 }],
    }).some((e) => e.message.includes("at least 2"))
  );
  assert.ok(
    validateComponent(artifact, "cooling_curve", {
      ...CURVE,
      points: [
        { time_min: 20, temp_c: 80 },
        { time_min: 10, temp_c: 68 },
      ],
    }).some((e) => e.message.includes("strictly increasing"))
  );
  assert.ok(
    validateComponent(artifact, "cooling_curve", {
      ...CURVE,
      points: [{ time_min: 10, temp_c: 80, bogus: 1 }, { time_min: 20, temp_c: 68 }],
    }).some((e) => e.message.includes("undeclared"))
  );
  assert.ok(
    validateComponent(artifact, "cooling_curve", { ...CURVE, ambient_temp_c: -30 }).some((e) =>
      e.message.includes("violates")
    )
  );
});

test("the record schema fixture agrees across the JS validator", () => {
  assert.deepEqual(validateComponent(artifact, "cooling_curve", PARITY.valid), []);
  for (const entry of PARITY.invalid) {
    const errors = validateComponent(artifact, "cooling_curve", entry.component);
    assert.ok(
      errors.some((error) => error.field === entry.field),
      `${entry.case}: expected an error at ${entry.field}, got ${JSON.stringify(errors)}`
    );
  }
});

test("validateComponent reports field-level errors", () => {
  const errors = validateComponent(artifact, "malt", {
    name: "",
    category: "BASE",
    yield_fraction: 2,
  });
  assert.ok(errors.some((e) => e.field === "name"));
  assert.ok(errors.some((e) => e.field === "yield_fraction"));
  assert.deepEqual(validateComponent(artifact, "malt", { name: "Good", category: "BASE" }), []);
});

test("validateComponent honours each catalog's title field", () => {
  const errors = validateComponent(artifact, "water_report", { calcium_ca: 40 });
  assert.ok(errors.some((e) => e.field === "laboratory"));
});

test("validateComponent rejects undeclared fields and unknown kinds", () => {
  assert.ok(
    validateComponent(artifact, "malt", { name: "X", bogus_field: 1 }).some((e) =>
      e.message.includes("undeclared")
    )
  );
  assert.ok(validateComponent(artifact, "bogus", {})[0].message.includes("unknown catalog"));
});
