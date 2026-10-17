import test from "node:test";
import assert from "node:assert/strict";

import { catalogCategories, filterCatalog } from "../../frontend/src/views/catalog.js";

const items = [
  { id: "a", name: "Alpha", notes: "citrus", purpose: "Aroma" },
  { id: "b", name: "Beta", notes: "pine", purpose: "Bittering" },
  { id: "c", name: "Cascade", notes: "floral", purpose: "Dual Purpose" },
];

const ids = (rows) => rows.map((row) => row.id);

test("filterCatalog excludes active ids, matches query and categories", () => {
  assert.deepEqual(ids(filterCatalog(items)), ["a", "b", "c"]);
  assert.deepEqual(ids(filterCatalog(items, { activeIds: new Set(["b"]) })), ["a", "c"]);
  assert.deepEqual(ids(filterCatalog(items, { query: "cit" })), ["a"]);
  assert.deepEqual(ids(filterCatalog(items, { query: "PINE" })), ["b"]);

  const categoryOf = (item) => item.purpose;
  assert.deepEqual(ids(filterCatalog(items, { categories: ["Aroma"], categoryOf })), ["a"]);
  assert.deepEqual(
    ids(filterCatalog(items, { categories: ["Aroma", "Bittering"], categoryOf })),
    ["a", "b"]
  );
});

test("filterCatalog tolerates missing names/notes and empty options", () => {
  const sparse = [{ id: "x" }, { id: "y", name: "Yarrow" }];
  assert.deepEqual(ids(filterCatalog(sparse, { query: "yarr" })), ["y"]);
  assert.deepEqual(ids(filterCatalog(sparse)), ["x", "y"]);
});

test("catalogCategories returns sorted unique categories", () => {
  assert.deepEqual(catalogCategories(items, (item) => item.purpose), [
    "Aroma",
    "Bittering",
    "Dual Purpose",
  ]);
  assert.deepEqual(catalogCategories(items, () => null), []);
});
