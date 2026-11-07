// Yeast picker descriptors: catalog, filters, result rows and truncation.

import { filterCatalog } from "../../views/catalog.js";
import {
  attenuationTier,
  diastaticusTier,
  diastaticusTiers,
  isYeastListTruncated,
  pofTier,
  pofTiers,
  YEAST_ATTENUATION_TIERS,
  YEAST_ROW_LIMIT,
  yeastResultLabel,
} from "../../views/producer/yeastRows.js";

export function createYeastPickerDescriptors({ cache, getView }) {
  return {
    yeastCatalog: {
      configurable: true,
      get() {
        void getView().catalogRevision;
        return Object.values(cache.references.yeast ?? {});
      },
    },
    yeastManufacturers: {
      configurable: true,
      get() {
        return [...new Set(getView().yeastCatalog.map((y) => y.manufacturer).filter(Boolean))].sort();
      },
    },
    yeastAttenuationTiers: {
      configurable: true,
      get() {
        return YEAST_ATTENUATION_TIERS;
      },
    },
    yeastDiastaticusTiers: {
      configurable: true,
      get() {
        return diastaticusTiers(getView().yeastCatalog);
      },
    },
    yeastPofTiers: {
      configurable: true,
      get() {
        return pofTiers(getView().yeastCatalog);
      },
    },
    filteredYeasts: {
      configurable: true,
      get() {
        const view = getView();
        const m = view.yeastManufacturerFilter;
        const t = view.yeastAttenuationFilter;
        const d = view.yeastDiastaticusFilter;
        const p = view.yeastPofFilter;
        const items = view.yeastCatalog.filter(
          (y) =>
            (!m || y.manufacturer === m) &&
            (!t || attenuationTier(y.attenuation_cap_pct) === t) &&
            (!d || diastaticusTier(y) === d) &&
            (!p || pofTier(y) === p)
        );
        return filterCatalog(items, {
          query: view.yeastSearchQuery,
          searchFields: ["name", "notes"],
          includeNotes: view.yeastSearchNotes,
        });
      },
    },
    visibleYeasts: {
      configurable: true,
      get() {
        return getView().filteredYeasts.slice(0, YEAST_ROW_LIMIT);
      },
    },
    yeastResultCount: {
      configurable: true,
      get() {
        return getView().filteredYeasts.length;
      },
    },
    isYeastListTruncated: {
      configurable: true,
      get() {
        return isYeastListTruncated(getView().yeastResultCount);
      },
    },
    yeastResultLabel: {
      configurable: true,
      get() {
        const view = getView();
        return yeastResultLabel(
          view.visibleYeasts.length,
          view.yeastResultCount,
          view.isYeastListTruncated
        );
      },
    },
  };
}
