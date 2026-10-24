// Store-surface guard: the partials bind to `$store.<name>.<member>` for the
// non-step surfaces (Batches, new-batch dialog). The step app has its own
// handler guard; these stores did not, so a renamed or deleted member failed
// only at runtime, after sign-in. Here every referenced member is resolved
// against a real store instance.

import test from "node:test";
import assert from "node:assert/strict";

import { createSetupStore } from "../../frontend/src/store/setup.js";
import { createRecipesStore } from "../../frontend/src/store/recipes.js";
import { read, rel, walk } from "./util.js";

// Stores created inline in `main.js` and therefore not covered by a factory.
// `auth` is a plain object literal registered before boot.
const EXTERNAL = new Set(["auth"]);

const FACTORIES = {
  setup: () => createSetupStore({}),
  recipes: () =>
    createRecipesStore({
      persistence: {},
      getSetup: () => ({ prerequisiteStatus: () => ({ ready: true, missing: [] }) }),
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

  assert.deepEqual(registered.sort(), ["auth", "recipes", "setup"]);

  const uncovered = registered.filter((name) => !EXTERNAL.has(name) && !(name in FACTORIES));
  assert.deepEqual(uncovered, [], `stores without a surface guard:\n${uncovered.join("\n")}`);
});

test("the guard actually reads the Batches and setup surfaces", () => {
  const files = new Set(references().map(({ file }) => file));
  assert.ok(files.has("frontend/src/partials/chooser.html"));
  assert.ok(files.has("frontend/src/partials/batch-setup.html"));
});
