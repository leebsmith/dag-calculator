import test from "node:test";
import assert from "node:assert/strict";

import { registerUserCatalogUi } from "../../frontend/src/adapters/userCatalogUi.js";
import { CATALOGS } from "../../frontend/src/store/userCatalog.js";
import { artifact } from "../guards/util.js";

const ENGINE = {
  call: () => {
    throw new Error("linear dimensions must not call the engine");
  },
};

function setup({ unitMode = {}, catalogs = {}, onAdd, onUpdate, onRemove } = {}) {
  const events = [];
  const app = {
    catalogRevision: 0,
    unitMode,
    userCatalogTab: "malt",
    userCatalog: {
      catalogs,
      list(tab) {
        events.push({ op: "list", tab });
        return Object.values(catalogs[tab] ?? {});
      },
      add(tab, item) {
        events.push({ op: "add", tab, item });
        if (onAdd) onAdd(tab, item);
      },
      update(tab, id, item) {
        events.push({ op: "update", tab, id, item });
        if (onUpdate) onUpdate(tab, id, item);
      },
      remove(tab, id) {
        events.push({ op: "remove", tab, id });
        if (onRemove) onRemove(tab, id);
      },
    },
    refreshUserItems() {
      events.push({ op: "refresh" });
    },
  };

  registerUserCatalogUi(app, { artifact: artifact(), engine: ENGINE });
  return { app, events };
}

function field(app, name) {
  return app.userCatalogFields.find((spec) => spec.field === name);
}

test("tabs mirror the user-catalog registry", () => {
  const { app } = setup();

  assert.deepEqual(
    app.userCatalogTabs,
    Object.entries(CATALOGS).map(([id, meta]) => ({ id, label: meta.label }))
  );
  assert.equal(app.userCatalogOpen, false);
  assert.equal(app.userCatalogDraft, null);
  assert.deepEqual(app.userCatalogErrors, []);
});

test("fields are derived from the primitive schema, excluding the identity field", () => {
  const { app } = setup();
  const names = app.userCatalogFields.map((spec) => spec.field);

  assert.equal(names.includes("id"), false);
  assert.deepEqual(field(app, "category"), {
    field: "category",
    label: "category",
    kind: "select",
    options: artifact().taxonomies.malt_category,
  });
  assert.equal(field(app, "name").kind, "text");
  assert.deepEqual(field(app, "yield_fraction"), {
    field: "yield_fraction",
    label: "yield_fraction",
    kind: "number",
    dimension: "percentage",
    unitId: "pct",
    symbol: "%",
    decimals: null,
  });
  assert.equal(field(app, "color_lovibond").unitId, "EBC");
  assert.equal(field(app, "color_lovibond").decimals, 1);
});

test("field units follow the master unit mode", () => {
  const { app } = setup({ unitMode: { percentage: "fraction", grain_color: "Lovibond" } });

  assert.equal(field(app, "yield_fraction").unitId, "fraction");
  assert.equal(field(app, "yield_fraction").symbol, "×1");
  assert.equal(field(app, "color_lovibond").unitId, "Lovibond");
  assert.equal(field(app, "color_lovibond").symbol, "°L");
});

test("item identity and title fall back across catalogs", () => {
  const { app } = setup();

  assert.equal(app.userItemId({ id: "m1" }), "m1");
  assert.equal(app.userItemId({ report_id: "r1" }), "r1");
  assert.equal(app.userItemId(null), "");
  assert.equal(app.userItemTitle({ name: "Pale" }), "Pale");
  assert.equal(app.userItemTitle({ laboratory: "Ward" }), "Ward");
  assert.equal(app.userItemTitle({ id: "x" }), "x");
});

test("display converts base values into the active unit", () => {
  const { app } = setup();
  app.userCatalogDraft = { yield_fraction: 0.8, color_lovibond: 10, name: "Pale", notes: undefined };

  assert.equal(app.userFieldDisplay("yield_fraction"), 80);
  assert.equal(app.userFieldDisplay("color_lovibond"), 19.7);
  assert.equal(app.userFieldDisplay("name"), "Pale");
  assert.equal(app.userFieldDisplay("notes"), "");
  assert.equal(app.userFieldDisplay("missing"), "");
});

test("input converts back to base units and clears on empty", () => {
  const { app } = setup();
  app.userCatalogDraft = { name: "Pale" };

  app.userSetField("yield_fraction", "80");
  assert.equal(app.userCatalogDraft.yield_fraction, 0.8);

  app.userSetField("color_lovibond", "19.7");
  assert.equal(Number(app.userCatalogDraft.color_lovibond.toFixed(4)), 10);

  app.userSetField("name", "Pilsner");
  assert.equal(app.userCatalogDraft.name, "Pilsner");

  app.userSetField("notes", "x");
  app.userSetField("notes", "");
  assert.equal("notes" in app.userCatalogDraft, false);
});

