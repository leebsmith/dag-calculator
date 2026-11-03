// Shared catalog-drawer + draft-row editor block.
//
// Installs the repeated state, getters, and handlers onto the reactive `app`
// object. Cards supply only their config; bespoke behaviour stays in the card
// module and the pure readouts live in views/producer/catalogDrawer.js. See
// plans/card-refactor.md.
//
// config:
//   prefix         state/handler stem ("hop")
//   Cap            capitalized stem for handler names ("Hop")
//   nodeId         collection node id ("batch.boil_hops")
//   seedKey        reference-cache seed key ("hops")
//   catalog        optional (app) => catalogItem[] override for a dynamic catalog
//   catalogNameOf  optional (catalogItem) => catalog kind for "Copy to my items";
//                  defaults to SEED_KEY_TO_CATALOG[seedKey]
//   searchFields   optional catalog fields searched by the drawer (default name, notes)
//   brandField     optional brand/maltster field, searched by the product matches
//   idField        row field holding the catalog id ("hop_id")
//   categoryField  catalog field to filter/pill on ("purpose") | null
//   standardField  (optional) catalog field holding the standard-malt id; when
//                  set, the drawer becomes a standard-first browser + drill-down
//                  ("standard_malt")
//   standardNameField / standardDescriptionField / familyField
//                  (optional) the standard display fields, used with standardField
//   makeRow        (catalogItem, app) => draft row
//   maxVisible     optional cap (default 25)
//   productSearchLimit optional cap for brand/name matches (default 10)
//   itemMeta       optional (catalogItem) => parts[]; joined for the card subtitle
//   groupMeta      optional (standardGroup) => parts[]; joined for a group row
//   allowDuplicates when true the drawer keeps offering an item already in the
//                  draft (a hop variety is routinely dosed more than once); the
//                  card shows the count instead of hiding it
//
// Handlers keep using `this` exactly as the inline methods did, so Alpine's
// binding and the direct-call tests behave unchanged. Getters are installed with
// Object.defineProperties (Object.assign would collapse them to values).

import {
  addedCatalogIds,
  activeDraftRow,
  catalogCategoryPills,
  catalogFamilyPills,
  catalogGroupMeta,
  catalogItemMeta,
  catalogProductMatches,
  catalogStandardGroups,
  filteredCatalogItems,
  isCatalogTruncated,
  standardSelectionName,
  toggledCategoryFilter,
  toggledFamilyFilter,
  visibleCatalogItems,
} from "../../views/producer/catalogDrawer.js";
import { SEED_KEY_TO_CATALOG } from "../../store/userCatalog.js";
import { chromeConfig, installChrome, registerCatalogEntry } from "./catalogChrome.js";


const STATE_SUFFIXES = [
  "Drawer",
  "Search",
  "SearchNotes",
  "ActiveIndex",
  "CategoryFilter",
  "Family",
  "Standard",
];

const GETTER_SUFFIXES = [
  "EditorOpen",
  "Catalog",
  "Categories",
  "Families",
  "StandardGroups",
  "ProductMatches",
  "StandardName",
  "FilteredCatalog",
  "VisibleCatalog",
  "CatalogTruncated",
  "DraftCounts",
  "ActiveRow",
];

const METHOD_NAMES = {
  openEditor: (p, C) => `open${C}Editor`,
  cancelEditor: (p, C) => `cancel${C}Editor`,
  saveEditor: (p, C) => `save${C}Editor`,
  addCatalog: (p, C) => `addCatalog${C}`,
  duplicateCatalog: (p, C) => `duplicateCatalog${C}`,
  remove: (p, C) => `remove${C}`,
  inspectRow: (p, C) => `inspect${C}Row`,
  openSearch: (p, C) => `open${C}Search`,
  toggleSearchNotes: (p, C) => `toggle${C}SearchNotes`,
  closeDrawer: (p, C) => `close${C}Drawer`,
  toggleCategory: (p, C) => `toggle${C}Category`,
  toggleFamily: (p, C) => `toggle${C}Family`,
  selectStandard: (p, C) => `select${C}Standard`,
  clearStandard: (p, C) => `clear${C}Standard`,
  handleEscape: (p, C) => `handle${C}Escape`,
  itemMeta: (p) => `${p}ItemMeta`,
  groupMeta: (p) => `${p}GroupMeta`,
};

