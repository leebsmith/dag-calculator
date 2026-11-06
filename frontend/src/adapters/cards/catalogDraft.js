// Shared catalog-drawer + draft-row editor block.
//
// Builds the repeated state, getters, and handlers for a card's catalog editor.
// Cards supply only their config; bespoke behaviour stays in the card module
// and the pure readouts live in views/producer/catalogDrawer.js. See
// plans/card-refactor.md.
//
// config:
//   prefix         state/handler stem ("hop")
//   Cap            capitalized stem for handler names ("Hop")
//   nodeId         collection node id ("batch.boil_hops")
//   seedKey        reference-cache seed key ("hops")
//   catalog        optional (view) => catalogItem[] override for a dynamic catalog
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
//   makeRow        (catalogItem, view) => draft row
//   maxVisible     optional cap (default 25)
//   productSearchLimit optional cap for brand/name matches (default 10)
//   itemMeta       optional (catalogItem) => parts[]; joined for the card subtitle
//   groupMeta      optional (standardGroup) => parts[]; joined for a group row
//   allowDuplicates when true the drawer keeps offering an item already in the
//                  draft (a hop variety is routinely dosed more than once); the
//                  card shows the count instead of hiding it
//
// Getters are returned as descriptor factories and installed with
// Object.defineProperties (Object.assign would collapse them to values).

import {
  addedCatalogIds,
  catalogGroupMeta,
  catalogItemMeta,
  toggledCategoryFilter,
  toggledFamilyFilter,
} from "../../views/producer/catalogDrawer.js";
import { SEED_KEY_TO_CATALOG } from "../../store/userCatalog.js";
import { draftGetters } from "./catalogDraftGetters.js";
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

function draftContext(ctx, config, getView) {
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
  const seeds = ctx.cache?.seeds ?? {};
  const seedCatalog = () => Object.values(seeds[seedKey] ?? {});
  // Every callback that reads app state takes the live view: a closure over the
  // install-time object would read the raw target and lose the reactive
  // dependency (the browser's app is an Alpine proxy).
  const catalog = (view) => (catalogFn ? catalogFn(view) : seedCatalog());
  return {
    prefix,
    Cap,
    nodeId,
    seedKey,
    catalogNameOf,
    searchFields,
    brandField,
    idField,
    categoryField,
    standardField,
    standardNameField,
    standardDescriptionField,
    familyField,
    makeRow,
    maxVisible,
    productSearchLimit,
    canAdd,
    itemMeta,
    groupMeta,
    getView,
    catalog,
    findCatalogItem: (view, id) => catalog(view).find((item) => item.id === id),
    addedIds: (rows) => addedCatalogIds(rows, idField, allowDuplicates === true),
    name: (suffix) => `${prefix}${suffix}`,
    m: Object.fromEntries(Object.entries(METHOD_NAMES).map(([key, fn]) => [key, fn(prefix, Cap)])),
  };
}

function draftState(d) {
  return {
    [d.name("Drawer")]: null, // "search" | "inspect" | null
    [d.name("Search")]: "",
    [d.name("SearchNotes")]: false,
    [d.name("ActiveIndex")]: null,
    [d.name("CategoryFilter")]: [],
    [d.name("Family")]: "",
    [d.name("Standard")]: "",
  };
}