test("non-numeric input degrades to zero instead of NaN", () => {
  const { app } = setup();
  app.userCatalogDraft = {};

  app.userSetField("moisture_fraction", "abc");

  assert.equal(app.userCatalogDraft.moisture_fraction, 0);
});

test("open and close manage the menu surface", () => {
  const { app } = setup();

  app.openUserCatalog();
  assert.equal(app.userCatalogOpen, true);

  app.userCatalogDraft = { name: "Pale" };
  app.userCatalogErrors = [{ field: "*", message: "bad" }];
  app.closeUserCatalog();
  assert.equal(app.userCatalogOpen, false);
  assert.equal(app.userCatalogDraft, null);
  assert.deepEqual(app.userCatalogErrors, []);
});

test("newUserItem starts an empty draft; editUserItem clones the stored item", () => {
  const { app } = setup({ catalogs: { malt: { m1: { id: "m1", name: "Pale" } } } });

  app.newUserItem();
  assert.deepEqual(app.userCatalogDraft, {});
  assert.equal(app.userCatalogNew, true);

  app.editUserItem("m1");
  assert.deepEqual(app.userCatalogDraft, { id: "m1", name: "Pale" });
  assert.equal(app.userCatalogNew, false);

  app.editUserItem("missing");
  assert.equal(app.userCatalogDraft, null);
});

test("saving a new item adds it and refreshes the surface", () => {
  const { app, events } = setup();
  app.userCatalogDraft = { name: "Pale", yield_fraction: 0.8 };
  app.userCatalogNew = true;

  app.saveUserItem();

  assert.deepEqual(events.at(-2), { op: "add", tab: "malt", item: { name: "Pale", yield_fraction: 0.8 } });
  assert.deepEqual(events.at(-1), { op: "refresh" });
  assert.equal(app.userCatalogDraft, null);
  assert.deepEqual(app.userCatalogErrors, []);
});

test("saving an existing item updates it by identity field", () => {
  const { app, events } = setup();

  app.userCatalogDraft = { id: "m1", name: "Pale" };
  app.saveUserItem();

  assert.deepEqual(events.at(-2), { op: "update", tab: "malt", id: "m1", item: { id: "m1", name: "Pale" } });
});

test("validation failures are surfaced as field errors and keep the draft", () => {
  const { app } = setup({
    onAdd: () => {
      const err = new Error("invalid");
      err.errors = [{ field: "yield_fraction", message: "out of domain" }];
      throw err;
    },
  });
  app.userCatalogDraft = { name: "Pale" };
  app.userCatalogNew = true;

  app.saveUserItem();

  assert.deepEqual(app.userCatalogErrors, [{ field: "yield_fraction", message: "out of domain" }]);
  assert.deepEqual(app.userCatalogDraft, { name: "Pale" });
});

test("unexpected save failures become a wildcard error", () => {
  const { app } = setup({
    onAdd: () => {
      throw "storage full";
    },
  });
  app.userCatalogNew = true;
  app.userCatalogDraft = {};

  app.saveUserItem();

  assert.deepEqual(app.userCatalogErrors, [{ field: "*", message: "storage full" }]);
});

test("deleting closes the editor when it is the edited item", () => {
  const { app, events } = setup();
  app.userCatalogDraft = { id: "m1" };

  app.deleteUserItem("m1");
  assert.equal(app.userCatalogDraft, null);
  assert.deepEqual(events, [
    { op: "remove", tab: "malt", id: "m1" },
    { op: "refresh" },
  ]);

  app.userCatalogDraft = { id: "m2" };
  app.deleteUserItem("m1");
  assert.deepEqual(app.userCatalogDraft, { id: "m2" });
});

test("selecting a tab resets the draft and errors", () => {
  const { app } = setup();
  app.userCatalogDraft = { id: "m1" };
  app.userCatalogErrors = [{ field: "*", message: "bad" }];

  app.selectUserCatalogTab("hop");

  assert.equal(app.userCatalogTab, "hop");
  assert.equal(app.userCatalogDraft, null);
  assert.deepEqual(app.userCatalogErrors, []);
});

test("userCatalogItems lists the active tab", () => {
  const { app, events } = setup({ catalogs: { malt: { m1: { id: "m1" } } } });

  assert.deepEqual(app.userCatalogItems, [{ id: "m1" }]);
  assert.deepEqual(events, [{ op: "list", tab: "malt" }]);
});
