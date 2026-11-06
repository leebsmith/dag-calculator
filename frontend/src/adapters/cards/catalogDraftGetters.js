// Catalog-draft getters: the drawer's derived reads, kept apart from the
// handlers so each factory stays a readable unit. Every getter resolves the
// live view through the injected getView and reads the prefixed state it owns.

import {
  activeDraftRow,
  catalogCategoryPills,
  catalogFamilyPills,
  catalogProductMatches,
  catalogStandardGroups,
  filteredCatalogItems,
  isCatalogTruncated,
  standardSelectionName,
  visibleCatalogItems,
} from "../../views/producer/catalogDrawer.js";

function selectionGetters(d) {
  const { name, getView, catalog } = d;
  return {
    [name("EditorOpen")]() {
      const view = getView();
      return view.draftOpen && view.draftNodeId === d.nodeId;
    },
    [name("Catalog")]() {
      const view = getView();
      void view.catalogRevision;
      return catalog(view);
    },
    [name("Categories")]() {
      const view = getView();
      void view.catalogRevision;
      return catalogCategoryPills(catalog(view), d.categoryField);
    },
    [name("Families")]() {
      if (!d.standardField) return [];
      const view = getView();
      void view.catalogRevision;
      return catalogFamilyPills(catalog(view), d.familyField);
    },
    [name("StandardName")]() {
      const view = getView();
      return standardSelectionName(catalog(view), {
        standardField: d.standardField,
        standard: view[name("Standard")],
        standardNameField: d.standardNameField,
      });
    },
    [name("DraftCounts")]() {
      const counts = {};
      for (const row of getView().draftRows ?? []) {
        const id = row?.[d.idField];
        if (id) counts[id] = (counts[id] ?? 0) + 1;
      }
      return counts;
    },
    [name("ActiveRow")]() {
      const view = getView();
      return activeDraftRow(view.draftRows, view[name("ActiveIndex")]);
    },
  };
}

function filterGetters(d) {
  const { name, getView, catalog, addedIds } = d;
  const drilled = (view) => !!(d.standardField && view[name("Standard")]);
  return {
    [name("StandardGroups")]() {
      if (!d.standardField) return [];
      const view = getView();
      void view.catalogRevision;
      return catalogStandardGroups(catalog(view), {
        standardField: d.standardField,
        standardNameField: d.standardNameField,
        standardDescriptionField: d.standardDescriptionField,
        familyField: d.familyField,
        query: view[name("Search")],
        family: view[name("Family")],
        added: addedIds(view.draftRows),
      });
    },
    // Brand/name matches surfaced beside the standard groups, so a query like
    // "carafa" or "weyermann" finds the product even though the standard layer
    // never carries a maltster name. Drill-down owns the list once a standard
    // is selected, and a blank query keeps the browser standard-first.
    [name("ProductMatches")]() {
      const view = getView();
      if (d.standardField && view[name("Standard")]) return [];
      const query = String(view[name("Search")] ?? "").trim();
      if (!query) return [];
      void view.catalogRevision;
      return catalogProductMatches(catalog(view), {
        query,
        standardField: d.standardField,
        family: view[name("Family")],
        familyField: d.familyField,
        categories: view[name("CategoryFilter")],
        categoryField: d.categoryField,
        searchFields: d.searchFields,
        brandField: d.brandField,
        includeNotes: view[name("SearchNotes")],
        added: addedIds(view.draftRows),
        limit: d.productSearchLimit,
      });
    },
    [name("FilteredCatalog")]() {
      const view = getView();
      void view.catalogRevision;
      return filteredCatalogItems(catalog(view), {
        standardField: d.standardField,
        standard: view[name("Standard")],
        added: addedIds(view.draftRows),
        query: view[name("Search")],
        categories: view[name("CategoryFilter")],
        categoryField: d.categoryField,
        searchFields: d.searchFields,
        includeNotes: view[name("SearchNotes")],
      });
    },
    [name("VisibleCatalog")]() {
      const view = getView();
      return visibleCatalogItems(view[name("FilteredCatalog")], {
        drilledIn: drilled(view),
        maxVisible: d.maxVisible,
      });
    },
    [name("CatalogTruncated")]() {
      const view = getView();
      return isCatalogTruncated(view[name("FilteredCatalog")], {
        drilledIn: drilled(view),
        maxVisible: d.maxVisible,
      });
    },
  };
}

export function draftGetters(d) {
  return { ...selectionGetters(d), ...filterGetters(d) };
}