export function installCatalogDraft(app, ctx, config) {
  const {
    prefix,
    Cap,
    nodeId,
    seedKey,
    catalog: catalogFn = null,
    catalogNameOf = null,
    searchFields = ["name", "notes"],
    brandField = null,
    idField,
    categoryField = null,
    standardField = null,
    standardNameField = null,
    standardDescriptionField = null,
    familyField = null,
    makeRow,
    maxVisible = 25,
    productSearchLimit = 10,
    canAdd = null,
    itemMeta = null,
    groupMeta = null,
    allowDuplicates,
  } = config;
  const chrome = chromeConfig(config);
  const seeds = ctx.cache.seeds ?? {};
  const seedCatalog = () => Object.values(seeds[seedKey] ?? {});
  // Every callback that reads app state takes the live app: a closure over the
  // install-time object would read the raw target and lose the reactive
  // dependency (the browser's app is an Alpine proxy).
  const catalog = (target) => (catalogFn ? catalogFn(target) : seedCatalog());
  const findCatalogItem = (target, id) => catalog(target).find((item) => item.id === id);
  const addedIds = (rows) => addedCatalogIds(rows, idField, allowDuplicates === true);

  registerCatalogEntry(app, {
    nodeId,
    prefix,
    Cap,
    standardField,
    canAdd,
    ...chrome,
  });
  installChrome(app);

  const name = (suffix) => `${prefix}${suffix}`;
  const m = Object.fromEntries(
    Object.entries(METHOD_NAMES).map(([key, fn]) => [key, fn(prefix, Cap)])
  );
  const state = {
    [name("Drawer")]: null, // "search" | "inspect" | null
    [name("Search")]: "",
    [name("SearchNotes")]: false,
    [name("ActiveIndex")]: null,
    [name("CategoryFilter")]: [],
    [name("Family")]: "",
    [name("Standard")]: "",
  };

  const methods = {
    [m.openEditor]() {
      this.openDraft(nodeId);
      this[name("Drawer")] = null;
      this[name("ActiveIndex")] = null;
    },

    [m.cancelEditor]() {
      // The draft is scratch state: a changed draft asks before it is dropped.
      if (this.draftDirty) {
        this.draftDiscardOpen = true;
        return;
      }
      this.closeDraft();
      this[name("Drawer")] = null;
      this[name("ActiveIndex")] = null;
    },

    [m.saveEditor]() {
      this.saveDraft();
      this[name("Drawer")] = null;
      this[name("ActiveIndex")] = null;
    },

    [m.addCatalog](catalogId) {
      const item = findCatalogItem(this, catalogId);
      if (!item) return;
      if (canAdd && !canAdd(this)) return;
      this.addDraftRow(makeRow(item, this));
      this[m.closeDrawer]();
    },

    [m.duplicateCatalog](catalogId) {
      const item = findCatalogItem(this, catalogId);
      if (!item) return;
      const catalogName = catalogNameOf
        ? catalogNameOf(item)
        : SEED_KEY_TO_CATALOG[seedKey];
      if (!catalogName) return;
      this.duplicateUserItem(catalogName, item);
    },

    [m.remove](ri) {
      this.removeDraftRow(ri);
      if (this[name("ActiveIndex")] === ri) {
        this[name("ActiveIndex")] = null;
        if (this[name("Drawer")] === "inspect") this[name("Drawer")] = null;
      } else if (this[name("ActiveIndex")] != null && this[name("ActiveIndex")] > ri) {
        this[name("ActiveIndex")] -= 1;
      }
    },

    [m.inspectRow](ri) {
      this[name("ActiveIndex")] = ri;
      this[name("Drawer")] = "inspect";
    },

    [m.openSearch]() {
      this[name("Drawer")] = "search";
      this[name("ActiveIndex")] = null;
      this[name("Search")] = "";
      this[name("SearchNotes")] = false;
      this[name("CategoryFilter")] = [];
      this[name("Family")] = "";
      this[name("Standard")] = "";
    },

    [m.toggleSearchNotes]() {
      this[name("SearchNotes")] = !this[name("SearchNotes")];
    },

    [m.closeDrawer]() {
      this[name("Drawer")] = null;
      this[name("ActiveIndex")] = null;
    },

    [m.toggleCategory](category) {
      this[name("CategoryFilter")] = toggledCategoryFilter(
        this[name("CategoryFilter")],
        category
      );
    },

    [m.toggleFamily](family) {
      this[name("Family")] = toggledFamilyFilter(this[name("Family")], family);
      this[name("Standard")] = "";
    },

    [m.selectStandard](standardId) {
      this[name("Standard")] = standardId;
      this[name("ActiveIndex")] = null;
    },

    [m.clearStandard]() {
      this[name("Standard")] = "";
      this[name("ActiveIndex")] = null;
    },

    [m.handleEscape]() {
      if (!this[name("EditorOpen")]) return;
      if (this.draftDiscardOpen) this.dismissDraftDiscard();
      else if (this[name("Drawer")] !== null) this[m.closeDrawer]();
      else this[m.cancelEditor]();
    },

    [m.itemMeta](item) {
      return catalogItemMeta(item, itemMeta);
    },

    [m.groupMeta](group) {
      return catalogGroupMeta(group, groupMeta);
    },
  };

  Object.assign(app, state, methods);

  const getters = {
    [name("EditorOpen")]() {
      return this.draftOpen && this.draftNodeId === nodeId;
    },
    [name("Catalog")]() {
      void this.catalogRevision;
      return catalog(this);
    },
    [name("Categories")]() {
      void this.catalogRevision;
      return catalogCategoryPills(catalog(this), categoryField);
    },
    [name("Families")]() {
      if (!standardField) return [];
      void this.catalogRevision;
      return catalogFamilyPills(catalog(this), familyField);
    },
    [name("StandardGroups")]() {
      if (!standardField) return [];
      void this.catalogRevision;
      return catalogStandardGroups(catalog(this), {
        standardField,
        standardNameField,
        standardDescriptionField,
        familyField,
        query: this[name("Search")],
        family: this[name("Family")],
        added: addedIds(this.draftRows),
      });
    },
    // Brand/name matches surfaced beside the standard groups, so a query like
    // "carafa" or "weyermann" finds the product even though the standard layer
    // never carries a maltster name. Drill-down owns the list once a standard
    // is selected, and a blank query keeps the browser standard-first.
    [name("ProductMatches")]() {
      if (standardField && this[name("Standard")]) return [];
      const query = String(this[name("Search")] ?? "").trim();
      if (!query) return [];
      void this.catalogRevision;
      return catalogProductMatches(catalog(this), {
        query,
        standardField,
        family: this[name("Family")],
        familyField,
        categories: this[name("CategoryFilter")],
        categoryField,
        searchFields,
        brandField,
        includeNotes: this[name("SearchNotes")],
        added: addedIds(this.draftRows),
        limit: productSearchLimit,
      });
    },
    [name("StandardName")]() {
      return standardSelectionName(catalog(this), {
        standardField,
        standard: this[name("Standard")],
        standardNameField,
      });
    },
    [name("FilteredCatalog")]() {
      void this.catalogRevision;
      return filteredCatalogItems(catalog(this), {
        standardField,
        standard: this[name("Standard")],
        added: addedIds(this.draftRows),
        query: this[name("Search")],
        categories: this[name("CategoryFilter")],
        categoryField,
        searchFields,
        includeNotes: this[name("SearchNotes")],
      });
    },
    [name("VisibleCatalog")]() {
      return visibleCatalogItems(this[name("FilteredCatalog")], {
        drilledIn: !!(standardField && this[name("Standard")]),
        maxVisible,
      });
    },
    [name("CatalogTruncated")]() {
      return isCatalogTruncated(this[name("FilteredCatalog")], {
        drilledIn: !!(standardField && this[name("Standard")]),
        maxVisible,
      });
    },
    [name("DraftCounts")]() {
      const counts = {};
      for (const row of this.draftRows ?? []) {
        const id = row?.[idField];
        if (id) counts[id] = (counts[id] ?? 0) + 1;
      }
      return counts;
    },
    [name("ActiveRow")]() {
      return activeDraftRow(this.draftRows, this[name("ActiveIndex")]);
    },
  };

  const descriptors = {};
  for (const [key, get] of Object.entries(getters)) {
    descriptors[key] = { configurable: true, get };
  }
  Object.defineProperties(app, descriptors);
}

// The app members installCatalogDraft assigns, derived from the same name
// tables the installer uses so the declared surface cannot drift from it.
export function catalogDraftKeys(prefix, Cap) {
  const name = (suffix) => `${prefix}${suffix}`;
  return [
    ...STATE_SUFFIXES.map(name),
    ...Object.values(METHOD_NAMES).map((fn) => fn(prefix, Cap)),
    ...GETTER_SUFFIXES.map(name),
  ];
}
