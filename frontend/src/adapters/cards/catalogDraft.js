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
//   catalog        optional () => catalogItem[] override for a dynamic catalog
//   catalogNameOf  optional (catalogItem) => catalog kind for "Copy to my items";
//                  defaults to SEED_KEY_TO_CATALOG[seedKey]
//   searchFields   optional catalog fields searched by the drawer (default name, notes)
//   idField        row field holding the catalog id ("hop_id")
//   categoryField  catalog field to filter/pill on ("purpose") | null
//   standardField  (optional) catalog field holding the standard-malt id; when
//                  set, the drawer becomes a standard-first browser + drill-down
//                  ("standard_malt")
//   standardNameField / standardDescriptionField / familyField
//                  (optional) the standard display fields, used with standardField
//   makeRow        (catalogItem) => draft row
//   maxVisible     optional cap (default 25)
//   itemMeta       optional (catalogItem) => parts[]; joined for the card subtitle
//   groupMeta      optional (standardGroup) => parts[]; joined for a group row
//
// Handlers keep using `this` exactly as the inline methods did, so Alpine's
// binding and the direct-call tests behave unchanged. Getters are installed with
// Object.defineProperties (Object.assign would collapse them to values).

import { catalogCategories, familyOptions, filterCatalog, standardGroups } from "../../views/catalog.js";
import { SEED_KEY_TO_CATALOG } from "../../store/userCatalog.js";
import { joinNonEmpty } from "../../utils.js";

