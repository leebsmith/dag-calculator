// Grain-bill (major malts) card: parts-based rows from the malt catalog.
// Uses the shared catalog/draft helper; bespoke bits are the parts/validation
// readouts, trace flag, and clone action.

import { catalogDraftKeys, installCatalogDraft } from "./catalogDraft.js";
import { FERMENTABLE_NODES as N } from "../../views/registry/fermentables.js";
import { countLabel, formatWithDecimals } from "../../utils.js";
import {
  gristDraftTotalsLabel,
  gristSectionMeta,
  gristTotalParts,
  gristTotalPct,
  gristValidationState,
  isMaltAtLimit,
  isTraceMalt,
  maltFermentableLabel,
  maltGroupMeta,
  maltItemMeta,
  sortGristRows,
} from "../../views/producer/gristRows.js";
import { displayValue, nonlinearFns, resolveCollectionColumns } from "../../views/producer.js";
import { registry } from "../../views/steps.js";
import { ignoreError } from "../../observability.js";

const MAX_VISIBLE = 25;

export function makeRow(malt) {
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

const MALT_CONFIG = {
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
  itemMeta: maltItemMeta,
  groupMeta: maltGroupMeta,
  searchPlaceholder: "Search malts by name…",
  emptyMessage: "No matching standards or malts found.",
  emptyDrilldownMessage: "No matching malts found.",
  resultLabel: (state) =>
    state.maltStandard
      ? `Showing ${state.maltFilteredCatalog.length} malts`
      : state.maltSearch.trim()
        ? `${state.maltStandardGroups.length} standards · ${state.maltProductMatches.length} malts`
        : `Showing ${state.maltStandardGroups.length} standards`,
  drawerId: "malt-drawer",
  toolbarNote:
    "Enter relative proportional parts. Hamilton normalizes the bill to exactly 100.0%.",
  addLabel: "＋ Add Malt from Catalog",
  textColumns: ["name", "category"],
  canClone: true,
  cloneRow: (state, ri) => state.cloneDraftMalt(ri),
  emptyText: "No malts in the draft. Click “＋ Add Malt from Catalog” to begin.",
  totals: (state) => ({ label: "", value: state.maltDraftTotals }),
  rowBadge: (state, row, columnId) =>
    columnId === "pct"
      ? {
          className: state.maltIsTrace(row) ? "is-trace" : "is-valid",
          text: state.maltIsTrace(row) ? "✗" : "✓",
        }
      : null,
};

export function createMaltCard({ getView }) {
  const actions = {
    gristRows: [],
    maltSectionOpen: true,

    toggleMaltSection() {
      const view = getView();
      view.maltSectionOpen = !view.maltSectionOpen;
    },

    maltIsTrace(row) {
      return isTraceMalt(row);
    },

    maltFermentable(row) {
      return maltFermentableLabel(row);
    },

    cloneDraftMalt(ri) {
      const view = getView();
      if (view.maltAtLimit) return;
      const row = view.draftRows[ri];
      if (!row) return;
      view.addDraftRow({ ...row, catalog_id: null, name: `${row.name} (Custom)` });
      view.inspectMaltRow(view.draftRows.length - 1);
    },
  };

  Object.defineProperties(actions, {
    maltMassField: {
      configurable: true,
      get() {
        return (getView().fieldsBySlice[N.slice] ?? []).find((f) => f.id === N.gristMass) ?? null;
      },
    },
    maltSectionMeta: {
      configurable: true,
      get() {
        const view = getView();
        return gristSectionMeta(
          view.gristRows,
          countLabel(view.gristRows.length, "malt"),
          view.maltMassField
        );
      },
    },
    gristTotalMassField: {
      configurable: true,
      get() {
        return (getView().fieldsBySlice[N.slice] ?? []).find((f) => f.id === N.totalMass) ?? null;
      },
    },
    beerColorField: {
      configurable: true,
      get() {
        return getView().fieldsById[N.beerColor] ?? null;
      },
    },
    maltWeightedYield: {
      configurable: true,
      get() {
        return (
          (getView().fieldsBySlice[N.slice] ?? []).find((f) => f.id === N.weightedYield) ?? null
        );
      },
    },
    maltTotalParts: {
      configurable: true,
      get() {
        return gristTotalParts(getView().draftRows);
      },
    },
    maltTotalPct: {
      configurable: true,
      get() {
        return gristTotalPct(getView().draftRows);
      },
    },
    maltDraftTotals: {
      configurable: true,
      get() {
        const view = getView();
        return gristDraftTotalsLabel(view.maltTotalParts, view.maltTotalPct);
      },
    },
    maltValidation: {
      configurable: true,
      get() {
        return gristValidationState(getView().maltTotalPct);
      },
    },
    maltAtLimit: {
      configurable: true,
      get() {
        return isMaltAtLimit(getView().draftRows.length);
      },
    },
  });
  return actions;
}

export function registerMaltCard(app, ctx = {}) {
  installCatalogDraft(app, ctx, MALT_CONFIG);
  const actions = createMaltCard({ ...ctx, getView: ctx.getView ?? (() => app) });
  Object.defineProperties(app, Object.getOwnPropertyDescriptors(actions));
  return actions;
}

export function refreshMaltCard(app, ctx) {
  // The silent fallback is for direct unit tests; the app state always carries
  // the observability manager.
  const reportError = ctx.observability?.reportError ?? ignoreError;
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

export const KEYS = [
  ...catalogDraftKeys("malt", "Malt"),
  "gristRows",
  "maltSectionOpen",
  "toggleMaltSection",
  "maltSectionMeta",
  "maltMassField",
  "gristTotalMassField",
  "beerColorField",
  "maltIsTrace",
  "maltFermentable",
  "cloneDraftMalt",
  "maltWeightedYield",
  "maltTotalParts",
  "maltTotalPct",
  "maltDraftTotals",
  "maltValidation",
  "maltAtLimit",
];
