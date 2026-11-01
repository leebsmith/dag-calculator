// The YVH snapshot is scraped, so its shape is the contract the curator reads.
// A dropped field or a re-slugged handle would otherwise surface only when a
// catalogue record is written from it.

import test from "node:test";
import assert from "node:assert/strict";

import { read } from "./util.js";

const rows = () => JSON.parse(read("data/sources/yvh-products.json"));

test("every advanced hop product is a complete catalogue record", () => {
  const products = rows();
  assert.ok(products.length >= 15, `expected the advanced set, found ${products.length}`);
  const seen = new Set();
  for (const row of products) {
    assert.match(row.id, /^[a-z0-9-]+$/, row.id);
    assert.equal(row.id, row.handle, row.id);
    assert.ok(!seen.has(row.id), `duplicate ${row.id}`);
    seen.add(row.id);
    assert.ok(typeof row.title === "string" && row.title.length > 0, row.id);
    assert.ok(typeof row.product_type === "string" && row.product_type.length > 0, row.id);
    assert.ok(Array.isArray(row.tags), row.id);
    assert.ok(typeof row.description === "string" && row.description.length > 0, row.id);
    assert.equal(row.url, `https://yakimavalleyhops.com/products/${row.handle}`, row.id);
  }
});

test("spec sheets are absolute https links, deduplicated", () => {
  for (const row of rows()) {
    assert.ok(Array.isArray(row.spec_sheets), row.id);
    assert.equal(new Set(row.spec_sheets).size, row.spec_sheets.length, row.id);
    for (const url of row.spec_sheets) {
      assert.match(url, /^https:\/\/[^\s]+\.pdf/i, `${row.id}: ${url}`);
    }
  }
});

test("the snapshot is sorted so a re-scrape diffs cleanly", () => {
  const ids = rows().map((row) => row.id);
  assert.deepEqual(ids, [...ids].sort());
});

test("the products the bitterness model needs are present", () => {
  const ids = new Set(rows().map((row) => row.id));
  for (const handle of [
    "co2-hop-extract",
    "flex",
    "incognito",
    "spectrum",
    "prysma-hop-extract",
    "isohop",
    "tetrahop-gold",
    "hexahop-gold-10",
    "redihop",
    "kettle-redi-light-stable-bitterness",
    "euphorics",
    "lupomax",
  ]) {
    assert.ok(ids.has(handle), `missing ${handle}`);
  }
});

test("processing aids are not catalogued as hop products", () => {
  const ids = new Set(rows().map((row) => row.id));
  for (const handle of ["hopaid-antifoam", "hophaze"]) {
    assert.ok(!ids.has(handle), `${handle} is not a hop charge`);
  }
});