function draftMethods(d) {
  const { m, name, nodeId, getView, canAdd, makeRow, catalogNameOf, seedKey, findCatalogItem } = d;
  const actions = {
    [m.openEditor]() {
      const view = getView();
      view.openDraft(nodeId);
      view[name("Drawer")] = null;
      view[name("ActiveIndex")] = null;
    },

    [m.cancelEditor]() {
      const view = getView();
      // The draft is scratch state: a changed draft asks before it is dropped.
      if (view.draftDirty) {
        view.draftDiscardOpen = true;
        return;
      }
      view.closeDraft();
      view[name("Drawer")] = null;
      view[name("ActiveIndex")] = null;
    },

    [m.saveEditor]() {
      const view = getView();
      view.saveDraft();
      view[name("Drawer")] = null;
      view[name("ActiveIndex")] = null;
    },

    [m.addCatalog](catalogId) {
      const view = getView();
      const item = findCatalogItem(view, catalogId);
      if (!item) return;
      if (canAdd && !canAdd(view)) return;
      view.addDraftRow(makeRow(item, view));
      actions[m.closeDrawer]();
    },

    [m.duplicateCatalog](catalogId) {
      const view = getView();
      const item = findCatalogItem(view, catalogId);
      if (!item) return;
      const catalogName = catalogNameOf ? catalogNameOf(item) : SEED_KEY_TO_CATALOG[seedKey];
      if (!catalogName) return;
      view.duplicateUserItem(catalogName, item);
    },

    [m.remove](ri) {
      const view = getView();
      view.removeDraftRow(ri);
      const active = name("ActiveIndex");
      if (view[active] === ri) {
        view[active] = null;
        if (view[name("Drawer")] === "inspect") view[name("Drawer")] = null;
      } else if (view[active] != null && view[active] > ri) {
        view[active] -= 1;
      }
    },

    [m.inspectRow](ri) {
      const view = getView();
      view[name("ActiveIndex")] = ri;
      view[name("Drawer")] = "inspect";
    },

    [m.openSearch]() {
      const view = getView();
      view[name("Drawer")] = "search";
      view[name("ActiveIndex")] = null;
      view[name("Search")] = "";
      view[name("SearchNotes")] = false;
      view[name("CategoryFilter")] = [];
      view[name("Family")] = "";
      view[name("Standard")] = "";
    },

    [m.toggleSearchNotes]() {
      const view = getView();
      view[name("SearchNotes")] = !view[name("SearchNotes")];
    },

    [m.closeDrawer]() {
      const view = getView();
      view[name("Drawer")] = null;
      view[name("ActiveIndex")] = null;
    },

    [m.toggleCategory](category) {
      const view = getView();
      view[name("CategoryFilter")] = toggledCategoryFilter(view[name("CategoryFilter")], category);
    },

    [m.toggleFamily](family) {
      const view = getView();
      view[name("Family")] = toggledFamilyFilter(view[name("Family")], family);
      view[name("Standard")] = "";
    },

    [m.selectStandard](standardId) {
      const view = getView();
      view[name("Standard")] = standardId;
      view[name("ActiveIndex")] = null;
    },

    [m.clearStandard]() {
      const view = getView();
      view[name("Standard")] = "";
      view[name("ActiveIndex")] = null;
    },

    [m.handleEscape]() {
      const view = getView();
      if (!view[name("EditorOpen")]) return;
      if (view.draftDiscardOpen) view.dismissDraftDiscard();
      else if (view[name("Drawer")] !== null) actions[m.closeDrawer]();
      else actions[m.cancelEditor]();
    },
  };
  return actions;
}

function draftMetaMethods(d) {
  const { m, itemMeta, groupMeta } = d;
  return {
    [m.itemMeta](item) {
      return catalogItemMeta(item, itemMeta);
    },
    [m.groupMeta](group) {
      return catalogGroupMeta(group, groupMeta);
    },
  };
}

export function createCatalogDraft(ctx, config) {
  const d = draftContext(ctx, config, ctx.getView);
  return {
    state: draftState(d),
    methods: { ...draftMethods(d), ...draftMetaMethods(d) },
    descriptors: Object.fromEntries(
      Object.entries(draftGetters(d)).map(([key, get]) => [key, { configurable: true, get }])
    ),
  };
}

export function installCatalogDraft(app, ctx, config) {
  const { nodeId, prefix, Cap, standardField, canAdd } = config;
  registerCatalogEntry(app, {
    nodeId,
    prefix,
    Cap,
    standardField,
    canAdd,
    ...chromeConfig(config),
  });
  installChrome(app);
  const { state, methods, descriptors } = createCatalogDraft(
    { ...ctx, getView: ctx.getView ?? (() => app) },
    config
  );
  Object.assign(app, state, methods);
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
