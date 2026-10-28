// Server-backed record library.
//
// Owns fetch/list/create/delete against `/catalog`, plus its own loading and
// error state. It is deliberately independent of the wizard, the autosave
// queue, and the solve loop: a failed fetch only sets `error` and leaves the
// current batch untouched.

import { CATALOGS, CATALOG_KINDS } from "./userCatalog.js";
import { reportError } from "../observability.js";

export const LEGACY_STORAGE_KEY = "brew_user_catalog";

const EMPTY_CLIENT = {
  listCatalog: async () => [],
  createCatalog: async () => {
    throw new Error("catalog client is not configured");
  },
  deleteCatalog: async () => null,
};

function emptyItems(kinds) {
  return Object.fromEntries(kinds.map((kind) => [kind, {}]));
}

export function createLibrary({ client = EMPTY_CLIENT, kinds = CATALOG_KINDS, onChange } = {}) {
  let items = emptyItems(kinds);
  const state = { loading: false, error: null, loaded: false };

  const store = {
    items() {
      return items;
    },

    list(kind) {
      return Object.values(items[kind] ?? {});
    },

    get(kind, itemId) {
      return items[kind]?.[itemId] ?? null;
    },

    has(kind, itemId) {
      return Boolean(items[kind]?.[itemId]);
    },

    loading() {
      return state.loading;
    },

    error() {
      return state.error;
    },

    loaded() {
      return state.loaded;
    },

    // Never throws: a network failure is library-local state, not a batch
    // failure.
    async refresh() {
      state.loading = true;
      state.error = null;
      try {
        const rows = await Promise.all(
          kinds.map(async (kind) => [kind, await client.listCatalog(kind)])
        );
        const next = emptyItems(kinds);
        for (const [kind, records] of rows) {
          for (const record of records ?? []) {
            next[kind][record.id] = { ...record.component };
          }
        }
        items = next;
        state.loaded = true;
        onChange?.();
        return items;
      } catch (err) {
        state.error = err;
        return items;
      } finally {
        state.loading = false;
      }
    },

    async create(kind, component) {
      const record = await client.createCatalog(kind, component);
      const stored = record?.component ? { ...record.component } : { ...component };
      if (record?.id) {
        items = { ...items, [kind]: { ...items[kind], [record.id]: stored } };
      }
      onChange?.();
      return record;
    },

    async remove(kind, itemId) {
      await client.deleteCatalog(kind, itemId);
      const next = { ...items[kind] };
      delete next[itemId];
      items = { ...items, [kind]: next };
      onChange?.();
    },

    // One-time migration from the retired device-local store. Failures are
    // logged and skipped; the key is removed either way so the app never gets
    // stuck importing.
    async importLegacy({ storage } = {}) {
      const target = storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
      if (!target) return { imported: 0 };
      let raw;
      try {
        raw = JSON.parse(target.getItem(LEGACY_STORAGE_KEY) ?? "null");
      } catch {
        target.removeItem(LEGACY_STORAGE_KEY);
        return { imported: 0 };
      }
      if (!raw?.catalogs || typeof raw.catalogs !== "object") {
        target.removeItem(LEGACY_STORAGE_KEY);
        return { imported: 0 };
      }
      let imported = 0;
      for (const [kind, entries] of Object.entries(raw.catalogs)) {
        const meta = CATALOGS[kind];
        if (!meta || !entries || typeof entries !== "object") continue;
        for (const [legacyId, component] of Object.entries(entries)) {
          if (!component || typeof component !== "object") continue;
          const copy = { ...component };
          delete copy[meta.idField];
          try {
            await store.create(kind, copy);
            imported += 1;
          } catch (err) {
            reportError(`library.import ${kind}:${legacyId}`, err);
          }
        }
      }
      target.removeItem(LEGACY_STORAGE_KEY);
      return { imported };
    },
  };

  return store;
}
