import test from "node:test";
import assert from "node:assert/strict";

import {
  activeCatalogIds,
  activeDraftRow,
  addedCatalogIds,
  catalogCategoryPills,
  catalogFamilyPills,
  catalogGroupMeta,
  catalogItemMeta,
  catalogProductMatches,
  catalogStandardGroups,
  filteredCatalogItems,
  isCatalogTruncated,
  standardSelectionName,
  toggledCategoryFilter,
  toggledFamilyFilter,
  visibleCatalogItems,
} from "../../frontend/src/views/producer/catalogDrawer.js";

const MALTS = [
  {
    id: "pils",
    name: "Pilsner",
    category: "BASE",
    standard_malt: "pilsner",
    standard_name: "Pilsner",
    generic_description: "Pale base malt",
    family: "base",
  },
  {
    id: "maris",
    name: "Maris Otter",
    category: "BASE",
    standard_malt: "pilsner",
    standard_name: "Pilsner",
    generic_description: "Pale base malt",
    family: "base",
    maltster: "Crisp",
  },
  {
    id: "crystal",
    name: "Crystal 40",
    category: "CRYSTAL",
    standard_malt: "crystal-40",
    standard_name: "Crystal 40",
    generic_description: "Caramel malt",
    family: "crystal",
    maltster: "Weyermann",
  },
  {
    id: "std:pilsner",
    name: "Pilsner (generic)",
    category: "BASE",
    standard_malt: "pilsner",
    standard_name: "Pilsner",
    generic_description: "Pale base malt",
    family: "base",
  },
];

const STANDARD_CONFIG = {
  standardField: "standard_malt",
  standardNameField: "standard_name",
  standardDescriptionField: "generic_description",
  familyField: "family",
};

test("meta composers join a card's parts and refuse a missing supplier", () => {
  assert.equal(catalogItemMeta({ category: "BASE", name: "Pilsner" }, (i) => [i.category, i.name]), "BASE • Pilsner");
  assert.equal(catalogItemMeta({}, () => []), "");
  assert.equal(catalogItemMeta({ name: "x" }, null), "");
  assert.equal(catalogItemMeta(undefined, (i) => [i?.name]), "");
  assert.equal(catalogGroupMeta({ count: 2 }, (g) => ["Pale", `${g.count} malts`]), "Pale · 2 malts");
  assert.equal(catalogGroupMeta(null, (g) => [g.count]), "");
  assert.equal(catalogGroupMeta({ count: 2 }, null), "");
});

test("active ids skip blank catalogue ids", () => {
  const ids = activeCatalogIds([{ catalog_id: "a" }, { catalog_id: "" }, {}, { catalog_id: "b" }], "catalog_id");
  assert.deepEqual([...ids], ["a", "b"]);
  assert.equal(activeCatalogIds(undefined, "catalog_id").size, 0);
});

test("added ids hide repeats unless the card allows duplicates", () => {
  const rows = [{ hop_id: "citra" }, { hop_id: "citra" }];
  assert.deepEqual([...activeCatalogIds(rows, "hop_id")], ["citra"]);
  assert.deepEqual([...addedCatalogIds(rows, "hop_id")], ["citra"]);
  assert.deepEqual([...addedCatalogIds(rows, "hop_id", false)], ["citra"]);
  assert.equal(addedCatalogIds(rows, "hop_id", true).size, 0);
});

test("category and family pills are empty without their field", () => {
  assert.deepEqual(catalogCategoryPills(MALTS, "category"), ["BASE", "CRYSTAL"]);
  assert.deepEqual(catalogCategoryPills(MALTS, null), []);
  assert.deepEqual(catalogFamilyPills(MALTS, "family"), [
    { name: "base", label: "Base", count: 3 },
    { name: "crystal", label: "Crystal", count: 1 },
  ]);
  assert.deepEqual(catalogFamilyPills(MALTS, null), []);
});

