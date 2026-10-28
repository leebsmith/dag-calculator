// Grain-bill (major malts) card: parts-based rows from the malt catalog.
// Uses the shared catalog/draft helper; bespoke bits are the parts/validation
// readouts, trace flag, and clone action.

import { catalogDraftKeys, installCatalogDraft } from "./catalogDraft.js";
import { FERMENTABLE_NODES as N } from "../../views/registry/fermentables.js";
import { countLabel, formatPercent, formatValueWithUnit, formatWithDecimals, toPercentValue } from "../../utils.js";
import { figureMarkFor } from "../../views/producer/table.js";
import { displayValue, nonlinearFns, resolveCollectionColumns } from "../../views/producer.js";
import { registry } from "../../views/steps.js";
import { reportError } from "../../observability.js";

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
    yield_basis: malt.yield_basis,
    yield_provenance: malt.yield_provenance,
    fermentability_fraction: malt.fermentability_fraction,
    fermentability_provenance: malt.fermentability_provenance,
    fermentability_basis: malt.fermentability_basis,
    fermentability_method: malt.fermentability_method,
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

    // Resolved real fermentability with its provenance marker (prior, floor,
    // or apparent-converted); blank when the row has no figure.
    maltFermentable(row) {
      if (typeof row?.fermentability_fraction !== "number") return "";
      return `${figureMarkFor("fermentability_fraction", row)}${formatPercent(
        row.fermentability_fraction
      )}`;
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
        const total = toPercentValue(this.maltTotalPct, 1);
        if (total === 100) {
          return { type: "balanced", label: "100.0% Balanced", class: "badge-success" };
        }
        if (total === 0) return { type: "unconfigured", label: "Unconfigured", class: "badge-muted" };
        if (total < 100) {
          const remaining = formatWithDecimals(100 - total, 1);
          return {
            type: "deficit",
            label: `${formatWithDecimals(total, 1)}% (Remaining ${remaining}%)`,
            class: "badge-amber",
          };
        }
        const excess = formatWithDecimals(total - 100, 1);
        return {
          type: "surplus",
          label: `${formatWithDecimals(total, 1)}% (Excess +${excess}%)`,
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
  // Mass and extract are artifact-computed row fields; the summary table shows
  // them in the mass column's display unit, formatted at refresh time.
  const columns = resolveCollectionColumns(
    ctx.artifact,
    registry,
    N.majorMalts,
    { columns: ["mass_kg", "extract_kg"] },
    ctx.ui?.unitMode ?? {}
  );
  const nl = nonlinearFns(ctx.artifact, ctx.engine);
  const cellFor = (column) => (kg) => {
    if (typeof kg !== "number" || !Number.isFinite(kg)) return "—";
    const shown = displayValue(ctx.artifact, "mass", column?.displayUnit, kg, nl);
    return `${formatWithDecimals(shown, column?.decimals)}${column?.unit ? " " + column.unit : ""}`;
  };
  const massCell = cellFor(columns[0]);
  const extractCell = cellFor(columns[1]);
  // The computed fields read the batch boundary, which may be unresolved or
  // failed; the authored rows still render.
  let rows;
  try {
    rows = ctx.engine.get(N.majorMalts) ?? [];
  } catch (err) {
    reportError("maltCard.rows", err);
    rows = ctx.engine.getAuthored(N.majorMalts) ?? [];
  }
  app.gristRows = sortGristRows(rows).map((row) => ({
    ...row,
    massDisplay: massCell(row.mass_kg),
    extractDisplay: extractCell(row.extract_kg),
  }));
}
export const KEYS = [...catalogDraftKeys("malt", "Malt"), "gristRows", "maltIsTrace", "maltFermentable", "cloneDraftMalt", "maltWeightedColor", "maltWeightedYield", "maltTotalParts", "maltTotalPct", "maltDraftTotals", "maltValidation", "maltAtLimit"];
