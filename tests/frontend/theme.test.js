import test from "node:test";
import assert from "node:assert/strict";

import {
  STORAGE_KEY,
  applyTheme,
  createThemeStore,
  readTheme,
  sanitizeTheme,
} from "../../frontend/src/store/theme.js";

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    map,
  };
}

test("the theme mode is sanitized to system", () => {
  assert.equal(sanitizeTheme("dark"), "dark");
  assert.equal(sanitizeTheme("light"), "light");
  assert.equal(sanitizeTheme("system"), "system");
  assert.equal(sanitizeTheme("sepia"), "system");
  assert.equal(sanitizeTheme(null), "system");
});

test("readTheme falls back to system", () => {
  assert.equal(readTheme(memoryStorage()), "system");
  assert.equal(readTheme(memoryStorage({ [STORAGE_KEY]: "nope" })), "system");
  assert.equal(readTheme(memoryStorage({ [STORAGE_KEY]: "dark" })), "dark");
});

test("applyTheme sets the root attribute and persists only on request", () => {
  const storage = memoryStorage();
  const root = { dataset: {} };
  assert.equal(applyTheme("light", { root, storage }), "light");
  assert.equal(root.dataset.theme, "light");
  assert.equal(storage.map.has(STORAGE_KEY), false);

  assert.equal(applyTheme("dark", { root, storage, persist: true }), "dark");
  assert.equal(root.dataset.theme, "dark");
  assert.equal(storage.map.get(STORAGE_KEY), "dark");
});

test("the store applies the stored mode and updates it", () => {
  const storage = memoryStorage({ [STORAGE_KEY]: "dark" });
  const root = { dataset: {} };
  const store = createThemeStore({ storage, root });
  assert.equal(store.mode, "dark");
  assert.equal(root.dataset.theme, "dark");

  store.set("light");
  assert.equal(store.mode, "light");
  assert.equal(root.dataset.theme, "light");
  assert.equal(storage.map.get(STORAGE_KEY), "light");
});