test("standard groups drop representatives and draft rows, and narrow by family and query", () => {
  const groups = (config) =>
    catalogStandardGroups(MALTS, { ...STANDARD_CONFIG, ...config }).map((g) => [g.id, g.count]);

  assert.deepEqual(groups({ added: new Set(["pils"]) }), [["pilsner", 1], ["crystal-40", 1]]);
  assert.deepEqual(groups({ family: "base" }), [["pilsner", 2]]);
  assert.deepEqual(groups({ query: "caramel" }), [["crystal-40", 1]]);
  assert.deepEqual(groups({ query: "  " }), [["pilsner", 2], ["crystal-40", 1]]);
});

test("product matches search the brand field, honour the pills, and cap the list", () => {
  const config = {
    standardField: "standard_malt",
    familyField: "family",
    categoryField: "category",
    brandField: "maltster",
    added: new Set(["pils"]),
  };
  const ids = (over) =>
    catalogProductMatches(MALTS, { query: "crisp", ...config, ...over }).map((i) => i.id);

  assert.deepEqual(ids({}), ["maris"]);
  assert.deepEqual(ids({ query: "weyermann" }), ["crystal"]);
  assert.deepEqual(ids({ query: "otter" }), ["maris"]);
  assert.deepEqual(ids({ family: "crystal" }), []);
  assert.deepEqual(ids({ categories: ["BASE"] }), ["maris"]);
  assert.deepEqual(ids({ limit: 1, query: "weyermann" }), ["crystal"]);
  assert.deepEqual(ids({ includeNotes: false }), ["maris"]);
});

test("the standard selection name falls back to the id", () => {
  const config = { standardField: "standard_malt", standardNameField: "standard_name" };
  assert.equal(standardSelectionName(MALTS, { ...config, standard: "pilsner" }), "Pilsner");
  assert.equal(standardSelectionName(MALTS, { ...config, standard: "unknown" }), "unknown");
  assert.equal(standardSelectionName(MALTS, { ...config, standard: "" }), "");
  assert.equal(standardSelectionName(MALTS, { standardField: null, standard: "pilsner" }), "");
});

test("filtered rows apply the draft set, the pills, and the drill-down order", () => {
  const ids = (config) =>
    filteredCatalogItems(MALTS, { categoryField: "category", ...STANDARD_CONFIG, ...config }).map((i) => i.id);

  assert.deepEqual(ids({ added: new Set(["maris"]) }), ["pils", "crystal", "std:pilsner"]);
  assert.deepEqual(ids({ categories: ["CRYSTAL"] }), ["crystal"]);
  assert.deepEqual(ids({ standard: "pilsner" }), ["std:pilsner", "maris", "pils"]);
  assert.deepEqual(ids({ query: "maris" }), ["maris"]);
  assert.equal(ids({ query: "maris", includeNotes: false }).length, 1);
});

test("a drill-down shows every row; the browser caps and reports truncation", () => {
  assert.deepEqual(visibleCatalogItems([1, 2, 3], { maxVisible: 2 }), [1, 2]);
  assert.deepEqual(visibleCatalogItems([1, 2, 3], { drilledIn: true, maxVisible: 2 }), [1, 2, 3]);
  assert.equal(isCatalogTruncated([1, 2, 3], { maxVisible: 2 }), true);
  assert.equal(isCatalogTruncated([1, 2], { maxVisible: 2 }), false);
  assert.equal(isCatalogTruncated([1, 2, 3], { drilledIn: true, maxVisible: 2 }), false);
});

test("the active row resolves the inspected index, or nothing", () => {
  assert.deepEqual(activeDraftRow([{ catalog_id: "a" }], 0), { catalog_id: "a" });
  assert.equal(activeDraftRow([{ catalog_id: "a" }], null), null);
  assert.equal(activeDraftRow([{ catalog_id: "a" }], 4), null);
  assert.equal(activeDraftRow(undefined, 0), null);
});

test("the toggles add, remove, and clear", () => {
  assert.deepEqual(toggledCategoryFilter([], "BASE"), ["BASE"]);
  assert.deepEqual(toggledCategoryFilter(["BASE", "CRYSTAL"], "BASE"), ["CRYSTAL"]);
  assert.deepEqual(toggledCategoryFilter(undefined, "BASE"), ["BASE"]);
  assert.equal(toggledFamilyFilter("base", "base"), "");
  assert.equal(toggledFamilyFilter("", "crystal"), "crystal");
});
