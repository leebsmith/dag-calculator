import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CATALOGS,
  CATALOG_KINDS,
  SEED_KEY_TO_CATALOG,
  isUserItem,
  slugify,
  validateComponent,
} from "../../frontend/src/store/userCatalog.js";
import { loadArtifact } from "./helpers.js";

const artifact = loadArtifact();
const registry = JSON.parse(
  readFileSync(new URL("../../data/catalogs.json", import.meta.url), "utf8")
);

test("slugify + legacy identity helpers", () => {
  assert.equal(slugify("Maris Otter® Malt"), "maris-otter-malt");
  assert.equal(slugify("  Café / Vienna "), "cafe-vienna");
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
      referencesKey: meta.references_key,
      seedKey: meta.seed_key,
      idField: meta.id_field,
      titleField: meta.title_field,
    });
  }
});

test("seed keys map back to their catalog kind", () => {
  assert.equal(SEED_KEY_TO_CATALOG.hops, "hop");
  assert.equal(SEED_KEY_TO_CATALOG.yeasts, "yeast");
  assert.equal(SEED_KEY_TO_CATALOG.waterReports, "water_report");
  assert.equal(SEED_KEY_TO_CATALOG.waterTargets, "water_target");
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
