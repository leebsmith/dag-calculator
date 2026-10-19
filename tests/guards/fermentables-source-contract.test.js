// Source-contract guard for the vendored malt-database scrape.
//
// The builder (scripts/build-fermentables-seed.mjs) reads
// data/sources/malt-database-malts.json, which is a committed copy of the
// personal malt_database scrape. This guard fails loudly when that source
// drifts in *shape* — a renamed/retitled field, a changed enum, or an
// unexpected new key — so the builder never silently emits defaults for a
// field it can no longer find. Content drift (a re-scrape that changes rows)
// is caught separately by the sources-manifest hash/row-count guard.
//
// New optional source fields (e.g. a future per-malt `moisture`) are
// deliberately unhandled by the builder until wired in; add them to
// ALLOWED_KEYS here to acknowledge them.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SOURCE = fileURLToPath(
  new URL("../../data/sources/malt-database-malts.json", import.meta.url)
);

const PRODUCT_TYPES = ["malt", "extract", "adjunct", "syrup", "sugar"];
const CATEGORIES = ["BASE", "ROASTED", "CRYSTAL", "ACIDULATED"];
const YIELD_BASES = ["extract", "fermentability"];

// Top-level keys the scraper is allowed to emit. A renamed field (e.g.
// color_lovibond -> color) surfaces here as an unknown key, instead of the
// builder quietly substituting a default.
const ALLOWED_KEYS = new Set([
  "name",
  "maltster",
  "product_type",
  "category",
  "yield_fraction",
  "yield_basis",
  "color_lovibond",
  "notes",
  "description",
  "sold_out",
]);

const MALT_LIKE = new Set(["malt", "adjunct"]);

function readSource() {
  return JSON.parse(readFileSync(SOURCE, "utf8"));
}

test("malt-database source is a non-empty list", () => {
  const rows = readSource();
  assert.ok(Array.isArray(rows), "source must be a list");
  assert.ok(rows.length > 0, "source must not be empty");
});

test("malt-database source entries conform to the scrape contract", () => {
  const rows = readSource();
  for (const [i, entry] of rows.entries()) {
    const label = `[${i}] ${entry?.name ?? "?"}`;

    assert.ok(entry && typeof entry === "object", `${label} must be an object`);

    for (const key of Object.keys(entry)) {
      assert.ok(ALLOWED_KEYS.has(key), `${label} has unexpected field "${key}"`);
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
