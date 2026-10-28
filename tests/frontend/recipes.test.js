import test from "node:test";
import assert from "node:assert/strict";

import { createRecipesStore } from "../../frontend/src/store/recipes.js";
import { errorCounters, resetErrorObservability } from "../../frontend/src/observability.js";

const NOW = Date.UTC(2026, 9, 21, 12) / 1000;

function batch(id, overrides = {}) {
  return { id, name: id, status: "draft", trashed: false, updated_at: NOW, ...overrides };
}

const BATCHES = [
  batch("draft-new", { updated_at: NOW }),
  batch("draft-old", { updated_at: NOW - 10 }),
  batch("frozen", { status: "frozen", updated_at: NOW - 5 }),
  batch("trashed", { trashed: true, updated_at: NOW - 1 }),
];

function fakePersistence(overrides = {}) {
  const calls = [];
  const active = { id: "a1", name: "Active batch" };
  const record = (name) => (...args) => {
    calls.push([name, ...args]);
    return Promise.resolve();
  };
  return {
    calls,
    active,
    getActive: () => active,
    list: async () => {
      calls.push(["list"]);
      return BATCHES;
    },
    open: record("open"),
    fork: record("fork"),
    renameActive: record("renameActive"),
    renameBatch: record("renameBatch"),
    trashActive: record("trashActive"),
    trashBatch: record("trashBatch"),
    restore: record("restore"),
    deletePermanent: record("deletePermanent"),
    freezeActive: record("freezeActive"),
    reportBundleForActive: async () => ({ name: "Active batch", bundle: { id: "active" } }),
    reportBundleFor: async (id, name) => ({ name, bundle: { id } }),
    reportFor: async (id) => ({ blob: { id }, type: "application/pdf" }),
    reportForActive: async () => ({ blob: { id: "active" }, type: "application/pdf" }),
    flushSave: record("flushSave"),
    saveNow: record("saveNow"),
    resolveConflictByReload: record("reload"),
    ...overrides,
  };
}

function setupStub() {
  return { opened: 0, openModal() { this.opened += 1; } };
}

function makeStore(
  persistence = fakePersistence(),
  anchor = () => "right:0px; top:8px",
  download = () => {},
  downloadFile = download
) {
  const setup = setupStub();
  const store = createRecipesStore({
    persistence,
    getSetup: () => setup,
    anchor,
    download,
    downloadFile,
  });
  return { store, persistence, setup };
}

function quiet(fn) {
  const original = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      console.error = original;
    })
    .then((result) => ({ result, logged }));
}

test("rows apply the scope partition and the active sort", () => {
  const { store } = makeStore();
  store.batches = BATCHES;

  assert.deepEqual(store.rows.map((b) => b.id), ["draft-new", "frozen", "draft-old"]);
  assert.equal(store.scopeLabel, "All");

  store.setScope("drafts");
  assert.deepEqual(store.rows.map((b) => b.id), ["draft-new", "draft-old"]);
  assert.equal(store.scopeLabel, "Drafts");

  store.setSort("title");
  assert.deepEqual(store.rows.map((b) => b.id), ["draft-new", "draft-old"]);
  assert.equal(store.sortLabel, "Title");
});

test("setScope rejects unknown scopes and clears transient surfaces", () => {
  const { store } = makeStore();
  store.setScope("nope");
  assert.equal(store.scope, "all");

  store.rowMenu = batch("x");
  store.sortOpen = true;
  store.renamingId = "x";
  store.setScope("frozen");
  assert.equal(store.scope, "frozen");
  assert.equal(store.rowMenu, null);
  assert.equal(store.sortOpen, false);
  assert.equal(store.renamingId, null);
});

test("emptyMessage names the active scope's emptiness", () => {
  const { store } = makeStore();
  store.setScope("trash");
  assert.equal(store.emptyMessage, "Trash is empty.");
  store.setScope("drafts");
  assert.equal(store.emptyMessage, "No drafts.");
  store.setScope("frozen");
  assert.equal(store.emptyMessage, "No frozen batches.");
  store.setScope("all");
  assert.equal(store.emptyMessage, "No batches yet. Create your first batch.");
});

test("the sort menu anchors from the trigger and toggles closed", () => {
  const { store } = makeStore();
  const event = { currentTarget: {} };

  store.toggleSort(event);
  assert.equal(store.sortOpen, true);
  assert.equal(store.sortMenuStyle, "right:0px; top:8px");

  store.toggleSort(event);
  assert.equal(store.sortOpen, false);
});

test("setSort only accepts the two documented orders", () => {
  const { store } = makeStore();
  store.setSort("bogus");
  assert.equal(store.sort, "modified");
  store.setSort("title");
  assert.equal(store.sort, "title");
  assert.equal(store.sortOpen, false);
});

