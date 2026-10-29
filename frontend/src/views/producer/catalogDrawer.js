// Shared catalogue-drawer and draft-row readouts for the four catalogue
// cards. Pure `(rows|catalog|config) => …`; the installer owns the reactive
// state, the seed-cache lookup, the draft lifecycle handlers, and the
// `catalogRevision` touch.

import { catalogCategories, familyOptions, filterCatalog, standardGroups } from "../catalog.js";
import { joinNonEmpty } from "../../utils.js";

// A card supplies the parts; an installer without a meta function prints
// nothing rather than a bare separator.
export function catalogItemMeta(item, itemMeta) {
  if (!itemMeta || !item || typeof item !== "object") return "";
  return joinNonEmpty(itemMeta(item));
}

export function catalogGroupMeta(group, groupMeta) {
  if (!groupMeta || !group || typeof group !== "object") return "";
  return joinNonEmpty(groupMeta(group), " · ");
}

// The catalogue ids already in the draft, so a drawer never offers a row twice.
export function activeCatalogIds(rows, idField) {
  return new Set((rows ?? []).map((row) => row[idField]).filter(Boolean));
}

// A hop variety is routinely dosed more than once, so those drawers keep the
// item visible and show the count instead; the write path still accepts repeats.
export function addedCatalogIds(rows, idField, allowDuplicates = false) {
  if (allowDuplicates) return new Set();
  return activeCatalogIds(rows, idField);
}

export function catalogCategoryPills(items, categoryField) {
  return categoryField ? catalogCategories(items, (item) => item[categoryField]) : [];
}

export function catalogFamilyPills(items, familyField) {
  return familyField ? familyOptions(items, (item) => item[familyField]) : [];
}

// Representative (`std:`) entries are not producer variants, so the browser
// counts exclude them. A blank query keeps the browser standard-first; a query
// searches the standard's own name/description.
export function catalogStandardGroups(items, config) {
  const {
    standardField,
    standardNameField,
    standardDescriptionField,
    familyField = null,
    query = "",
    family = "",
    added = new Set(),
  } = config;
  const q = String(query ?? "").trim().toLowerCase();
  const isRepresentative = (item) => String(item.id ?? "").startsWith("std:");
  let list = items.filter((item) => !isRepresentative(item));
  if (family) list = list.filter((item) => item[familyField] === family);
  if (q) {
    list = filterCatalog(list, {
      activeIds: added,
      query: q,
      searchFields: [standardNameField, standardDescriptionField].filter(Boolean),
    });
  } else {
    list = list.filter((item) => !added.has(item.id));
  }
  return standardGroups(list, {
    idOf: (item) => item[standardField],
    nameOf: standardNameField ? (item) => item[standardNameField] : undefined,
    descriptionOf: standardDescriptionField
      ? (item) => item[standardDescriptionField]
      : undefined,
    familyOf: familyField ? (item) => item[familyField] : undefined,
  });
}

// Brand/name matches surfaced beside the standard groups: a query like
// "carafa" or "weyermann" finds the product even though the standard layer
// never carries a maltster name.
export function catalogProductMatches(items, config) {
  const {
    query,
    standardField = null,
    family = "",
    familyField = null,
    categories = [],
    categoryField = null,
    searchFields = ["name", "notes"],
    brandField = null,
    includeNotes = true,
    added = new Set(),
    limit = 10,
  } = config;
  const isRepresentative = (item) => String(item.id ?? "").startsWith("std:");
  let list = items.filter((item) => !isRepresentative(item));
  if (standardField && family) list = list.filter((item) => item[familyField] === family);
  const fields = [...new Set([...searchFields, ...(brandField ? [brandField] : [])])];
  return filterCatalog(list, {
    activeIds: added,
    query,
    categories,
    categoryOf: categoryField ? (item) => item[categoryField] : null,
    searchFields: fields,
    includeNotes,
  }).slice(0, limit);
}

export function standardSelectionName(items, config) {
  const { standardField, standard, standardNameField } = config;
  if (!standardField || !standard) return "";
  const item = items.find((i) => i[standardField] === standard);
  return item && standardNameField ? item[standardNameField] : standard ?? "";
}

export function filteredCatalogItems(items, config) {
  const {
    standardField = null,
    standard = "",
    added = new Set(),
    query = "",
    categories = [],
    categoryField = null,
    searchFields = ["name", "notes"],
    includeNotes = true,
  } = config;
  const drilledIn = !!(standardField && standard);
  const scoped = drilledIn
    ? items.filter((item) => item[standardField] === standard)
    : items;
  const filtered = filterCatalog(scoped, {
    activeIds: added,
    query,
    categories,
    categoryOf: categoryField ? (item) => item[categoryField] : null,
    searchFields,
    includeNotes,
  });
  // In a standard's drill-down, surface the generic representative first.
  if (drilledIn) {
    filtered.sort((a, b) => {
      const ar = String(a.id ?? "").startsWith("std:") ? 0 : 1;
      const br = String(b.id ?? "").startsWith("std:") ? 0 : 1;
      return ar - br || String(a.name ?? "").localeCompare(String(b.name ?? ""));
    });
  }
  return filtered;
}

export function visibleCatalogItems(filtered, { drilledIn = false, maxVisible = 25 } = {}) {
  return drilledIn ? filtered : filtered.slice(0, maxVisible);
}

export function isCatalogTruncated(filtered, { drilledIn = false, maxVisible = 25 } = {}) {
  return drilledIn ? false : filtered.length > maxVisible;
}

export function activeDraftRow(rows, index) {
  return index == null ? null : rows?.[index] ?? null;
}

export function toggledCategoryFilter(current, category) {
  const list = current ?? [];
  return list.includes(category) ? list.filter((c) => c !== category) : [...list, category];
}

export function toggledFamilyFilter(current, family) {
  return current === family ? "" : family;
}