export function installCatalogDraft(app, ctx, config) {
  const {
    prefix,
    Cap,
    nodeId,
    seedKey,
    catalog: catalogFn = null,
    catalogNameOf = null,
    searchFields = ["name", "notes"],
    idField,
    categoryField = null,
    standardField = null,
    standardNameField = null,
    standardDescriptionField = null,
    familyField = null,
    makeRow,
    maxVisible = 25,
    canAdd = null,
    itemMeta = null,
    groupMeta = null,
  } = config;
  const seeds = ctx.cache.seeds ?? {};
  const seedCatalog = () => Object.values(seeds[seedKey] ?? {});
  const catalog = catalogFn ? () => catalogFn() : seedCatalog;
  const findCatalogItem = (id) => catalog().find((item) => item.id === id);

  const state = {
    [`${prefix}Drawer`]: null, // "search" | "inspect" | null
    [`${prefix}Search`]: "",
    [`${prefix}SearchNotes`]: false,
    [`${prefix}ActiveIndex`]: null,
    [`${prefix}CategoryFilter`]: [],
    [`${prefix}Family`]: "",
    [`${prefix}Standard`]: "",
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
      const item = findCatalogItem(catalogId);
      if (!item) return;
      if (canAdd && !canAdd(this)) return;
      this.addDraftRow(makeRow(item));
      this[`close${Cap}Drawer`]();
    },

    [`duplicateCatalog${Cap}`](catalogId) {
      const item = findCatalogItem(catalogId);
      if (!item) return;
      const catalogName = catalogNameOf
        ? catalogNameOf(item)
        : SEED_KEY_TO_CATALOG[seedKey];
      if (!catalogName) return;
      this.duplicateUserItem(catalogName, item);
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
      this[`${prefix}SearchNotes`] = false;
      this[`${prefix}CategoryFilter`] = [];
      this[`${prefix}Family`] = "";
      this[`${prefix}Standard`] = "";
    },

    [`toggle${Cap}SearchNotes`]() {
      this[`${prefix}SearchNotes`] = !this[`${prefix}SearchNotes`];
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

    [`toggle${Cap}Family`](family) {
      this[`${prefix}Family`] = this[`${prefix}Family`] === family ? "" : family;
      this[`${prefix}Standard`] = "";
    },

    [`select${Cap}Standard`](standardId) {
      this[`${prefix}Standard`] = standardId;
      this[`${prefix}ActiveIndex`] = null;
    },

    [`clear${Cap}Standard`]() {
      this[`${prefix}Standard`] = "";
      this[`${prefix}ActiveIndex`] = null;
    },

    [`handle${Cap}Escape`]() {
      if (!this[`${prefix}EditorOpen`]) return;
      if (this[`${prefix}Drawer`] !== null) this[`close${Cap}Drawer`]();
      else this[`cancel${Cap}Editor`]();
    },

    [`${prefix}ItemMeta`](item) {
      if (!itemMeta || !item || typeof item !== "object") return "";
      return joinNonEmpty(itemMeta(item));
    },

    [`${prefix}GroupMeta`](group) {
      if (!groupMeta || !group || typeof group !== "object") return "";
      return joinNonEmpty(groupMeta(group), " · ");
    },
  };

  Object.assign(app, state, methods);

  function activeIds() {
    return new Set((this.draftRows ?? []).map((row) => row[idField]).filter(Boolean));
  }

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
    [`${prefix}Families`]() {
      if (!standardField) return [];
      void this.catalogRevision;
      return familyOptions(catalog(), (item) => item[familyField]);
    },
    [`${prefix}StandardGroups`]() {
      if (!standardField) return [];
      void this.catalogRevision;
      const q = String(this[`${prefix}Search`] ?? "").trim().toLowerCase();
      const family = this[`${prefix}Family`];
      const added = activeIds.call(this);
      let items = catalog();
      // Representative (`std:`) entries are not producer variants — exclude them
      // from the browser counts.
      items = items.filter((item) => !String(item.id ?? "").startsWith("std:"));
      if (family) items = items.filter((item) => item[familyField] === family);
      if (q) {
        items = filterCatalog(items, {
          activeIds: added,
          query: q,
          searchFields: [standardNameField, standardDescriptionField].filter(Boolean),
        });
      } else {
        items = items.filter((item) => !added.has(item.id));
      }
      return standardGroups(items, {
        idOf: (item) => item[standardField],
        nameOf: standardNameField ? (item) => item[standardNameField] : undefined,
        descriptionOf: standardDescriptionField ? (item) => item[standardDescriptionField] : undefined,
        familyOf: familyField ? (item) => item[familyField] : undefined,
      });
    },
    [`${prefix}StandardName`]() {
      if (!standardField || !this[`${prefix}Standard`]) return "";
      const item = catalog().find((i) => i[standardField] === this[`${prefix}Standard`]);
      return item && standardNameField ? item[standardNameField] : this[`${prefix}Standard`] ?? "";
    },
    [`${prefix}FilteredCatalog`]() {
      void this.catalogRevision;
      let items = catalog();
      if (standardField && this[`${prefix}Standard`]) {
        items = items.filter((item) => item[standardField] === this[`${prefix}Standard`]);
      }
      const filtered = filterCatalog(items, {
        activeIds: activeIds.call(this),
        query: this[`${prefix}Search`],
        categories: this[`${prefix}CategoryFilter`],
        categoryOf: categoryField ? (item) => item[categoryField] : null,
        searchFields,
        includeNotes: this[`${prefix}SearchNotes`],
      });
      // In a standard's drill-down, surface the generic representative first.
      if (standardField && this[`${prefix}Standard`]) {
        filtered.sort((a, b) => {
          const ar = String(a.id ?? "").startsWith("std:") ? 0 : 1;
          const br = String(b.id ?? "").startsWith("std:") ? 0 : 1;
          return ar - br || String(a.name ?? "").localeCompare(String(b.name ?? ""));
        });
      }
      return filtered;
    },
    [`${prefix}VisibleCatalog`]() {
      if (standardField && this[`${prefix}Standard`]) {
        return this[`${prefix}FilteredCatalog`];
      }
      return this[`${prefix}FilteredCatalog`].slice(0, maxVisible);
    },
    [`${prefix}CatalogTruncated`]() {
      if (standardField && this[`${prefix}Standard`]) return false;
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

// The app members installCatalogDraft assigns, expanded for a given prefix.
export function catalogDraftKeys(prefix, Cap) {
  return [
    `${prefix}Drawer`, `${prefix}Search`, `${prefix}SearchNotes`, `${prefix}ActiveIndex`,
    `${prefix}CategoryFilter`,
    `${prefix}Family`, `${prefix}Standard`,
    `open${Cap}Editor`, `cancel${Cap}Editor`, `save${Cap}Editor`, `addCatalog${Cap}`,
    `duplicateCatalog${Cap}`, `remove${Cap}`, `inspect${Cap}Row`, `open${Cap}Search`,
    `close${Cap}Drawer`, `toggle${Cap}Category`, `toggle${Cap}Family`, `select${Cap}Standard`,
    `clear${Cap}Standard`, `handle${Cap}Escape`, `${prefix}ItemMeta`, `${prefix}GroupMeta`,
    `${prefix}EditorOpen`, `${prefix}Catalog`, `${prefix}Categories`, `${prefix}Families`,
    `${prefix}StandardGroups`, `${prefix}StandardName`, `${prefix}FilteredCatalog`,
    `${prefix}VisibleCatalog`, `${prefix}CatalogTruncated`, `${prefix}ActiveRow`,
  ];
}