test("the row menu toggles on the same row and closes the sort menu", () => {
  const { store } = makeStore();
  const row = batch("row-1");
  store.sortOpen = true;

  store.openRowMenu(row, { currentTarget: {} });
  assert.equal(store.rowMenu, row);
  assert.equal(store.sortOpen, false);
  assert.equal(store.rowMenuStyle, "right:0px; top:8px");

  store.openRowMenu(row, { currentTarget: {} });
  assert.equal(store.rowMenu, null);
});

test("forkRow forks the menu's batch and closes the menu", async () => {
  const { store, persistence } = makeStore();
  store.rowMenu = batch("frozen-1");
  await store.forkRow();

  assert.equal(store.rowMenu, null);
  assert.deepEqual(persistence.calls, [["fork", "frozen-1"], ["list"]]);
  assert.equal(store.view, "editor");
  assert.equal(store.scope, "all");
});

test("forkRow without an open menu does nothing", async () => {
  const { store, persistence } = makeStore();
  await store.forkRow();
  assert.deepEqual(persistence.calls, []);
});

test("beginRename seeds the input and startRename pulls it from the row menu", () => {
  const { store } = makeStore();
  const row = batch("row-1", { name: "House Pale" });

  store.beginRename(row);
  assert.equal(store.renamingId, "row-1");
  assert.equal(store.renameValue, "House Pale");

  store.cancelRename();
  assert.equal(store.renamingId, null);

  store.rowMenu = row;
  store.startRename();
  assert.equal(store.renamingId, "row-1");
  assert.equal(store.rowMenu, null);

  store.setRenameValue("New name");
  assert.equal(store.renameValue, "New name");
});

test("commitRename ignores rows that are not in rename mode", async () => {
  const { store, persistence } = makeStore();
  await store.commitRename(batch("row-1"));
  assert.deepEqual(persistence.calls, []);
});

test("commitRename skips empty and unchanged names", async () => {
  const { store, persistence } = makeStore();
  const row = batch("row-1", { name: "House Pale" });

  store.beginRename(row);
  store.setRenameValue("   ");
  await store.commitRename(row);
  assert.equal(store.renamingId, null);
  assert.deepEqual(persistence.calls, []);

  store.beginRename(row);
  store.setRenameValue("House Pale");
  await store.commitRename(row);
  assert.deepEqual(persistence.calls, []);
});

test("commitRename persists the trimmed name and refreshes the list", async () => {
  const { store, persistence } = makeStore();
  const row = batch("row-1", { name: "House Pale" });

  store.beginRename(row);
  store.setRenameValue("  House Pale 2  ");
  await store.commitRename(row);

  assert.deepEqual(persistence.calls, [["renameBatch", "row-1", "House Pale 2"], ["list"]]);
});

test("commitRename swallows a failed write and leaves the list alone", async () => {
  const persistence = fakePersistence({
    renameBatch: async () => {
      throw new Error("nope");
    },
  });
  const { store } = makeStore(persistence);
  const row = batch("row-1", { name: "House Pale" });
  store.beginRename(row);
  store.setRenameValue("New name");

  const { logged } = await quiet(() => store.commitRename(row));
  assert.equal(logged.length, 1);
  assert.deepEqual(persistence.calls, []);
});

test("row trash, restore, and permanent delete refresh the list", async () => {
  const { store, persistence } = makeStore();
  const row = batch("row-1");

  store.rowMenu = row;
  await store.trashRow();
  store.closeRowMenu();
  await store.restoreRow(row);
  await store.deleteRow(row);

  assert.deepEqual(persistence.calls, [
    ["trashBatch", "row-1"],
    ["list"],
    ["restore", "row-1"],
    ["list"],
    ["deletePermanent", "row-1"],
    ["list"],
  ]);
});

test("trashRow without a menu does nothing", async () => {
  const { store, persistence } = makeStore();
  await store.trashRow();
  assert.deepEqual(persistence.calls, []);
});

test("row action failures are logged, not thrown", async () => {
  const persistence = fakePersistence({
    trashBatch: async () => {
      throw new Error("boom");
    },
    restore: async () => {
      throw new Error("boom");
    },
    deletePermanent: async () => {
      throw new Error("boom");
    },
  });
  const { store } = makeStore(persistence);
  const row = batch("row-1");

  const { logged } = await quiet(async () => {
    store.rowMenu = row;
    await store.trashRow();
    await store.restoreRow(row);
    await store.deleteRow(row);
  });

  assert.equal(logged.length, 3);
});

