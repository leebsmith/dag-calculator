import test from "node:test";
import assert from "node:assert/strict";

import { catalogCategories, familyOptions, filterCatalog, standardGroups } from "../../frontend/src/views/catalog.js";

const items = [
  { id: "a", name: "Alpha", notes: "citrus", purpose: "Aroma" },
  { id: "b", name: "Beta", notes: "pine", purpose: "Bittering" },
  { id: "c", name: "Cascade", notes: "floral", purpose: "Dual Purpose" },
];

const malts = [
  { id: "m1", name: "Briess Brewers Malt", notes: "", standard_malt: "pale-ale-malt", standard_name: "Pale Ale Malt", family: "base", generic_description: "Standard American/British base malt." },
  { id: "m2", name: "Bairds Pale Ale Malt", notes: "", standard_malt: "pale-ale-malt", standard_name: "Pale Ale Malt", family: "base", generic_description: "Standard American/British base malt." },
  { id: "m3", name: "Pilsen Malt", notes: "", standard_malt: "pilsner-malt", standard_name: "Pilsner Malt", family: "base", generic_description: "Clean, pale base malt for lagers." },
  { id: "m4", name: "Caramel Malt 40L", notes: "", standard_malt: "caramel-40l", standard_name: "Caramel 40L", family: "crystal", generic_description: "Caramel sweetness." },
  { id: "m5", name: "Caramel Malt 60L", notes: "", standard_malt: "caramel-60l", standard_name: "Caramel 60L", family: "crystal", generic_description: "Caramel/toffee." },
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

test("filterCatalog ranks name matches above notes and breaks ties by name", () => {
  const rows = [
    { id: "n1", name: "Notes only", notes: "centennial-like" },
    { id: "n2", name: "Cascade", notes: "" },
    { id: "n3", name: "Centennial", notes: "" },
    { id: "n4", name: "House Centennial", notes: "" },
    { id: "n5", name: "Acent", notes: "" },
  ];

  assert.deepEqual(ids(filterCatalog(rows, { query: "cen" })), ["n3", "n4", "n5", "n1"]);
  assert.deepEqual(
    ids(filterCatalog([...rows, { id: "n6", name: "Centaurus" }], { query: "cen" })),
    ["n6", "n3", "n4", "n5", "n1"]
  );
});

test("filterCatalog can exclude prose notes from the search", () => {
  const rows = [
    { id: "n1", name: "Notes only", notes: "centennial-like" },
    { id: "n2", name: "Centennial", notes: "" },
  ];

  assert.deepEqual(ids(filterCatalog(rows, { query: "cen" })), ["n2", "n1"]);
  assert.deepEqual(
    ids(filterCatalog(rows, { query: "cen", includeNotes: false })),
    ["n2"]
  );
});

test("catalogCategories returns sorted unique categories", () => {
  assert.deepEqual(catalogCategories(items, (item) => item.purpose), [
    "Aroma",
    "Bittering",
    "Dual Purpose",
  ]);
  assert.deepEqual(catalogCategories(items, () => null), []);
});

test("filterCatalog searches custom searchFields", () => {
  assert.deepEqual(
    ids(filterCatalog(malts, { query: "lager", searchFields: ["standard_name", "generic_description"] })),
    ["m3"]
  );
  assert.deepEqual(ids(filterCatalog(malts, { query: "caramel sweetness" })), []);
});

test("familyOptions returns families in canonical order with counts", () => {
  const fams = familyOptions(malts);
  assert.deepEqual(fams.map((f) => f.name), ["base", "crystal"]);
  assert.deepEqual(fams.map((f) => f.count), [3, 2]);
  assert.equal(fams[0].label, "Base");
});

test("standardGroups groups by standard, family-ordered, count desc then name", () => {
  const groups = standardGroups(malts);
  assert.deepEqual(
    groups.map((g) => g.id),
    ["pale-ale-malt", "pilsner-malt", "caramel-40l", "caramel-60l"]
  );
  assert.equal(groups[0].name, "Pale Ale Malt");
  assert.equal(groups[0].description, "Standard American/British base malt.");
  assert.equal(groups[0].count, 2);
  assert.equal(groups[1].count, 1);
});
