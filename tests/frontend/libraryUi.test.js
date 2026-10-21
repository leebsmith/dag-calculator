import test from "node:test";
import assert from "node:assert/strict";

import { registerLibraryUi } from "../../frontend/src/adapters/libraryUi.js";
import { CATALOGS } from "../../frontend/src/store/userCatalog.js";
import { artifact } from "../guards/util.js";

const ENGINE = {
  call: () => {
    throw new Error("linear dimensions must not call the engine");
  },
};

function setup({ unitMode = {}, records = {}, seeds = {}, onCreate, onRemove } = {}) {
  const events = [];
  const app = {
    libraryRevision: 0,
    unitMode,
    library: {
      loaded: () => true,
      loading: () => false,
      error: () => null,
      async refresh() {},
      list(tab) {
        events.push({ op: "list", tab });
        return records[tab] ?? [];
      },
      async create(tab, component) {
        events.push({ op: "create", tab, component });
        return onCreate ? onCreate(tab, component) : { id: "r1", component };
      },
      async remove(tab, itemId) {
        events.push({ op: "remove", tab, itemId });
        return onRemove ? onRemove(tab, itemId) : null;
      },
    },
    refreshLibraryItems() {
      events.push({ op: "refresh" });
    },
  };

  registerLibraryUi(app, { artifact: artifact(), engine: ENGINE, cache: { seeds } });
  return { app, events };
}

function field(app, name) {
  return app.libraryFields.find((spec) => spec.field === name);
}

test("tabs mirror the shared registry and open/close manage the surface", () => {
  const { app } = setup();

  assert.deepEqual(
    app.libraryTabs,
    Object.entries(CATALOGS).map(([id, meta]) => ({ id, label: meta.label }))
  );
  assert.equal(app.libraryOpen, false);

  app.openLibrary("yeast");
  assert.equal(app.libraryOpen, true);
  assert.equal(app.libraryTab, "yeast");

  app.libraryDraft = { name: "x" };
  app.libraryErrors = [{ field: "*", message: "bad" }];
  app.closeLibrary();
  assert.equal(app.libraryOpen, false);
  assert.equal(app.libraryDraft, null);
  assert.deepEqual(app.libraryErrors, []);
});

test("fields are generated from the primitive schema, excluding the identity field", () => {
  const { app } = setup();
  app.libraryTab = "malt";
  const names = app.libraryFields.map((spec) => spec.field);

  assert.equal(names.includes("id"), false);
  assert.deepEqual(field(app, "category"), {
    field: "category",
    label: "category",
    kind: "select",
    options: artifact().taxonomies.malt_category,
  });
  assert.equal(field(app, "name").kind, "text");
  assert.equal(field(app, "yield_fraction").unitId, "pct");
  assert.equal(field(app, "color_lovibond").unitId, "EBC");
});

test("field units follow the master unit mode", () => {
  const { app } = setup({ unitMode: { percentage: "fraction", grain_color: "Lovibond" } });
  app.libraryTab = "malt";

  assert.equal(field(app, "yield_fraction").unitId, "fraction");
  assert.equal(field(app, "color_lovibond").unitId, "Lovibond");
});

test("display converts base values to the active unit and input converts back", () => {
  const { app } = setup();
  app.libraryTab = "malt";
  app.libraryDraft = { yield_fraction: 0.8, color_lovibond: 10, name: "Pale" };

  assert.equal(app.libraryFieldDisplay("yield_fraction"), 80);
  assert.equal(app.libraryFieldDisplay("color_lovibond"), 19.7);
  assert.equal(app.libraryFieldDisplay("missing"), "");

  app.librarySetField("yield_fraction", "80");
  assert.equal(app.libraryDraft.yield_fraction, 0.8);
  app.librarySetField("name", "Pilsner");
  assert.equal(app.libraryDraft.name, "Pilsner");
});

test("saving a valid new record creates it and refreshes the surface", async () => {
  const { app, events } = setup();
  app.libraryTab = "malt";
  app.libraryDraft = { name: "House Pale", category: "BASE", yield_fraction: 0.8 };

  await app.saveLibraryItem();

  const create = events.find((event) => event.op === "create");
  assert.deepEqual(create, {
    op: "create",
    tab: "malt",
    component: { name: "House Pale", category: "BASE", yield_fraction: 0.8 },
  });
  assert.equal(app.libraryDraft, null);
  assert.deepEqual(app.libraryErrors, []);
  assert.equal(events.at(-1).op, "refresh");
});

test("invalid records are rejected locally and keep the draft", async () => {
  const { app, events } = setup();
  app.libraryTab = "malt";
  app.libraryDraft = { category: "BASE" };

  await app.saveLibraryItem();

  assert.ok(app.libraryErrors.some((error) => error.field === "name"));
  assert.equal(events.some((event) => event.op === "create"), false);
  assert.deepEqual(app.libraryDraft, { category: "BASE" });
});

test("server validation details surface as errors", async () => {
  const { app } = setup({
    onCreate: () => {
      const err = new Error("Invalid catalog component");
      err.details = { errors: ["yield_fraction: violates domain"] };
      throw err;
    },
  });
  app.libraryTab = "malt";
  app.libraryDraft = { name: "House Pale", category: "BASE" };

  await app.saveLibraryItem();

  assert.deepEqual(app.libraryErrors, [
    { field: "*", message: "yield_fraction: violates domain" },
  ]);
});

test("deleting a record calls the library and refreshes", async () => {
  const { app, events } = setup();
  app.libraryTab = "malt";

  await app.deleteLibraryItem("r1");

  assert.deepEqual(
    events.filter((event) => event.op === "remove"),
    [{ op: "remove", tab: "malt", itemId: "r1" }]
  );
  assert.equal(events.at(-1).op, "refresh");
});

test("seed listings are read-only and capped for display", () => {
  const seeds = {
    yeasts: Object.fromEntries(
      Array.from({ length: 60 }, (_, i) => [`y${i}`, { id: `y${i}`, name: `Yeast ${i}` }])
    ),
  };
  const { app } = setup({ seeds });
  app.libraryTab = "yeast";

  assert.equal(app.librarySeedItems.length, 50);
  assert.equal(app.librarySeedCount, 60);
  assert.equal(app.librarySeedItemTitle(app.librarySeedItems[0]), "Yeast 0");
});