test("conflict and save commands delegate to persistence", async () => {
  const { store, persistence } = makeStore();
  await store.keepMine();
  await store.reloadFromRemote();
  await store.retrySave();

  assert.deepEqual(persistence.calls, [["saveNow", { force: true }], ["reload"], ["saveNow"]]);
});

test("newBatch opens the setup dialog on the setup store", async () => {
  const { store, setup } = makeStore();
  await store.newBatch();
  assert.equal(setup.opened, 1);
});

test("openDraft enters the editor and resets the scope", async () => {
  const { store, persistence } = makeStore();
  store.batches = BATCHES;
  store.setScope("trash");

  await store.openDraft("draft-new");

  assert.deepEqual(persistence.calls, [["open", "draft-new"]]);
  assert.equal(store.view, "editor");
  assert.equal(store.scope, "all");
  assert.equal(store.activeId, "a1");
  assert.equal(store.activeName, "Active batch");
});

test("rename and backToBatches mirror the active record", async () => {
  const { store, persistence } = makeStore();

  await store.rename("Renamed");
  assert.deepEqual(persistence.calls, [["renameActive", "Renamed"]]);
  assert.equal(store.activeName, "Active batch");

  store.renamingId = "row-1";
  store.sortOpen = true;
  await store.backToBatches();

  assert.deepEqual(persistence.calls.slice(1), [["flushSave"], ["list"]]);
  assert.equal(store.renamingId, null);
  assert.equal(store.sortOpen, false);
  assert.equal(store.view, "batches");
});

test("workspace verbs refresh and return to the list", async () => {
  const { store, persistence } = makeStore();
  store.view = "editor";

  await store.trash();
  assert.deepEqual(persistence.calls, [["trashActive"], ["list"]]);
  assert.equal(store.view, "batches");
  assert.equal(store.scope, "all");

  await store.freeze();
  await store.restore("b2");
  await store.deletePermanent("b3");
  assert.deepEqual(persistence.calls.slice(2), [
    ["freezeActive"],
    ["list"],
    ["restore", "b2"],
    ["list"],
    ["deletePermanent", "b3"],
    ["list"],
  ]);
});

test("refresh clears the load error and mirrors the active batch", async () => {
  const { store } = makeStore();
  store.loadError = true;
  await store.refresh();

  assert.equal(store.loadError, false);
  assert.equal(store.batches.length, BATCHES.length);
  assert.equal(store.activeId, "a1");
});

test("retryLoad reports a failed list fetch as a load error", async () => {
  const persistence = fakePersistence({
    list: async () => {
      throw new Error("offline");
    },
  });
  const { store } = makeStore(persistence);
  await store.retryLoad();
  assert.equal(store.loadError, true);
});

test("row labels read the snapshotted identity", () => {
  const { store } = makeStore();
  const row = batch("row-1", {
    identity: {
      style: { name: "American IPA" },
      equipment: { name: "HERMS 30L" },
      "water.source": { laboratory: "Ward Lab" },
    },
    parent_name: "House Pale",
  });

  assert.equal(store.styleLabel(row), "American IPA");
  assert.equal(store.rigLabel(row), "HERMS 30L");
  assert.equal(store.waterLabel(row), "Ward Lab");
  assert.equal(store.parentLabel(row), "House Pale");
  assert.equal(store.dateLabel(NOW), new Date(NOW * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }));
  assert.equal(store.styleLabel(batch("bare")), "");
});

test("canCreateBatch follows the setup prerequisites", () => {
  const setup = { prerequisiteStatus: () => ({ ready: false, missing: ["styles"] }) };
  const store = createRecipesStore({ persistence: fakePersistence(), getSetup: () => setup });
  assert.equal(store.canCreateBatch, false);
});


test("downloadActiveBundle hands the bundle and a safe filename to the downloader", async () => {
  const files = [];
  const persistence = fakePersistence({
    reportBundleForActive: async () => ({
      name: "House Pale / v2",
      bundle: { id: "active" },
    }),
  });
  const { store } = makeStore(persistence, () => "", (bundle, filename) =>
    files.push({ bundle, filename })
  );

  await store.downloadActiveBundle();

  assert.deepEqual(files, [
    { bundle: { id: "active" }, filename: "house-pale-v2.report-bundle.json" },
  ]);
});

test("downloadRowBundle only serves frozen rows and closes the menu", async () => {
  const files = [];
  const { store } = makeStore(fakePersistence(), () => "", (bundle, filename) =>
    files.push({ bundle, filename })
  );

  store.rowMenu = { id: "frozen", name: "Saison", status: "draft" };
  await store.downloadRowBundle();
  assert.deepEqual(files, []);
  assert.equal(store.rowMenu, null);

  store.rowMenu = { id: "frozen", name: "Saison", status: "frozen" };
  await store.downloadRowBundle();
  assert.deepEqual(files, [
    { bundle: { id: "frozen" }, filename: "saison.report-bundle.json" },
  ]);
  assert.equal(store.rowMenu, null);
});

