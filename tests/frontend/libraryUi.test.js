import test from "node:test";
import assert from "node:assert/strict";

import { registerLibraryUi } from "../../frontend/src/adapters/libraryUi.js";
import { dialogFocus, dialogRestore } from "../../frontend/src/adapters/modalFocus.js";
import {
  CATALOGS,
  IDENTITY_KINDS,
  INGREDIENT_KINDS,
} from "../../frontend/src/store/userCatalog.js";
import { artifact } from "../guards/util.js";

const ENGINE = {
  call: () => {
    throw new Error("linear dimensions must not call the engine");
  },
};

function setup({
  unitMode = {},
  records = {},
  seeds = {},
  onCreate,
  onRemove,
  onRecordsChanged,
  loaded = () => true,
  loading = () => false,
} = {}) {
  const events = [];
  const app = {
    libraryRevision: 0,
    unitMode,
    onRecordsChanged,
    library: {
      loaded,
      loading,
      error: () => null,
      has: (kind, id) => Boolean(records[kind]?.some((r) => r.id === id)),
      async refresh() {
        events.push({ op: "refreshLibrary" });
      },
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

test("the surface has two sections: identity sources and formulation ingredients", () => {
  const { app } = setup();

  assert.deepEqual(
    app.identityTabs,
    IDENTITY_KINDS.map((id) => ({ id, label: CATALOGS[id].label }))
  );
  assert.deepEqual(
    app.libraryTabs,
    INGREDIENT_KINDS.map((id) => ({ id, label: CATALOGS[id].label }))
  );
  assert.equal(app.libraryOpen, false);

  app.openLibrary("equipment");
  assert.equal(app.libraryOpen, true);
  assert.equal(app.librarySection, "sources");
  assert.equal(app.activeKind, "equipment");

  app.openLibrary("yeast");
  assert.equal(app.librarySection, "ingredients");
  assert.equal(app.libraryTab, "yeast");
  assert.equal(app.activeKind, "yeast");

  app.libraryDraft = { name: "x" };
  app.closeLibrary();
  assert.equal(app.libraryOpen, false);
  assert.equal(app.libraryDraft, null);
});

test("fields are generated from the primitive schema, excluding identity and lineage", () => {
  const { app } = setup();
  app.selectSourceKind("style");
  const names = app.libraryFields.map((spec) => spec.field);

  assert.equal(names.includes("id"), false);
  assert.equal(names.includes("forked_from_id"), false);
  assert.equal(names.includes("forked_from_name"), false);
  assert.equal(field(app, "og_min").kind, "number");
  assert.equal(field(app, "name").kind, "text");

  app.selectLibraryTab("malt");
  assert.equal(field(app, "category").kind, "select");
  assert.deepEqual(field(app, "category").options, artifact().taxonomies.malt_category);
});

test("field units follow the master unit mode", () => {
  const { app } = setup({ unitMode: { percentage: "fraction", grain_color: "Lovibond" } });
  app.selectLibraryTab("malt");

  assert.equal(field(app, "yield_fraction").unitId, "fraction");
  assert.equal(field(app, "color_lovibond").unitId, "Lovibond");
});

test("display converts base values to the active unit and input converts back", () => {
  const { app } = setup();
  app.selectLibraryTab("malt");
  app.libraryDraft = { yield_fraction: 0.8, color_lovibond: 10, name: "Pale" };

  assert.equal(app.libraryFieldDisplay("yield_fraction"), "80.0");
  assert.equal(app.libraryFieldDisplay("color_lovibond"), "19.7");
  assert.equal(app.libraryFieldDisplay("missing"), "");

  app.librarySetField("yield_fraction", "80");
  assert.equal(app.libraryDraft.yield_fraction, 0.8);
  app.librarySetField("name", "Pilsner");
  assert.equal(app.libraryDraft.name, "Pilsner");
});

test("styles are forked, never authored from scratch", () => {
  const { app, events } = setup();
  app.selectSourceKind("style");

  assert.equal(app.canAuthorRecord, false);
  assert.equal(app.canForkRecord, true);

  app.newLibraryItem();
  assert.equal(app.libraryDraft, null);

  app.forkLibraryItem({ id: "21A", name: "American IPA", og_min: 1.056 });
  assert.equal(app.libraryDraft.name, "American IPA (copy)");
  assert.equal(app.libraryDraft.id, undefined);
  assert.equal(app.libraryDraft.forked_from_id, "21A");
  assert.equal(app.libraryDraft.forked_from_name, "American IPA");
  assert.equal(events.some((event) => event.op === "create"), false);
});

test("saving a forked style posts it under the style kind and refreshes", async () => {
  const { app, events } = setup();
  app.selectSourceKind("style");
  app.forkLibraryItem({ id: "21A", name: "American IPA", og_min: 1.056, og_max: 1.07 });

  await app.saveLibraryItem();

  const create = events.find((event) => event.op === "create");
  assert.equal(create.tab, "style");
  assert.equal(create.component.id, undefined);
  assert.equal(create.component.forked_from_id, "21A");
  assert.equal(create.component.forked_from_name, "American IPA");
  assert.equal(app.libraryDraft, null);
  assert.equal(events.at(-1).op, "refresh");
});

test("saving a valid new ingredient record creates it and refreshes", async () => {
  const { app, events } = setup();
  app.selectLibraryTab("malt");
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
  app.selectLibraryTab("malt");
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
  app.selectLibraryTab("malt");
  app.libraryDraft = { name: "House Pale", category: "BASE" };

  await app.saveLibraryItem();

  assert.deepEqual(app.libraryErrors, [
    { field: "*", message: "yield_fraction: violates domain" },
  ]);
});

test("deleting a record calls the library and refreshes", async () => {
  const { app, events } = setup();
  app.selectLibraryTab("malt");

  await app.deleteLibraryItem("r1");

  assert.deepEqual(
    events.filter((event) => event.op === "remove"),
    [{ op: "remove", tab: "malt", itemId: "r1" }]
  );
  assert.equal(events.at(-1).op, "refresh");
});

test("record mutations notify the host so the batch setup cache stays fresh", async () => {
  let notified = 0;
  const { app } = setup({ onRecordsChanged: () => (notified += 1) });
  app.selectLibraryTab("malt");
  app.libraryDraft = { name: "House Pale", category: "BASE", yield_fraction: 0.8 };

  await app.saveLibraryItem();

  assert.equal(notified, 1);
});

test("search ranks name matches and gates notes behind the toggle", () => {
  const seeds = {
    malts: {
      m1: { id: "m1", name: "Centennial Malt", notes: "citrus" },
      m2: { id: "m2", name: "Pale Malt", notes: "centennial-like" },
      m3: { id: "m3", name: "Munich Malt", notes: "malty" },
    },
  };
  const records = {
    malt: [{ id: "r1", name: "My Munich", notes: "centennial-ish" }],
  };
  const { app } = setup({ seeds, records });
  app.selectLibraryTab("malt");

  app.librarySetSearch("cen");
  assert.deepEqual(app.librarySeedItems.map((s) => s.id), ["m1"]);
  assert.deepEqual(app.libraryRecords.map((r) => r.id), []);

  app.toggleLibrarySearchNotes();
  assert.deepEqual(app.librarySeedItems.map((s) => s.id), ["m1", "m2"]);
  assert.deepEqual(app.libraryRecords.map((r) => r.id), ["r1"]);

  app.selectLibraryTab("yeast");
  assert.equal(app.librarySearch, "");
  assert.equal(app.librarySearchNotes, false);
});

test("seed listings are read-only and capped for display", () => {
  const seeds = {
    yeasts: Object.fromEntries(
      Array.from({ length: 60 }, (_, i) => [`y${i}`, { id: `y${i}`, name: `Yeast ${i}` }])
    ),
  };
  const { app } = setup({ seeds });
  app.selectLibraryTab("yeast");

  assert.equal(app.librarySeedItems.length, 50);
  assert.equal(app.librarySeedCount, 60);
  assert.equal(app.librarySeedItemTitle(app.librarySeedItems[0]), "Yeast 0");
});

test("closing the Library returns focus to the element that opened it", () => {
  const { app } = setup();
  const doc = { activeElement: null };
  const trigger = {
    focused: 0,
    focus() {
      this.focused += 1;
      doc.activeElement = this;
    },
  };
  const panel = {
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
    focus() {},
  };

  trigger.focus();
  dialogFocus(panel, true, { document: doc, requestAnimationFrame: (fn) => fn() });
  app.openLibrary("equipment");
  app.closeLibrary();

  assert.equal(app.libraryOpen, false);
  assert.equal(trigger.focused, 2);
  dialogRestore();
});

test("opening the Library fetches records only when the cache is cold", async () => {
  const cold = setup({ loaded: () => false, loading: () => false });
  cold.app.openLibrary("malt");
  await Promise.resolve();
  assert.ok(cold.events.some((event) => event.op === "refreshLibrary"));
  assert.ok(cold.events.some((event) => event.op === "refresh"));

  dialogRestore();
  const warm = setup();
  warm.app.openLibrary("malt");
  await Promise.resolve();
  assert.equal(warm.events.some((event) => event.op === "refreshLibrary"), false);
});

test("a permanent delete asks for confirmation when a window exists", async () => {
  const { app, events } = setup();
  app.selectLibraryTab("malt");
  const original = globalThis.window;

  try {
    globalThis.window = { confirm: () => false };
    await app.deleteLibraryItem("r1");
    assert.equal(events.filter((event) => event.op === "remove").length, 0);

    globalThis.window = { confirm: () => true };
    await app.deleteLibraryItem("r1");
    assert.equal(events.filter((event) => event.op === "remove").length, 1);
  } finally {
    if (original === undefined) delete globalThis.window;
    else globalThis.window = original;
  }
});

test("a failed delete surfaces the message in the Library", async () => {
  const { app } = setup({
    onRemove: async () => {
      throw new Error("record is referenced");
    },
  });
  app.selectLibraryTab("malt");

  await app.deleteLibraryItem("r1");

  assert.deepEqual(app.libraryErrors, [{ field: "*", message: "record is referenced" }]);
});
