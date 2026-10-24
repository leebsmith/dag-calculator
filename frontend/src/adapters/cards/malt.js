// Grain-bill (major malts) card: parts-based rows from the malt catalog.
// Uses the shared catalog/draft helper; bespoke bits are the parts/validation
// readouts, trace flag, and clone action.

import { catalogDraftKeys, installCatalogDraft } from "./catalogDraft.js";
import { FERMENTABLE_NODES as N } from "../../views/registry/fermentables.js";
import { countLabel, formatPercent, formatValueWithUnit, formatWithDecimals } from "../../utils.js";

const MAX_VISIBLE = 25;
const MAX_MAJOR_MALTS = 8;

// Summary-card order: largest parts first, then name (case-insensitive).
export function sortGristRows(rows) {
  return [...rows].sort(
    (a, b) =>
      (Number(b.parts) || 0) - (Number(a.parts) || 0) ||
      String(a.name ?? "").localeCompare(String(b.name ?? ""), undefined, { sensitivity: "base" })
  );
}

function makeRow(malt) {
  return {
    catalog_id: malt.id,
    name: malt.name,
    category: malt.category,
    parts: 10,
    pct: 0,
    yield_fraction: malt.yield_fraction,
    moisture_fraction: malt.moisture_fraction,
    color_lovibond: malt.color_lovibond,
    notes: malt.notes,
  };
}

export function registerMaltCard(app, ctx) {
  installCatalogDraft(app, ctx, {
    prefix: "malt",
    Cap: "Malt",
    nodeId: N.majorMalts,
    seedKey: "malts",
    idField: "catalog_id",
    categoryField: "category",
    standardField: "standard_malt",
    standardNameField: "standard_name",
    standardDescriptionField: "generic_description",
    familyField: "family",
    brandField: "maltster",
    productSearchLimit: 10,
    makeRow,
    maxVisible: MAX_VISIBLE,
    canAdd: (target) => !target.maltAtLimit,
    itemMeta: (item) => [
      item.category,
      formatValueWithUnit(item.color_lovibond, "°L", { dash: "" }),
      item.notes,
    ],
    groupMeta: (group) => [group.description, countLabel(group.count, "malt")],
  });

  Object.assign(app, {
    // Grain-bill rows for the summary card (refreshed by refreshMaltCard).
    gristRows: [],

    // Trace = under 2% of the bill (matches the legacy threshold).
    maltIsTrace(row) {
      return (row.pct || 0) < 0.02;
    },

    cloneDraftMalt(ri) {
      if (this.maltAtLimit) return;
      const row = this.draftRows[ri];
      if (!row) return;
      this.addDraftRow({ ...row, catalog_id: null, name: `${row.name} (Custom)` });
      this.inspectMaltRow(this.draftRows.length - 1);
    },
  });

  Object.defineProperties(app, {
    maltWeightedColor: {
      configurable: true,
      get() {
        return (
          (this.fieldsBySlice[N.slice] ?? []).find((f) => f.id === N.weightedLovibond) ?? null
        );
      },
    },
    maltWeightedYield: {
      configurable: true,
      get() {
        return (
          (this.fieldsBySlice[N.slice] ?? []).find(
            (f) => f.id === N.weightedYield
          ) ?? null
        );
      },
    },
    maltTotalParts: {
      configurable: true,
      get() {
        return this.draftRows.reduce((sum, r) => sum + (Number(r.parts) || 0), 0);
      },
    },
    maltTotalPct: {
      configurable: true,
      get() {
        return this.draftRows.reduce((sum, r) => sum + (r.pct || 0), 0);
      },
    },
    maltDraftTotals: {
      configurable: true,
      get() {
        const parts = formatWithDecimals(this.maltTotalParts, 1);
        return `${parts} parts · ${formatPercent(this.maltTotalPct)}`;
      },
    },
    maltValidation: {
      configurable: true,
      get() {
        const total = Number((this.maltTotalPct * 100).toFixed(1));
        if (total === 100) {
          return { type: "balanced", label: "100.0% Balanced", class: "badge-success" };
        }
        if (total === 0) return { type: "unconfigured", label: "Unconfigured", class: "badge-muted" };
        if (total < 100) {
          const remaining = (100 - total).toFixed(1);
          return {
            type: "deficit",
            label: `${total.toFixed(1)}% (Remaining ${remaining}%)`,
            class: "badge-amber",
          };
        }
        const excess = (total - 100).toFixed(1);
        return {
          type: "surplus",
          label: `${total.toFixed(1)}% (Excess +${excess}%)`,
          class: "badge-danger",
        };
      },
    },
    maltAtLimit: {
      configurable: true,
      get() {
        return this.draftRows.length >= MAX_MAJOR_MALTS;
      },
    },
  });
}

export function refreshMaltCard(app, ctx) {
  app.gristRows = sortGristRows(ctx.engine.get(N.majorMalts) ?? []);
}
export const KEYS = [...catalogDraftKeys("malt", "Malt"), "gristRows", "maltIsTrace", "cloneDraftMalt", "maltWeightedColor", "maltWeightedYield", "maltTotalParts", "maltTotalPct", "maltDraftTotals", "maltValidation", "maltAtLimit"];