test("downloadRowReport serves frozen rows from the stored report", async () => {
  const files = [];
  const { store } = makeStore(fakePersistence(), () => "", () => {}, (blob, filename) =>
    files.push({ blob, filename })
  );

  store.rowMenu = { id: "frozen", name: "Saison", status: "draft" };
  await store.downloadRowReport();
  assert.deepEqual(files, []);
  assert.equal(store.rowMenu, null);

  store.rowMenu = { id: "frozen", name: "Saison", status: "frozen" };
  await store.downloadRowReport();
  assert.deepEqual(files, [
    { blob: { id: "frozen" }, filename: "saison.pdf" },
  ]);
  assert.equal(store.rowMenu, null);
});

test("downloadActiveReport hands the blob and a safe filename to the downloader", async () => {
  const files = [];
  const { store } = makeStore(
    fakePersistence({
      reportForActive: async () => ({ blob: { kind: "pdf" }, type: "application/pdf" }),
    }),
    () => "",
    () => {},
    (blob, filename) => files.push({ blob, filename })
  );
  store.activeName = "House Pale / v2";

  await store.downloadActiveReport();

  assert.deepEqual(files, [
    { blob: { kind: "pdf" }, filename: "house-pale-v2.pdf" },
  ]);
});

test("a failed report download surfaces the server message", async () => {
  resetErrorObservability();
  const files = [];
  const { store } = makeStore(
    fakePersistence({
      reportForActive: async () => {
        throw new Error("nothing to report: no requested section is present");
      },
    }),
    () => "",
    () => {},
    (blob, filename) => files.push({ blob, filename })
  );

  const { logged } = await quiet(() => store.downloadActiveReport());

  assert.deepEqual(files, [], "a failed report must not download");
  assert.deepEqual(store.actionError, {
    title: "Couldn't build the report",
    message: "nothing to report: no requested section is present",
  });
  assert.equal(logged.length, 1);
});

test("a failed bundle download surfaces the server message instead of the console", async () => {
  resetErrorObservability();
  const files = [];
  const persistence = fakePersistence({
    reportBundleForActive: async () => {
      throw new Error("Report bundle rejected: catalog does not cover the solved state");
    },
  });
  const { store } = makeStore(persistence, () => "", (bundle, filename) =>
    files.push({ bundle, filename })
  );

  const { logged } = await quiet(() => store.downloadActiveBundle());

  assert.deepEqual(files, [], "a failed bundle must not download");
  assert.deepEqual(store.actionError, {
    title: "Couldn't build the report bundle",
    message: "Report bundle rejected: catalog does not cover the solved state",
  });
  assert.equal(logged.length, 1, "the failure is reported once");
  assert.deepEqual(Object.keys(errorCounters()), [
    "recipes.downloadActiveBundle: Report bundle rejected: catalog does not cover the solved state",
  ]);
});

test("a failed row bundle download surfaces the server message", async () => {
  resetErrorObservability();
  const { store } = makeStore(
    fakePersistence({
      reportBundleFor: async () => {
        throw new Error("Drafts have no report bundle; request a preview instead");
      },
    })
  );
  store.rowMenu = { id: "frozen", name: "Saison", status: "frozen" };

  await quiet(() => store.downloadRowBundle());

  assert.equal(store.rowMenu, null);
  assert.equal(store.actionError.title, "Couldn't build the report bundle");
  assert.equal(
    store.actionError.message,
    "Drafts have no report bundle; request a preview instead"
  );
});

test("a failed freeze surfaces its message and skips the list refresh", async () => {
  resetErrorObservability();
  const persistence = fakePersistence({
    freezeActive: async () => {
      throw new Error("Cannot freeze: the boundary solve failed (HTTP 422)");
    },
  });
  const { store } = makeStore(persistence);

  await quiet(() => store.freeze());

  assert.deepEqual(store.actionError, {
    title: "Couldn't freeze this batch",
    message: "Cannot freeze: the boundary solve failed (HTTP 422)",
  });
  assert.deepEqual(
    persistence.calls.filter(([name]) => name === "list"),
    [],
    "a failed freeze must not reload the list"
  );
});

test("a successful action and dismiss both clear the banner", async () => {
  const { store } = makeStore();

  store.actionError = { title: "Couldn't freeze this batch", message: "boom" };
  await store.downloadActiveBundle();
  assert.equal(store.actionError, null);

  store.actionError = { title: "Couldn't freeze this batch", message: "boom" };
  store.dismissActionError();
  assert.equal(store.actionError, null);
});
