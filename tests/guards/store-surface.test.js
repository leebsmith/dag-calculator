// Store-surface guard: the partials bind to `$store.<name>.<member>` for the
// non-step surfaces (Batches, new-batch dialog). The step app has its own
// handler guard; these stores did not, so a renamed or deleted member failed
// only at runtime, after sign-in. Here every referenced member is resolved
// against a real store instance.

import test from "node:test";
import assert from "node:assert/strict";

import { createSetupStore } from "../../frontend/src/store/setup.js";
import { createRecipesStore } from "../../frontend/src/store/recipes.js";
import { reportPickerFieldActions } from "../../frontend/src/store/reportPickerFields.js";
import { createBrewSessionStore } from "../../frontend/src/store/brewSession.js";
import { createImportsStore } from "../../frontend/src/store/imports.js";
import { createImportReviewStore } from "../../frontend/src/store/importReview.js";
import { createThemeStore } from "../../frontend/src/store/theme.js";
import { read, rel, walk } from "./util.js";

// Stores created inline in `main.js` and therefore not covered by a factory.
// `auth` is a plain object literal registered before boot.
const EXTERNAL = new Set(["auth"]);

const FACTORIES = {
  setup: () => createSetupStore({}),
  // Same composition as `main.js`: merge, never spread. `recipes` is the only
  // store with getters (`rows`, `prerequisites`, `canCreateBatch`, …), and a
  // spread would freeze each one at the value it had at boot.
  recipes: () => {
    const store = createRecipesStore({
      persistence: {},
      getSetup: () => ({ prerequisiteStatus: () => ({ ready: true, missing: [] }) }),
    });
    return Object.assign(store, reportPickerFieldActions());
  },
  brewSession: () =>
    createBrewSessionStore({ client: {}, loadBundle: async () => null }),
  imports: () =>
    createImportsStore({ client: { list: async () => [] }, readFile: async () => "" }),
  importReview: () => createImportReviewStore({ client: {} }),
  theme: () =>
    createThemeStore({
      storage: { getItem: () => null, setItem: () => {} },
    }),
};

function surfaces() {
  return ["frontend/index.html", ...walk("frontend/src/partials", [".html"]).map(rel)];
}

function references() {
  const out = [];
  for (const file of surfaces()) {
    for (const match of read(file).matchAll(/\$store\.([A-Za-z_$][\w$]*)(?:\.([A-Za-z_$][\w$]*))?/g)) {
      out.push({ file, store: match[1], member: match[2] });
    }
  }
  return out;
}

test("every $store member referenced by a template exists", () => {
  const stores = Object.fromEntries(
    Object.entries(FACTORIES).map(([name, factory]) => [name, factory()])
  );

  const missing = [];
  for (const { file, store, member } of references()) {
    if (EXTERNAL.has(store) || member === undefined) continue;
    const instance = stores[store];
    if (!instance) {
      missing.push(`${file}: unknown store $store.${store}`);
      continue;
    }
    if (!(member in instance)) missing.push(`${file}: $store.${store}.${member}`);
  }

  assert.deepEqual([...new Set(missing)], [], `unbound store members:\n${missing.join("\n")}`);
});

test("every Alpine store registered in main.js is either a factory or explicitly external", () => {
  const registered = [
    ...new Set(
      [...read("frontend/src/main.js").matchAll(/Alpine\.store\(\s*"([^"]+)"/g)].map(
        (match) => match[1]
      )
    ),
  ];

  assert.deepEqual(registered.sort(), [
    "auth",
    "brewSession",
    "importReview",
    "imports",
    "recipes",
    "setup",
    "theme",
  ]);

  const uncovered = registered.filter((name) => !EXTERNAL.has(name) && !(name in FACTORIES));
  assert.deepEqual(uncovered, [], `stores without a surface guard:\n${uncovered.join("\n")}`);
});

test("the guard actually reads the Batches and setup surfaces", () => {
  const files = new Set(references().map(({ file }) => file));
  assert.ok(files.has("frontend/src/partials/chooser.html"));
  assert.ok(files.has("frontend/src/partials/batch-setup.html"));
});

// Spreading a store into a new literal invokes each getter once and copies the
// value, so `rows` froze at the empty array it had during boot and the landing
// list never rendered a batch that `/batches` had returned.
test("the composed recipes store keeps its getters live", () => {
  const store = FACTORIES.recipes();

  store.batches = [
    { id: "b1", name: "One", status: "draft", trashed: false, updated_at: 2 },
    { id: "b2", name: "Two", status: "frozen", trashed: false, updated_at: 1 },
  ];

  assert.equal(store.rows.length, 2, "rows must follow batches");
  assert.equal(store.sortLabel, "Last modified");

  store.scope = "frozen";
  assert.equal(store.rows.length, 1);
  assert.equal(store.rows[0].id, "b2");

  store.sort = "title";
  assert.equal(store.sortLabel, "Title", "sortLabel must follow sort");

  store.scope = "trash";
  assert.equal(store.emptyMessage, "Trash is empty.", "emptyMessage must follow scope");
});

test("no store is spread into a new object literal", () => {
  const offenders = walk("frontend/src", [".js"])
    .map(rel)
    .filter((file) => /\.\.\.\s*(?:create\w+Store|Alpine\.store)\(/.test(read(file)));

  assert.deepEqual(
    offenders,
    [],
    "a store with getters was spread into a literal; merge with Object.assign instead"
  );
});
