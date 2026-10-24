// Yeast selection card: catalog picker with name / manufacturer / attenuation
// tier filters. Not a draft editor, so it does not use the catalog/draft helper.

import { filterCatalog } from "../../views/catalog.js";
import { YEAST_NODES as N } from "../../views/registry/yeast.js";
import { resultCounter, toggleFilter } from "../../utils.js";

const MAX_VISIBLE = 25;

const formatPercent = (f) => (typeof f === "number" ? String(Math.round(f * 1000) / 10) : "");

function attenuationTier(pct) {
  if (typeof pct !== "number") return "";
  const p = pct * 100;
  if (p < 70.5) return "low";
  if (p < 75.5) return "medium";
  if (p < 82.5) return "high";
  return "super";
}

export function registerYeastCard(app, ctx) {
  const { cache } = ctx;

  Object.assign(app, {
    selectedYeastId: "",
    yeastSearchQuery: "",
    yeastSearchNotes: false,
    yeastManufacturerFilter: "",
    yeastAttenuationFilter: "",
    yeastChooserOpen: false,

    yeastAttenuation(y) {
      return y ? `${formatPercent(y.attenuation_pct)}%` : "";
    },

    // Selecting a strain records the selection and snapshot. The batch AA is
    // computed by the solver from the grist and the yeast cap.
    selectYeast(id) {
      this.setRoot(N.selection, id);
      this.pickSelection(N.selection, id);
      this.yeastSearchNotes = false;
      this.yeastChooserOpen = false;
      this.scheduleSolve();
      this.notify();
    },

    clearYeastSelection() {
      this.setRoot(N.selection, "");
      this.pickSelection(N.selection, "");
      this.yeastSearchNotes = false;
      this.yeastChooserOpen = true;
      this.scheduleSolve();
      this.notify();
    },

    toggleYeastChooser() {
      this.yeastChooserOpen = !this.yeastChooserOpen;
    },

    toggleYeastSearchNotes() {
      this.yeastSearchNotes = !this.yeastSearchNotes;
    },

    toggleYeastAttenuation(value) {
      this.yeastAttenuationFilter = toggleFilter(this.yeastAttenuationFilter, value);
    },

    // Commit the derate on blur/change, not per keystroke. Empty, invalid, or
    // out-of-range values reset to the previous value.
    commitYeastDerate(valueOrElement) {
      const element =
        valueOrElement && typeof valueOrElement === "object" ? valueOrElement : null;
      const raw = element ? element.value : valueOrElement;
      const field = this.yeastField(N.derate);
      const previous = this.master.getRoot(N.derate);
      const previousDisplay = field.display ?? formatPercent(previous);
      const value = Number(raw);
      if (raw === "" || !Number.isFinite(value) || value <= 0 || value > 100) {
        if (element) element.value = previousDisplay;
        return;
      }
      this.setRoot(N.derate, value / 100);
      if (element) element.value = formatPercent(value / 100);
      this.scheduleSolve();
      this.notify();
    },

    yeastField(id) {
      return (this.fieldsBySlice.yeast ?? []).find((f) => f.id === id) ?? {};
    },
  });

  Object.defineProperties(app, {
    yeastCatalog: {
      configurable: true,
      get() {
        void this.catalogRevision;
        return Object.values(cache.references.yeast ?? {});
      },
    },
    yeastManufacturers: {
      configurable: true,
      get() {
        return [...new Set(this.yeastCatalog.map((y) => y.manufacturer).filter(Boolean))].sort();
      },
    },
    yeastAttenuationTiers: {
      configurable: true,
      get() {
        return [
          { key: "low", label: "Low 65–70%" },
          { key: "medium", label: "Medium 71–75%" },
          { key: "high", label: "High 76–82%" },
          { key: "super", label: "Super 83%+" },
        ];
      },
    },
    filteredYeasts: {
      configurable: true,
      get() {
        const m = this.yeastManufacturerFilter;
        const t = this.yeastAttenuationFilter;
        const items = this.yeastCatalog.filter(
          (y) =>
            (!m || y.manufacturer === m) &&
            (!t || attenuationTier(y.attenuation_pct) === t)
        );
        return filterCatalog(items, {
          query: this.yeastSearchQuery,
          searchFields: ["name", "notes"],
          includeNotes: this.yeastSearchNotes,
        });
      },
    },
    visibleYeasts: {
      configurable: true,
      get() {
        return this.filteredYeasts.slice(0, MAX_VISIBLE);
      },
    },
    yeastResultCount: {
      configurable: true,
      get() {
        return this.filteredYeasts.length;
      },
    },
    isYeastListTruncated: {
      configurable: true,
      get() {
        return this.yeastResultCount > MAX_VISIBLE;
      },
    },
    yeastResultLabel: {
      configurable: true,
      get() {
        return resultCounter({
          shown: this.visibleYeasts.length,
          total: this.yeastResultCount,
          noun: "matching strain",
          truncated: this.isYeastListTruncated,
          truncatedHint: "refine search or filters",
        });
      },
    },
    selectedYeast: {
      configurable: true,
      get() {
        return this.selectedYeastId ? cache.references.yeast[this.selectedYeastId] ?? null : null;
      },
    },
    selectedYeastTemp: {
      configurable: true,
      get() {
        const y = this.selectedYeast;
        if (!y || typeof y.temp_low_c !== "number" || typeof y.temp_high_c !== "number") return "";
        return `${y.temp_low_c}–${y.temp_high_c}°C`;
      },
    },
  });
}

export function refreshYeastCard(app, ctx) {
  app.selectedYeastId = ctx.engine.get(N.selection) || "";
}

export const KEYS = ["selectedYeastId", "yeastSearchQuery", "yeastSearchNotes", "yeastChooserOpen", "toggleYeastSearchNotes", "yeastManufacturerFilter", "yeastAttenuationFilter", "yeastAttenuation", "selectYeast", "clearYeastSelection", "toggleYeastAttenuation", "toggleYeastChooser", "commitYeastDerate", "yeastField", "yeastCatalog", "yeastManufacturers", "yeastAttenuationTiers", "filteredYeasts", "visibleYeasts", "yeastResultCount", "isYeastListTruncated", "yeastResultLabel", "selectedYeast", "selectedYeastTemp"];
