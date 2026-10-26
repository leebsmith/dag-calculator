// Audited sugar database contract.
//
// The source stores the physical tiers (dry matter, extract efficiency, gravity
// potential, RDF); the seed derives only the two axes the solver consumes. This
// guard pins the shape, the unit conversions, the citation fields, and the
// null-fill-only overlay policy.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  applySugarOverlay,
  loadSugarOverlay,
} from "../../scripts/build-fermentables-seed.mjs";

const SOURCE = JSON.parse(
  readFileSync(
    new URL("../../data/sources/sugar-fermentability.json", import.meta.url),
    "utf8"
  )
);
const SCHEMA = JSON.parse(
  readFileSync(
    new URL("../../data/sources/sugar-fermentability.schema.json", import.meta.url),
    "utf8"
  )
);
const SEED = JSON.parse(
  readFileSync(new URL("../../data/seeds/sugars.json", import.meta.url), "utf8")
);

const ENTRY_KEYS = new Set(Object.keys(SCHEMA.$defs.entry.properties));
const ENTRY_REQUIRED = SCHEMA.$defs.entry.required;
const SHA256 = /^[0-9a-f]{64}$/;
const SUCROSE_PPG = 46.21;
const PPG_TO_L_DEG = 8.3454;

test("sugar source is the versioned envelope", () => {
  assert.equal(SOURCE.schema_version, 1);
  assert.ok(Array.isArray(SOURCE.entries) && SOURCE.entries.length > 0);
  assert.equal(typeof SOURCE.generated_at, "string");
  assert.equal(typeof SOURCE.upstream, "string");
});

test("every sugar entry conforms to the pinned schema shape", () => {
  for (const [index, entry] of SOURCE.entries.entries()) {
    const label = `[${index}] ${entry?.id ?? "?"}`;
    for (const key of Object.keys(entry)) {
      assert.ok(ENTRY_KEYS.has(key), `${label} has undeclared field "${key}"`);
    }
    for (const key of ENTRY_REQUIRED) {
      assert.ok(key in entry, `${label} is missing "${key}"`);
    }
    assert.match(entry.id, /^[a-z0-9][a-z0-9-]*$/, `${label}.id`);
    assert.ok(["dry", "liquid"].includes(entry.form), `${label}.form`);
    assert.equal(entry.basis, "real", `${label}.basis`);
  }
});

test("every sugar entry is cited and hashed", () => {
  for (const [index, entry] of SOURCE.entries.entries()) {
    const label = `[${index}] ${entry?.id ?? "?"}`;
    assert.match(entry.sha256, SHA256, `${label}.sha256`);
    assert.ok(entry.url.length > 0, `${label}.url`);
    assert.ok(entry.vendor.length > 0, `${label}.vendor`);
    assert.ok(entry.method.length > 0, `${label}.method`);
    assert.ok(!Number.isNaN(Date.parse(entry.retrieved_at)), `${label}.retrieved_at`);
  }
});

test("gravity potential and dry matter agree with the canonical constants", () => {
  for (const entry of SOURCE.entries) {
    const derivedPpg = SUCROSE_PPG * entry.dry_matter_fraction * entry.extract_efficiency_factor;
    assert.ok(
      Math.abs(entry.ppg_as_is - derivedPpg) <= 0.15,
      `${entry.id}: ppg ${entry.ppg_as_is} vs ${derivedPpg.toFixed(3)}`
    );
    const derivedL = entry.ppg_as_is * PPG_TO_L_DEG;
    assert.ok(
      Math.abs(entry.l_deg_per_kg - derivedL) <= 0.2,
      `${entry.id}: L°/kg ${entry.l_deg_per_kg} vs ${derivedL.toFixed(1)}`
    );
  }
});

test("RDF is a real range and the point is its midpoint", () => {
  for (const entry of SOURCE.entries) {
    assert.ok(entry.rdf_min >= 0 && entry.rdf_max <= 1, `${entry.id}.rdf range`);
    assert.ok(entry.rdf_min <= entry.rdf_max, `${entry.id}.rdf min > max`);
    assert.ok(
      Math.abs(entry.rdf - (entry.rdf_min + entry.rdf_max) / 2) <= 0.005,
      `${entry.id}.rdf is not the range midpoint`
    );
  }
});

test("aliases resolve to seed sugar ids", () => {
  const ids = new Set(Object.keys(SEED));
  const seen = new Set();
  for (const entry of SOURCE.entries) {
    for (const alias of entry.aliases ?? []) {
      assert.ok(ids.has(alias), `${entry.id} alias "${alias}" is not a seed id`);
      assert.ok(!seen.has(alias), `duplicate alias "${alias}"`);
      seen.add(alias);
    }
  }
});

test("lactose is definitionally unfermentable", () => {
  const lactose = SOURCE.entries.find((entry) => entry.id === "lactose");
  assert.ok(lactose);
  assert.equal(lactose.rdf, 0);
  assert.equal(lactose.rdf_min, 0);
  assert.equal(lactose.rdf_max, 0);
});

test("the overlay fills nulls only and reports conflicts", () => {
  const overlay = loadSugarOverlay();
  const seed = {
    "corn-sugar-dextrose": { yield_fraction: 1.0, fermentability_fraction: null },
    "milk-sugar-lactose": { yield_fraction: 0.761, fermentability_fraction: null },
  };
  const conflicts = applySugarOverlay(seed, overlay);

  assert.equal(seed["corn-sugar-dextrose"].yield_fraction, 1.0, "non-null yield overwritten");
  assert.equal(seed["corn-sugar-dextrose"].fermentability_fraction, 1.0);
  assert.equal(seed["milk-sugar-lactose"].fermentability_fraction, 0);
  assert.ok(
    conflicts.some(
      (conflict) =>
        conflict.id === "corn-sugar-dextrose" && conflict.field === "yield_fraction"
    ),
    "the monohydrate yield conflict must be reported"
  );
});
