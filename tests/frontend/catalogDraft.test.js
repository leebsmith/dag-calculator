import test from "node:test";
import assert from "node:assert/strict";

import { installCatalogDraft } from "../../frontend/src/adapters/cards/catalogDraft.js";

const SEEDS = {
  malts: {
    pils: { id: "pils", name: "Pilsner", category: "BASE", standard_malt: "pilsner", standard_name: "Pilsner", generic_description: "Pale base malt", family: "base" },
    maris: { id: "maris", name: "Maris Otter", category: "BASE", standard_malt: "pilsner", standard_name: "Pilsner", generic_description: "Pale base malt", family: "base" },
    crystal: { id: "crystal", name: "Crystal 40", category: "CRYSTAL", standard_malt: "crystal-40", standard_name: "Crystal 40", generic_description: "Caramel malt", family: "crystal" },
    "std:pilsner": { id: "std:pilsner", name: "Pilsner (generic)", category: "BASE", standard_malt: "pilsner", standard_name: "Pilsner", generic_description: "Pale base malt", family: "base" },
  },
};

function setup({ canAdd = null, ...extra } = {}) {
  const calls = [];
  const app = {
    draftRows: [],
    draftOpen: false,
    draftNodeId: null,
    catalogRevision: 0,
    openDraft(nodeId) {
      calls.push({ op: "open", nodeId });
      this.draftOpen = true;
      this.draftNodeId = nodeId;
    },
    closeDraft() {
      calls.push({ op: "close" });
      this.draftOpen = false;
    },
    saveDraft() {
      calls.push({ op: "save" });
    },
    addDraftRow(row) {
      calls.push({ op: "add", row });
      this.draftRows.push(row);
    },
    removeDraftRow(index) {
      calls.push({ op: "remove", index });
      this.draftRows.splice(index, 1);
    },
    duplicateUserItem(catalog, item) {
      calls.push({ op: "duplicate", catalog, item });
    },
  };

  installCatalogDraft(
    app,
    { cache: { seeds: SEEDS } },
    {
      prefix: "malt",
      Cap: "Malt",
      nodeId: "grist.major_malts",
      seedKey: "malts",
      idField: "catalog_id",
      categoryField: "category",
      standardField: "standard_malt",
      standardNameField: "standard_name",
      standardDescriptionField: "generic_description",
      familyField: "family",
      makeRow: (malt) => ({ catalog_id: malt.id, name: malt.name, parts: 10, pct: 0 }),
      maxVisible: 2,
      canAdd,
      ...extra,
    }
  );

  return { app, calls };
}

test("installs drawer state, handlers, and getters", () => {
  const { app } = setup();

  assert.equal(app.maltDrawer, null);
  assert.equal(app.maltSearch, "");
  assert.equal(app.maltActiveIndex, null);
  assert.deepEqual(app.maltCategoryFilter, []);
  assert.equal(typeof app.openMaltEditor, "function");
  assert.equal(app.maltEditorOpen, false);
  assert.deepEqual(app.maltCatalog.map((item) => item.id).sort(), ["maris", "pils", "std:pilsner", "crystal"].sort());
});

test("editor handlers delegate to the draft lifecycle and close the drawer", () => {
  const { app, calls } = setup();

  app.openMaltEditor();
  assert.deepEqual(calls.at(-1), { op: "open", nodeId: "grist.major_malts" });
  assert.equal(app.maltEditorOpen, true);

  app.maltDrawer = "inspect";
  app.cancelMaltEditor();
  assert.deepEqual(calls.at(-1), { op: "close" });
  assert.equal(app.maltDrawer, null);
  assert.equal(app.maltActiveIndex, null);

  app.saveMaltEditor();
  assert.deepEqual(calls.at(-1), { op: "save" });
});

test("addCatalogRow adds a mapped row and closes the drawer, honouring canAdd", () => {
  const { app, calls } = setup();

  app.openMaltSearch();
  app.addCatalogMalt("pils");
  assert.deepEqual(calls.at(-1), { op: "add", row: { catalog_id: "pils", name: "Pilsner", parts: 10, pct: 0 } });
  assert.equal(app.maltDrawer, null);

  app.addCatalogMalt("nope");
  assert.equal(calls.filter((c) => c.op === "add").length, 1);
});

test("canAdd can veto a catalog row", () => {
  const { app, calls } = setup({ canAdd: () => false });

  app.addCatalogMalt("pils");

  assert.equal(calls.some((c) => c.op === "add"), false);
});

test("duplicateCatalogMalt routes the seed into the user catalog", () => {
  const { app, calls } = setup();

  app.duplicateCatalogMalt("crystal");
  assert.deepEqual(calls.at(-1), { op: "duplicate", catalog: "malt", item: SEEDS.malts.crystal });

  app.duplicateCatalogMalt("nope");
  assert.equal(calls.filter((c) => c.op === "duplicate").length, 1);
});

test("removeMalt keeps the active index pointing at the same row", () => {
  const { app } = setup();
  app.addDraftRow({ catalog_id: "a" });
  app.addDraftRow({ catalog_id: "b" });
  app.addDraftRow({ catalog_id: "c" });

  app.inspectMaltRow(2);
  app.removeMalt(0);
  assert.equal(app.maltActiveIndex, 1);
  assert.equal(app.maltDrawer, "inspect");

  app.removeMalt(1);
  assert.equal(app.maltActiveIndex, null);
  assert.equal(app.maltDrawer, null);
});

test("removeMalt of another row leaves the inspected row open", () => {
  const { app } = setup();
  app.addDraftRow({ catalog_id: "a" });
  app.addDraftRow({ catalog_id: "b" });
  app.inspectMaltRow(0);

  app.removeMalt(1);

  assert.equal(app.maltActiveIndex, 0);
  assert.equal(app.maltDrawer, "inspect");
});

