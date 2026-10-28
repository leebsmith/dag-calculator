// Grain-bill (major malts) card: parts-based rows from the malt catalog.
// Uses the shared catalog/draft helper; bespoke bits are the parts/validation
// readouts, trace flag, and clone action.

import { catalogDraftKeys, installCatalogDraft } from "./catalogDraft.js";
import { FERMENTABLE_NODES as N } from "../../views/registry/fermentables.js";
import { countLabel, formatValueWithUnit, formatWithDecimals } from "../../utils.js";
import {
  gristDraftTotalsLabel,
  gristTotalParts,
  gristTotalPct,
  gristValidationState,
  isMaltAtLimit,
  isTraceMalt,
  maltFermentableLabel,
  sortGristRows,
} from "../../views/producer/gristRows.js";
import { displayValue, nonlinearFns, resolveCollectionColumns } from "../../views/producer.js";
import { registry } from "../../views/steps.js";
import { reportError } from "../../observability.js";

const MAX_VISIBLE = 25;

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

    maltIsTrace(row) {
      return isTraceMalt(row);
    },

    maltFermentable(row) {
      return maltFermentableLabel(row);
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
        return gristTotalParts(this.draftRows);
      },
    },
    maltTotalPct: {
      configurable: true,
      get() {
        return gristTotalPct(this.draftRows);
      },
    },
    maltDraftTotals: {
      configurable: true,
      get() {
        return gristDraftTotalsLabel(this.maltTotalParts, this.maltTotalPct);
      },
    },
    maltValidation: {
      configurable: true,
      get() {
        return gristValidationState(this.maltTotalPct);
      },
    },
    maltAtLimit: {
      configurable: true,
      get() {
        return isMaltAtLimit(this.draftRows.length);
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
