// Yeast selection card: catalog picker with name / manufacturer / attenuation
// tier filters. Not a draft editor, so it does not use the catalog/draft helper.

import { filterCatalog } from "../../views/catalog.js";
import { displayValue, nonlinearFns } from "../../views/producer.js";
import { YEAST_NODES as N } from "../../views/registry/yeast.js";
import { UNIT_SYMBOLS, masterUnit, unitDecimals } from "../../views/registry/units.js";
import { toggleFilter, unitSymbol } from "../../utils.js";
import {
  attenuationBandLabel,
  attenuationLabel,
  attenuationTier,
  diastaticusTier,
  diastaticusTiers,
  isYeastListTruncated,
  percentText,
  sta1Label,
  temperatureRangeLabel,
  YEAST_ATTENUATION_TIERS,
  YEAST_ROW_LIMIT,
  yeastResultLabel,
} from "../../views/producer/yeastRows.js";

function yeastActions({ getView }) {
  return {
    selectedYeastId: "",
    yeastSearchQuery: "",
    yeastSearchNotes: false,
    yeastManufacturerFilter: "",
    yeastAttenuationFilter: "",
    yeastDiastaticusFilter: "",
    yeastPickerOpen: false,

    yeastAttenuation(y) {
      return attenuationLabel(y);
    },

    // The picker opens on a clean slate: a narrowing left from the last visit
    // would hide the catalog the next time it is opened.
    openYeastPicker() {
      const view = getView();
      view.yeastSearchQuery = "";
      view.yeastSearchNotes = false;
      view.yeastManufacturerFilter = "";
      view.yeastAttenuationFilter = "";
      view.yeastDiastaticusFilter = "";
      view.yeastPickerOpen = true;
    },

    closeYeastPicker() {
      getView().yeastPickerOpen = false;
    },

    handleYeastEscape() {
      const view = getView();
      if (view.yeastPickerOpen) view.closeYeastPicker();
    },

    // Selecting a strain records the selection and snapshot and closes the
    // picker. The batch AA is computed by the solver from the grist and cap.
    selectYeast(id) {
      const view = getView();
      view.setRoot(N.selection, id);
      view.pickSelection(N.selection, id);
      view.yeastSearchNotes = false;
      view.closeYeastPicker();
      view.scheduleSolve();
      view.notify();
    },

    clearYeastSelection() {
      const view = getView();
      view.setRoot(N.selection, "");
      view.pickSelection(N.selection, "");
      view.yeastSearchNotes = false;
      view.scheduleSolve();
      view.notify();
    },

    toggleYeastSearchNotes() {
      const view = getView();
      view.yeastSearchNotes = !view.yeastSearchNotes;
    },

    toggleYeastAttenuation(value) {
      const view = getView();
      view.yeastAttenuationFilter = toggleFilter(view.yeastAttenuationFilter, value);
    },

    toggleYeastDiastaticus(value) {
      const view = getView();
      view.yeastDiastaticusFilter = toggleFilter(view.yeastDiastaticusFilter, value);
    },

    // Commit the derate on blur/change, not per keystroke. Empty, invalid, or
    // out-of-range values reset to the previous value. The control is always in
    // percentage points, independent of the percentage unit menu.
    commitYeastDerate(valueOrElement) {
      const view = getView();
      const element =
        valueOrElement && typeof valueOrElement === "object" ? valueOrElement : null;
      const raw = element ? element.value : valueOrElement;
      const previousDisplay = view.yeastDerateDisplay;
      const value = Number(raw);
      if (raw === "" || !Number.isFinite(value) || value < 0 || value > 25) {
        if (element) element.value = previousDisplay;
        return;
      }
      view.setRoot(N.derate, value / 100);
      if (element) element.value = percentText(value / 100);
      view.scheduleSolve();
      view.notify();
    },

    yeastField(id) {
      return (getView().fieldsBySlice.yeast ?? []).find((f) => f.id === id) ?? {};
    },
  };
}

function catalogDescriptors({ cache, getView }) {
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
    filteredYeasts: {
      configurable: true,
      get() {
        const view = getView();
        const m = view.yeastManufacturerFilter;
        const t = view.yeastAttenuationFilter;
        const d = view.yeastDiastaticusFilter;
        const items = view.yeastCatalog.filter(
          (y) =>
            (!m || y.manufacturer === m) &&
            (!t || attenuationTier(y.attenuation_pct) === t) &&
            (!d || diastaticusTier(y) === d)
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

function selectionDescriptors({ cache, artifact, nl, getView }) {
  return {
    selectedYeast: {
      configurable: true,
      get() {
        const id = getView().selectedYeastId;
        return id ? cache.references.yeast[id] ?? null : null;
      },
    },
    selectedYeastTemp: {
      configurable: true,
      get() {
        const view = getView();
        const unitId = masterUnit(view.unitMode, "temperature") ?? "degC";
        return temperatureRangeLabel(view.selectedYeast, {
          toDisplay: (value) => displayValue(artifact, "temperature", unitId, value, nl),
          symbol: unitSymbol(UNIT_SYMBOLS, "temperature", unitId),
          decimals: unitDecimals("temperature", unitId) ?? 1,
        });
      },
    },
    // The derate is percentage points, not a fraction: the input must not follow
    // the percentage menu (a `fraction` pick would show 0.04 beside step 0.5).
    yeastDerateDisplay: {
      configurable: true,
      get() {
        return percentText(getView().yeastField(N.derate).value ?? 0);
      },
    },
    selectedYeastBand: {
      configurable: true,
      get() {
        return attenuationBandLabel(getView().selectedYeast);
      },
    },
    selectedYeastSta1: {
      configurable: true,
      get() {
        return sta1Label(getView().selectedYeast);
      },
    },
  };
}

export function createYeastCard(ctx) {
  const { cache, artifact, engine, getView } = ctx;
  const nl = nonlinearFns(artifact, engine);
  const actions = yeastActions(ctx);
  Object.defineProperties(actions, {
    ...catalogDescriptors({ cache, getView }),
    ...selectionDescriptors({ cache, artifact, nl, getView }),
  });
  return actions;
}

export function registerYeastCard(app, ctx = {}) {
  const actions = createYeastCard({ ...ctx, getView: ctx.getView ?? (() => app) });
  Object.defineProperties(app, Object.getOwnPropertyDescriptors(actions));
  return actions;
}

export function refreshYeastCard(app, ctx) {
  app.selectedYeastId = ctx.engine.get(N.selection) || "";
}

export const KEYS = ["selectedYeastId", "yeastSearchQuery", "yeastSearchNotes", "yeastPickerOpen", "openYeastPicker", "closeYeastPicker", "handleYeastEscape", "toggleYeastSearchNotes", "yeastManufacturerFilter", "yeastAttenuationFilter", "yeastDiastaticusFilter", "yeastAttenuation", "selectYeast", "clearYeastSelection", "toggleYeastAttenuation", "toggleYeastDiastaticus", "commitYeastDerate", "yeastField", "yeastCatalog", "yeastManufacturers", "yeastAttenuationTiers", "yeastDiastaticusTiers", "filteredYeasts", "visibleYeasts", "yeastResultCount", "isYeastListTruncated", "yeastResultLabel", "selectedYeast", "selectedYeastTemp", "selectedYeastBand", "selectedYeastSta1", "yeastDerateDisplay"];