test("openSearch resets the drawer filters", () => {
  const { app } = setup();
  app.maltCategoryFilter = ["BASE"];
  app.maltFamily = "base";
  app.maltStandard = "pilsner";
  app.maltSearch = "pils";

  app.openMaltSearch();

  assert.equal(app.maltDrawer, "search");
  assert.equal(app.maltActiveIndex, null);
  assert.equal(app.maltSearch, "");
  assert.deepEqual(app.maltCategoryFilter, []);
  assert.equal(app.maltFamily, "");
  assert.equal(app.maltStandard, "");
});

test("category and family toggles are additive and exclusive respectively", () => {
  const { app } = setup();

  app.toggleMaltCategory("BASE");
  app.toggleMaltCategory("CRYSTAL");
  assert.deepEqual(app.maltCategoryFilter, ["BASE", "CRYSTAL"]);
  app.toggleMaltCategory("BASE");
  assert.deepEqual(app.maltCategoryFilter, ["CRYSTAL"]);

  app.maltStandard = "pilsner";
  app.toggleMaltFamily("base");
  assert.equal(app.maltFamily, "base");
  assert.equal(app.maltStandard, "");
  app.toggleMaltFamily("base");
  assert.equal(app.maltFamily, "");
});

test("standard drill-down handlers set and clear the selection", () => {
  const { app } = setup();

  app.inspectMaltRow(0);
  app.selectMaltStandard("pilsner");
  assert.equal(app.maltStandard, "pilsner");
  assert.equal(app.maltActiveIndex, null);
  assert.equal(app.maltStandardName, "Pilsner");

  app.clearMaltStandard();
  assert.equal(app.maltStandard, "");
  assert.equal(app.maltStandardName, "");
});

test("escape closes the drawer first, then the editor", () => {
  const { app, calls } = setup();

  app.handleMaltEscape();
  assert.equal(calls.length, 0);

  app.openMaltEditor();
  app.maltDrawer = "search";
  app.handleMaltEscape();
  assert.equal(app.maltDrawer, null);
  assert.equal(app.maltEditorOpen, true);

  app.handleMaltEscape();
  assert.deepEqual(calls.at(-1), { op: "close" });
});

test("catalog getters expose categories and families", () => {
  const { app } = setup();

  assert.deepEqual(app.maltCategories, ["BASE", "CRYSTAL"]);
  assert.deepEqual(app.maltFamilies, [
    { name: "base", label: "Base", count: 3 },
    { name: "crystal", label: "Crystal", count: 1 },
  ]);
});

test("standardGroups groups variants, excluding added rows and generic entries", () => {
  const { app } = setup();
  app.addDraftRow({ catalog_id: "pils" });

  assert.deepEqual(app.maltStandardGroups, [
    {
      id: "pilsner",
      name: "Pilsner",
      description: "Pale base malt",
      family: "base",
      count: 1,
    },
    {
      id: "crystal-40",
      name: "Crystal 40",
      description: "Caramel malt",
      family: "crystal",
      count: 1,
    },
  ]);
});

test("standardGroups narrows by family and search query", () => {
  const { app } = setup();

  app.maltFamily = "base";
  assert.deepEqual(app.maltStandardGroups.map((group) => group.id), ["pilsner"]);

  app.maltFamily = "";
  app.maltSearch = "caramel";
  assert.deepEqual(app.maltStandardGroups.map((group) => group.id), ["crystal-40"]);
});

test("filtered and visible catalog respect filters, drill-down ordering, and the cap", () => {
  const { app } = setup();

  assert.deepEqual(app.maltFilteredCatalog.map((item) => item.id).sort(), ["crystal", "maris", "pils", "std:pilsner"]);
  assert.equal(app.maltVisibleCatalog.length, 2);
  assert.equal(app.maltCatalogTruncated, true);

  app.maltStandard = "pilsner";
  assert.equal(app.maltVisibleCatalog[0].id, "std:pilsner");
  assert.deepEqual(app.maltVisibleCatalog.map((item) => item.id), ["std:pilsner", "maris", "pils"]);
  assert.equal(app.maltCatalogTruncated, false);

  app.maltStandard = "";
  app.maltCategoryFilter = ["CRYSTAL"];
  assert.deepEqual(app.maltFilteredCatalog.map((item) => item.id), ["crystal"]);
  assert.equal(app.maltCatalogTruncated, false);
});

test("activeRow resolves the inspected draft row", () => {
  const { app } = setup();

  assert.equal(app.maltActiveRow, null);

  app.addDraftRow({ catalog_id: "a" });
  app.inspectMaltRow(0);
  assert.deepEqual(app.maltActiveRow, { catalog_id: "a" });

  app.maltActiveIndex = 9;
  assert.equal(app.maltActiveRow, null);
});

test("itemMeta and groupMeta compose supplier strings from parts", () => {
  const { app } = setup({
    itemMeta: (item) => [item.category, item.name],
    groupMeta: (group) => [group.description, `${group.count} malts`],
  });

  assert.equal(app.maltItemMeta(SEEDS.malts.pils), "BASE • Pilsner");
  assert.equal(app.maltItemMeta({}), "");
  assert.equal(app.maltItemMeta(undefined), "");

  const group = app.maltStandardGroups[0];
  assert.equal(app.maltGroupMeta(group), `${group.description} · ${group.count} malts`);

  const { app: bare } = setup();
  assert.equal(bare.maltItemMeta(SEEDS.malts.pils), "");
  assert.equal(bare.maltGroupMeta(group), "");
});
