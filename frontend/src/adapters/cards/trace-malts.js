// Trace / color malts card: definite-mass additions from the malt catalog.
// Uses the shared catalog/draft helper; bespoke bits are the summary readouts.

import {
  catalogDraftKeys,
  catalogDraftLayer,
  createCatalogDraft,
} from "./catalogDraft.js";
import { FERMENTABLE_NODES as N } from "../../views/registry/fermentables.js";
import { countLabel } from "../../utils.js";
import {
  gristSectionMeta,
  maltGroupMeta,
  maltItemMeta,
} from "../../views/producer/gristRows.js";
import { makeTraceMaltRow } from "../../views/producer/traceMaltRows.js";

const TRACE_CONFIG = {
  prefix: "trace",
  Cap: "Trace",
  nodeId: N.traceMalts,
  seedKey: "malts",
  idField: "catalog_id",
  categoryField: "category",
  standardField: "standard_malt",
  standardNameField: "standard_name",
  standardDescriptionField: "generic_description",
  familyField: "family",
  brandField: "maltster",
  productSearchLimit: 10,
  makeRow: makeTraceMaltRow,
  itemMeta: maltItemMeta,
  groupMeta: maltGroupMeta,
  searchPlaceholder: "Search malts by name…",
  emptyMessage: "No matching standards or malts found.",
  emptyDrilldownMessage: "No matching malts found.",
  resultLabel: (state) =>
    state.traceStandard
      ? `Showing ${state.traceFilteredCatalog.length} malts`
      : state.traceSearch.trim()
        ? `${state.traceStandardGroups.length} standards · ${state.traceProductMatches.length} malts`
        : `Showing ${state.traceStandardGroups.length} standards`,
  drawerId: "trace-drawer",
  toolbarNote:
    "Dose colorants and strong flavorants by mass. They feed color and mash pH, not extract.",
  addLabel: "＋ Add Trace Malt by Weight",
  emptyText: "No trace malts in the draft. Click “＋ Add Trace Malt by Weight”.",
  totals: (state) => ({
    label: "Total trace mass:",
    value: ` ${state.traceDraftMassDisplay}`,
  }),
};

export function createTraceMaltsCard({ getView }) {
  const actions = {
    traceMaltRows: [],
    traceSectionOpen: true,

    toggleTraceSection() {
      const view = getView();
      view.traceSectionOpen = !view.traceSectionOpen;
    },

    traceField(id) {
      return (getView().fieldsBySlice[N.slice] ?? []).find((f) => f.id === id) ?? null;
    },
  };

  Object.defineProperties(actions, {
    traceMaltField: {
      configurable: true,
      get() {
        return actions.traceField(N.traceMalts);
      },
    },
    traceSectionMeta: {
      configurable: true,
      get() {
        const view = getView();
        return gristSectionMeta(
          view.traceMaltRows,
          countLabel(view.traceMaltRows.length, "trace malt"),
          view.traceMassField
        );
      },
    },
    traceMassField: {
      configurable: true,
      get() {
        return actions.traceField(N.traceMass);
      },
    },
    traceDraftMassDisplay: {
      configurable: true,
      get() {
        return getView().draftMassDisplay((r) => Number(r.mass_kg) || 0);
      },
    },
  });
  return actions;
}

export function createTraceMaltsLayers(ctx) {
  return [
    catalogDraftLayer(createCatalogDraft(ctx, TRACE_CONFIG, ctx.registry)),
    createTraceMaltsCard(ctx),
  ];
}

export function refreshTraceMaltsCard(app, ctx) {
  app.traceMaltRows = ctx.engine.get(N.traceMalts) ?? [];
}

export const KEYS = [
  ...catalogDraftKeys("trace", "Trace"),
  "traceMaltRows",
  "traceSectionOpen",
  "toggleTraceSection",
  "traceSectionMeta",
  "traceField",
  "traceMaltField",
  "traceMassField",
  "traceDraftMassDisplay",
];
