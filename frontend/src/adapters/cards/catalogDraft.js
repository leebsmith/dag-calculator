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
//   catalog        optional () => catalogItem[] override for a dynamic catalog
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
//   makeRow        (catalogItem) => draft row
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
  const seeds = ctx.cache.seeds ?? {};
  const seedCatalog = () => Object.values(seeds[seedKey] ?? {});
  const catalog = catalogFn ? () => catalogFn() : seedCatalog;
  const findCatalogItem = (id) => catalog().find((item) => item.id === id);
  const addedIds = (rows) => addedCatalogIds(rows, idField, allowDuplicates === true);

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
      // The draft is scratch state: a changed draft asks before it is dropped.
      if (this.draftDirty) {
        this.draftDiscardOpen = true;
        return;
      }
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
      this[`${prefix}CategoryFilter`] = toggledCategoryFilter(
        this[`${prefix}CategoryFilter`],
        category
      );
    },

    [`toggle${Cap}Family`](family) {
      this[`${prefix}Family`] = toggledFamilyFilter(this[`${prefix}Family`], family);
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
      if (this.draftDiscardOpen) this.dismissDraftDiscard();
      else if (this[`${prefix}Drawer`] !== null) this[`close${Cap}Drawer`]();
      else this[`cancel${Cap}Editor`]();
    },

    [`${prefix}ItemMeta`](item) {
      return catalogItemMeta(item, itemMeta);
    },

    [`${prefix}GroupMeta`](group) {
      return catalogGroupMeta(group, groupMeta);
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
      return catalogCategoryPills(catalog(), categoryField);
    },
    [`${prefix}Families`]() {
      if (!standardField) return [];
      void this.catalogRevision;
      return catalogFamilyPills(catalog(), familyField);
    },
    [`${prefix}StandardGroups`]() {
      if (!standardField) return [];
      void this.catalogRevision;
      return catalogStandardGroups(catalog(), {
        standardField,
        standardNameField,
        standardDescriptionField,
        familyField,
        query: this[`${prefix}Search`],
        family: this[`${prefix}Family`],
        added: addedIds(this.draftRows),
      });
    },
    // Brand/name matches surfaced beside the standard groups, so a query like
    // "carafa" or "weyermann" finds the product even though the standard layer
    // never carries a maltster name. Drill-down owns the list once a standard
    // is selected, and a blank query keeps the browser standard-first.
    [`${prefix}ProductMatches`]() {
      if (standardField && this[`${prefix}Standard`]) return [];
      const query = String(this[`${prefix}Search`] ?? "").trim();
      if (!query) return [];
      void this.catalogRevision;
      return catalogProductMatches(catalog(), {
        query,
        standardField,
        family: this[`${prefix}Family`],
        familyField,
        categories: this[`${prefix}CategoryFilter`],
        categoryField,
        searchFields,
        brandField,
        includeNotes: this[`${prefix}SearchNotes`],
        added: addedIds(this.draftRows),
        limit: productSearchLimit,
      });
    },
    [`${prefix}StandardName`]() {
      return standardSelectionName(catalog(), {
        standardField,
        standard: this[`${prefix}Standard`],
        standardNameField,
      });
    },
    [`${prefix}FilteredCatalog`]() {
      void this.catalogRevision;
      return filteredCatalogItems(catalog(), {
        standardField,
        standard: this[`${prefix}Standard`],
        added: addedIds(this.draftRows),
        query: this[`${prefix}Search`],
        categories: this[`${prefix}CategoryFilter`],
        categoryField,
        searchFields,
        includeNotes: this[`${prefix}SearchNotes`],
      });
    },
    [`${prefix}VisibleCatalog`]() {
      return visibleCatalogItems(this[`${prefix}FilteredCatalog`], {
        drilledIn: !!(standardField && this[`${prefix}Standard`]),
        maxVisible,
      });
    },
    [`${prefix}CatalogTruncated`]() {
      return isCatalogTruncated(this[`${prefix}FilteredCatalog`], {
        drilledIn: !!(standardField && this[`${prefix}Standard`]),
        maxVisible,
      });
    },
    [`${prefix}DraftCounts`]() {
      const counts = {};
      for (const row of this.draftRows ?? []) {
        const id = row?.[idField];
        if (id) counts[id] = (counts[id] ?? 0) + 1;
      }
      return counts;
    },
    [`${prefix}ActiveRow`]() {
      return activeDraftRow(this.draftRows, this[`${prefix}ActiveIndex`]);
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
    `toggle${Cap}SearchNotes`,
    `close${Cap}Drawer`, `toggle${Cap}Category`, `toggle${Cap}Family`, `select${Cap}Standard`,
    `clear${Cap}Standard`, `handle${Cap}Escape`, `${prefix}ItemMeta`, `${prefix}GroupMeta`,
    `${prefix}EditorOpen`, `${prefix}Catalog`, `${prefix}Categories`, `${prefix}Families`,
    `${prefix}StandardGroups`, `${prefix}StandardName`, `${prefix}ProductMatches`,
    `${prefix}FilteredCatalog`,
    `${prefix}VisibleCatalog`, `${prefix}CatalogTruncated`, `${prefix}DraftCounts`,
    `${prefix}ActiveRow`,
  ];
}
