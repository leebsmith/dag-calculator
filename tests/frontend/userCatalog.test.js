import test from "node:test";
import assert from "node:assert/strict";

import {
  CATALOGS,
  CatalogValidationError,
  STORAGE_KEY,
  createUserCatalog,
  isUserItem,
  slugify,
  validateComponent,
} from "../../frontend/src/store/userCatalog.js";
import { loadArtifact } from "./helpers.js";

const artifact = loadArtifact();

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    dump: () => Object.fromEntries(map),
  };
}

const MALT = { name: "House Pale Malt", category: "BASE", yield_fraction: 0.8, color_lovibond: 3, notes: "" };

test("slugify + prefix identity helpers", () => {
  assert.equal(slugify("Maris Otter® Malt"), "maris-otter-malt");
  assert.equal(slugify("  Café / Vienna "), "cafe-vienna");
  assert.equal(isUserItem("u:house-malt"), true);
  assert.equal(isUserItem("pilsner-malt"), false);
  assert.equal(isUserItem(null), false);
});

test("add derives a u:-prefixed id from the name and persists", () => {
  const storage = memoryStorage();
  let changes = 0;
  const store = createUserCatalog({ artifact, storage, onChange: () => (changes += 1) });

  const item = store.add("malt", MALT);
  assert.equal(item.id, "u:house-pale-malt");
  assert.equal(changes, 1);
  assert.deepEqual(store.list("malt"), [item]);

  const reloaded = createUserCatalog({ artifact, storage });
  assert.equal(reloaded.catalogs.malt["u:house-pale-malt"].name, "House Pale Malt");
});

test("add suffixes colliding ids", () => {
  const store = createUserCatalog({ artifact, storage: memoryStorage() });
  const first = store.add("malt", MALT);
  const second = store.add("malt", MALT);
  assert.equal(first.id, "u:house-pale-malt");
  assert.equal(second.id, "u:house-pale-malt-2");
  assert.equal(Object.keys(store.catalogs.malt).length, 2);
});

test("water_report keys by report_id, not id", () => {
  const store = createUserCatalog({ artifact, storage: memoryStorage() });
  const item = store.add("water_report", { laboratory: "My Tap Water" });
  assert.equal(item.report_id, "u:my-tap-water");
  assert.equal(item.id, undefined);
  assert.ok("u:my-tap-water" in store.catalogs.water_report);
});

test("add rejects invalid components", () => {
  const store = createUserCatalog({ artifact, storage: memoryStorage() });

  assert.throws(() => store.add("malt", { category: "BASE" }), CatalogValidationError);
  assert.throws(
    () => store.add("malt", { name: "X", category: "BASE", yield_fraction: 1.5 }),
    CatalogValidationError
  );
  assert.throws(
    () => store.add("malt", { name: "X", category: "NOT_A_CATEGORY", yield_fraction: 0.8 }),
    CatalogValidationError
  );
  assert.throws(() => store.add("malt", { name: "X", bogus_field: 1 }), CatalogValidationError);
  assert.throws(() => store.add("bogus", MALT), CatalogValidationError);
});

test("validateComponent reports field-level errors", () => {
  const errors = validateComponent(artifact, "malt", { name: "", category: "BASE", yield_fraction: 2 });
  assert.ok(errors.some((e) => e.field === "name"));
  assert.ok(errors.some((e) => e.field === "yield_fraction"));
});

test("update merges a patch and re-validates", () => {
  const store = createUserCatalog({ artifact, storage: memoryStorage() });
  const item = store.add("malt", MALT);
  const updated = store.update("malt", item.id, { yield_fraction: 0.75 });
  assert.equal(updated.yield_fraction, 0.75);
  assert.equal(updated.id, item.id);
  assert.throws(() => store.update("malt", item.id, { yield_fraction: 9 }), CatalogValidationError);
  assert.equal(store.update("malt", "u:missing", {}), null);
});

test("remove deletes only user items", () => {
  const store = createUserCatalog({ artifact, storage: memoryStorage() });
  const item = store.add("malt", MALT);
  assert.equal(store.remove("malt", item.id), true);
  assert.equal(store.remove("malt", item.id), false);
  assert.deepEqual(store.list("malt"), []);
});

test("duplicateFrom clones a seed into a new user item", () => {
  const store = createUserCatalog({ artifact, storage: memoryStorage() });
  const seed = { id: "pilsner-malt", name: "Pilsner Malt", category: "BASE", yield_fraction: 0.8, color_lovibond: 1.5 };
  const copy = store.duplicateFrom("malt", seed);
  assert.equal(copy.id, "u:pilsner-malt");
  assert.equal(copy.name, "Pilsner Malt");
  assert.equal(store.catalogs.malt["u:pilsner-malt"].id, "u:pilsner-malt");
});

test("load drops entries written against a different schema_version", () => {
  const raw = { schema_version: (artifact.schema_version ?? 2) + 1, catalogs: { malt: { "u:good": { id: "u:good", name: "Good", category: "BASE" } } } };
  const store = createUserCatalog({ artifact, storage: memoryStorage({ [STORAGE_KEY]: JSON.stringify(raw) }) });
  assert.deepEqual(store.catalogs.malt, {});
});

test("load drops mismatched id and invalid entries", () => {
  const raw = {
    schema_version: artifact.schema_version,
    catalogs: {
      malt: {
        "u:good": { id: "u:good", name: "Good", category: "BASE" },
        "u:bad-id": { id: "u:other", name: "Bad", category: "BASE" },
        "u:bad-field": { id: "u:bad-field", name: "Bad", category: "BASE", yield_fraction: 99 },
      },
      not_a_catalog: { "u:ignored": { name: "x" } },
    },
  };
  const store = createUserCatalog({
    artifact,
    storage: memoryStorage({ [STORAGE_KEY]: JSON.stringify(raw) }),
  });
  assert.deepEqual(Object.keys(store.catalogs.malt), ["u:good"]);
});

test("CATALOGS covers the seven user-editable catalogs", () => {
  assert.deepEqual(Object.keys(CATALOGS), [
    "malt",
    "yeast",
    "hop",
    "sugar",
    "equipment",
    "water_report",
    "water_target",
  ]);
});
