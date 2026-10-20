// Yeast selection card: catalog picker with name / manufacturer / attenuation
// tier filters. Not a draft editor, so it does not use the catalog/draft helper.

import { derivationsFor } from "../../views/seedDerivations.js";

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
    yeastManufacturerFilter: "",
    yeastAttenuationFilter: "",

    yeastAttenuation(y) {
      return y ? `${formatPercent(y.attenuation_pct)}%` : "";
    },

    // Selecting a strain copies its typical attenuation into the batch's
    // apparent attenuation (which is edited on the Batch Sparge step).
    selectYeast(id) {
      this.setRoot("batch.yeast_id", id);
      const yeast = cache.references.yeast[id];
      if (yeast) {
        for (const { rootId, derive } of derivationsFor("batch.yeast")) {
          const value = derive(yeast);
          if (typeof value === "number") this.setRoot(rootId, value);
        }
      }
      this.scheduleSolve();
      this.notify();
    },

    clearYeastSelection() {
      this.setRoot("batch.yeast_id", "");
      this.scheduleSolve();
      this.notify();
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
        const q = this.yeastSearchQuery.trim().toLowerCase();
        const m = this.yeastManufacturerFilter;
        const t = this.yeastAttenuationFilter;
        return this.yeastCatalog.filter(
          (y) =>
            (!q || y.name.toLowerCase().includes(q)) &&
            (!m || y.manufacturer === m) &&
            (!t || attenuationTier(y.attenuation_pct) === t)
        );
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
  app.selectedYeastId = ctx.engine.get("batch.yeast_id") || "";
}
