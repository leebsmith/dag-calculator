// Shared catalog-drawer + draft-row editor block.
//
// Installs the repeated state, getters, and handlers onto the reactive `app`
// object. Cards supply only their config; bespoke behaviour stays in the card
// module. See plans/card-refactor.md.
//
// config:
//   prefix         state/handler stem ("hop")
//   Cap            capitalized stem for handler names ("Hop")
//   nodeId         collection node id ("batch.boil_hops")
//   seedKey        reference-cache seed key ("hops")
//   idField        row field holding the catalog id ("hop_id")
//   categoryField  catalog field to filter/pill on ("purpose") | null
//   makeRow        (catalogItem) => draft row
//   maxVisible     optional cap (default 25)
//
// Handlers keep using `this` exactly as the inline methods did, so Alpine's
// binding and the direct-call tests behave unchanged. Getters are installed with
// Object.defineProperties (Object.assign would collapse them to values).

import { catalogCategories, filterCatalog } from "../../views/catalog.js";
import { SEED_KEY_TO_CATALOG } from "../../store/userCatalog.js";

export function installCatalogDraft(app, ctx, config) {
  const {
    prefix,
    Cap,
    nodeId,
    seedKey,
    idField,
    categoryField = null,
    makeRow,
    maxVisible = 25,
    canAdd = null,
  } = config;
  const seeds = ctx.cache.seeds ?? {};
  const catalog = () => Object.values(seeds[seedKey] ?? {});

  const state = {
    [`${prefix}Drawer`]: null, // "search" | "inspect" | null
    [`${prefix}Search`]: "",
    [`${prefix}ActiveIndex`]: null,
    [`${prefix}CategoryFilter`]: [],
  };

  const methods = {
    [`open${Cap}Editor`]() {
      this.openDraft(nodeId);
      this[`${prefix}Drawer`] = null;
      this[`${prefix}ActiveIndex`] = null;
    },

    [`cancel${Cap}Editor`]() {
      this.closeDraft();
      this[`${prefix}Drawer`] = null;
      this[`${prefix}ActiveIndex`] = null;
    },

    [`save${Cap}Editor`]() {
      this.saveDraft();
      this[`${prefix}Drawer`] = null;
      this[`${prefix}ActiveIndex`] = null;
    },

    [`addCatalog${Cap}`](catalogId) {
      const item = seeds[seedKey]?.[catalogId];
      if (!item) return;
      if (canAdd && !canAdd(this)) return;
      this.addDraftRow(makeRow(item));
      this[`close${Cap}Drawer`]();
    },

    [`duplicateCatalog${Cap}`](catalogId) {
      const item = seeds[seedKey]?.[catalogId];
      const catalog = SEED_KEY_TO_CATALOG[seedKey];
      if (!item || !catalog) return;
      this.duplicateUserItem(catalog, item);
    },

    [`remove${Cap}`](ri) {
      this.removeDraftRow(ri);
      if (this[`${prefix}ActiveIndex`] === ri) {
        this[`${prefix}ActiveIndex`] = null;
        if (this[`${prefix}Drawer`] === "inspect") this[`${prefix}Drawer`] = null;
      } else if (this[`${prefix}ActiveIndex`] != null && this[`${prefix}ActiveIndex`] > ri) {
        this[`${prefix}ActiveIndex`] -= 1;
      }
    },

    [`inspect${Cap}Row`](ri) {
      this[`${prefix}ActiveIndex`] = ri;
      this[`${prefix}Drawer`] = "inspect";
    },

    [`open${Cap}Search`]() {
      this[`${prefix}Drawer`] = "search";
      this[`${prefix}ActiveIndex`] = null;
      this[`${prefix}Search`] = "";
      this[`${prefix}CategoryFilter`] = [];
    },

    [`close${Cap}Drawer`]() {
      this[`${prefix}Drawer`] = null;
      this[`${prefix}ActiveIndex`] = null;
    },

    [`toggle${Cap}Category`](category) {
      const current = this[`${prefix}CategoryFilter`];
      this[`${prefix}CategoryFilter`] = current.includes(category)
        ? current.filter((c) => c !== category)
        : [...current, category];
    },

    [`handle${Cap}Escape`]() {
      if (!this[`${prefix}EditorOpen`]) return;
      if (this[`${prefix}Drawer`] !== null) this[`close${Cap}Drawer`]();
      else this[`cancel${Cap}Editor`]();
    },
  };

  Object.assign(app, state, methods);

  const getters = {
    [`${prefix}EditorOpen`]() {
      return this.draftOpen && this.draftNodeId === nodeId;
    },
    [`${prefix}Catalog`]() {
      void this.catalogRevision;
      return catalog();
    },
    [`${prefix}Categories`]() {
      void this.catalogRevision;
      return categoryField ? catalogCategories(catalog(), (item) => item[categoryField]) : [];
    },
    [`${prefix}FilteredCatalog`]() {
      void this.catalogRevision;
      const activeIds = new Set(
        (this.draftRows ?? []).map((row) => row[idField]).filter(Boolean)
      );
      return filterCatalog(catalog(), {
        activeIds,
        query: this[`${prefix}Search`],
        categories: this[`${prefix}CategoryFilter`],
        categoryOf: categoryField ? (item) => item[categoryField] : null,
      });
    },
    [`${prefix}VisibleCatalog`]() {
      return this[`${prefix}FilteredCatalog`].slice(0, maxVisible);
    },
    [`${prefix}CatalogTruncated`]() {
      return this[`${prefix}FilteredCatalog`].length > maxVisible;
    },
    [`${prefix}ActiveRow`]() {
      const index = this[`${prefix}ActiveIndex`];
      return index == null ? null : this.draftRows[index] ?? null;
    },
  };

  const descriptors = {};
  for (const [name, get] of Object.entries(getters)) {
    descriptors[name] = { configurable: true, get };
  }
  Object.defineProperties(app, descriptors);
}
