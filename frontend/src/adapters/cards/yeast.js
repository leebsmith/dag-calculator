// Yeast selection card: catalog picker with name / manufacturer / attenuation
// tier filters. Not a draft editor, so it does not use the catalog/draft helper.

import { filterCatalog } from "../../views/catalog.js";
import { YEAST_NODES as N } from "../../views/registry/yeast.js";
import { resultCounter, toggleFilter, toPercentValue } from "../../utils.js";

const MAX_VISIBLE = 25;

// A fraction as a percentage number without the "%" suffix, e.g. "75" / "75.5".
const percentText = (fraction) => String(toPercentValue(fraction, 1));

function attenuationTier(pct) {
  if (typeof pct !== "number") return "";
  if (pct < 0.705) return "low";
  if (pct < 0.755) return "medium";
  if (pct < 0.825) return "high";
  return "super";
}

// Vendor QC is tri-state and sparse: most seeds publish no STA1 result, so
// "unknown" is a real bucket, not a missing value to hide.
function diastaticusTier(yeast) {
  if (yeast?.sta1 === true) return "positive";
  if (yeast?.sta1 === false) return "negative";
  return "unknown";
}

export function registerYeastCard(app, ctx) {
  const { cache } = ctx;

  Object.assign(app, {
    selectedYeastId: "",
    yeastSearchQuery: "",
    yeastSearchNotes: false,
    yeastManufacturerFilter: "",
    yeastAttenuationFilter: "",
    yeastDiastaticusFilter: "",
    derateHelpOpen: false,

    yeastAttenuation(y) {
      return y ? `${percentText(y.attenuation_pct)}%` : "";
    },

    // Selecting a strain records the selection and snapshot. The batch AA is
    // computed by the solver from the grist and the yeast cap.
    selectYeast(id) {
      this.setRoot(N.selection, id);
      this.pickSelection(N.selection, id);
      this.yeastSearchNotes = false;
      this.scheduleSolve();
      this.notify();
    },

    clearYeastSelection() {
      this.setRoot(N.selection, "");
      this.pickSelection(N.selection, "");
      this.yeastSearchNotes = false;
      this.scheduleSolve();
      this.notify();
    },

    toggleDerateHelp() {
      this.derateHelpOpen = !this.derateHelpOpen;
    },

    toggleYeastSearchNotes() {
      this.yeastSearchNotes = !this.yeastSearchNotes;
    },

    toggleYeastAttenuation(value) {
      this.yeastAttenuationFilter = toggleFilter(this.yeastAttenuationFilter, value);
    },

    toggleYeastDiastaticus(value) {
      this.yeastDiastaticusFilter = toggleFilter(this.yeastDiastaticusFilter, value);
    },

    // Commit the derate on blur/change, not per keystroke. Empty, invalid, or
    // out-of-range values reset to the previous value.
    commitYeastDerate(valueOrElement) {
      const element =
        valueOrElement && typeof valueOrElement === "object" ? valueOrElement : null;
      const raw = element ? element.value : valueOrElement;
      const field = this.yeastField(N.derate);
      const previous = this.master.getRoot(N.derate);
      const previousDisplay = field.display ?? percentText(previous);
      const value = Number(raw);
      if (raw === "" || !Number.isFinite(value) || value < 0 || value > 25) {
        if (element) element.value = previousDisplay;
        return;
      }
      this.setRoot(N.derate, value / 100);
      if (element) element.value = percentText(value / 100);
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
    yeastDiastaticusTiers: {
      configurable: true,
      get() {
        const counts = { positive: 0, negative: 0, unknown: 0 };
        for (const yeast of this.yeastCatalog) counts[diastaticusTier(yeast)] += 1;
        return [
          { key: "positive", label: "Diastaticus", count: counts.positive },
          { key: "negative", label: "Non-diastaticus", count: counts.negative },
          { key: "unknown", label: "Unknown", count: counts.unknown },
        ];
      },
    },
    filteredYeasts: {
      configurable: true,
      get() {
        const m = this.yeastManufacturerFilter;
        const t = this.yeastAttenuationFilter;
        const d = this.yeastDiastaticusFilter;
        const items = this.yeastCatalog.filter(
          (y) =>
            (!m || y.manufacturer === m) &&
            (!t || attenuationTier(y.attenuation_pct) === t) &&
            (!d || diastaticusTier(y) === d)
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

export const KEYS = ["selectedYeastId", "yeastSearchQuery", "yeastSearchNotes", "derateHelpOpen", "toggleYeastSearchNotes", "yeastManufacturerFilter", "yeastAttenuationFilter", "yeastDiastaticusFilter", "yeastAttenuation", "selectYeast", "clearYeastSelection", "toggleYeastAttenuation", "toggleYeastDiastaticus", "toggleDerateHelp", "commitYeastDerate", "yeastField", "yeastCatalog", "yeastManufacturers", "yeastAttenuationTiers", "yeastDiastaticusTiers", "filteredYeasts", "visibleYeasts", "yeastResultCount", "isYeastListTruncated", "yeastResultLabel", "selectedYeast", "selectedYeastTemp"];
