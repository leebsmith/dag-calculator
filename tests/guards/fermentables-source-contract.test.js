// Source-contract guard for the vendored malt-database scrape.
//
// The builder (scripts/build-fermentables-seed.mjs) reads
// data/sources/malt-database-malts.json, a committed copy of the personal
// malt_database scrape. That source is now the versioned envelope
// `{ schema_version, generated_at, entries }` described by the pinned
// `data/sources/malt.schema.json` (vendored from the producer). This guard fails
// loudly on contract drift — a version bump, a renamed/retitled field, a changed
// enum, or an unexpected new key — so the builder never silently emits defaults.
// Content drift is caught separately by the sources-manifest hash/row-count guard.
//
// The key/enum sets are DERIVED from the pinned schema, so `malt.schema.json`
// remains the single source of truth; a new field in the producer is a visible
// diff to this guard, not a silent reshape.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SOURCE = fileURLToPath(
  new URL("../../data/sources/malt-database-malts.json", import.meta.url)
);
const SCHEMA = fileURLToPath(
  new URL("../../data/sources/malt.schema.json", import.meta.url)
);

const EXPECTED_SCHEMA_VERSION = 1;

const schema = JSON.parse(readFileSync(SCHEMA, "utf8"));
const ALLOWED_KEYS = new Set(Object.keys(schema.properties ?? {}));
const PRODUCT_TYPES = schema.properties?.product_type?.enum ?? [];
const CATEGORIES = schema.properties?.category?.enum ?? [];
const YIELD_BASES = schema.properties?.yield_basis?.enum ?? [];

const MALT_LIKE = new Set(["malt", "adjunct"]);

function readEnvelope() {
  return JSON.parse(readFileSync(SOURCE, "utf8"));
}

test("malt-database source is the versioned envelope", () => {
  const raw = readEnvelope();
  assert.equal(raw.schema_version, EXPECTED_SCHEMA_VERSION, "contract version mismatch");
  assert.ok(Array.isArray(raw.entries), "entries must be a list");
  assert.ok(raw.entries.length > 0, "entries must not be empty");
  assert.equal(typeof raw.generated_at, "string", "generated_at must be a string");
});

test("malt-database entries conform to the pinned contract", () => {
  const rows = readEnvelope().entries;
  for (const [i, entry] of rows.entries()) {
    const label = `[${i}] ${entry?.name ?? "?"}`;

    assert.ok(entry && typeof entry === "object", `${label} must be an object`);

    for (const key of Object.keys(entry)) {
      assert.ok(ALLOWED_KEYS.has(key), `${label} has undeclared field "${key}"`);
    }

    assert.equal(typeof entry.name, "string", `${label}.name must be a string`);
    assert.ok(entry.name.trim(), `${label}.name must be non-empty`);
    assert.equal(
      typeof entry.maltster,
      "string",
      `${label}.maltster must be a string`
    );
    assert.ok(entry.maltster.trim(), `${label}.maltster must be non-empty`);
    assert.ok(
      PRODUCT_TYPES.includes(entry.product_type),
      `${label}.product_type "${entry.product_type}" is not recognized`
    );

    if (MALT_LIKE.has(entry.product_type)) {
      assert.ok(
        CATEGORIES.includes(entry.category),
        `${label}.category "${entry.category}" is not recognized`
      );
    } else {
      assert.equal(
        entry.category,
        undefined,
        `${label} must not carry a category (${entry.product_type} is not mashed)`
      );
    }

    if (entry.yield_fraction !== undefined && entry.yield_fraction !== null) {
      assert.equal(typeof entry.yield_fraction, "number", `${label}.yield_fraction must be a number`);
      assert.ok(
        entry.yield_fraction >= 0 && entry.yield_fraction <= 1,
        `${label}.yield_fraction=${entry.yield_fraction} out of range`
      );
    }
    if (entry.yield_basis !== undefined) {
      assert.ok(
        YIELD_BASES.includes(entry.yield_basis),
        `${label}.yield_basis "${entry.yield_basis}" is not recognized`
      );
    }
    if (entry.color_lovibond !== undefined && entry.color_lovibond !== null) {
      assert.equal(typeof entry.color_lovibond, "number", `${label}.color_lovibond must be a number`);
      assert.ok(entry.color_lovibond >= 0, `${label}.color_lovibond out of range`);
    }
    if (entry.moisture !== undefined && entry.moisture !== null) {
      assert.equal(typeof entry.moisture, "number", `${label}.moisture must be a number`);
      assert.ok(
        entry.moisture > 0 && entry.moisture <= 100,
        `${label}.moisture=${entry.moisture} out of range (0 means absent)`
      );
    }
    for (const field of ["notes", "description"]) {
      if (entry[field] !== undefined && entry[field] !== null) {
        assert.equal(typeof entry[field], "string", `${label}.${field} must be a string`);
      }
    }
    if (entry.sold_out !== undefined) {
      assert.equal(typeof entry.sold_out, "boolean", `${label}.sold_out must be a boolean`);
    }
  }
});
