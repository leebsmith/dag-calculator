// Trace / color malts card: definite-mass additions from the malt catalog.
// Uses the shared catalog/draft helper; bespoke bits are the summary readouts.

import { catalogDraftKeys, installCatalogDraft } from "./catalogDraft.js";
import { FERMENTABLE_NODES as N } from "../../views/registry/fermentables.js";
import { maltGroupMeta, maltItemMeta } from "../../views/producer/gristRows.js";
import { makeTraceMaltRow } from "../../views/producer/traceMaltRows.js";

export function registerTraceMaltsCard(app, ctx) {
  installCatalogDraft(app, ctx, {
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
  });

  Object.assign(app, {
    // Rows for the summary card (refreshed by refreshTraceMaltsCard).
    traceMaltRows: [],

    traceField(id) {
      return (this.fieldsBySlice[N.slice] ?? []).find((f) => f.id === id) ?? null;
    },
  });

  Object.defineProperties(app, {
    traceMaltField: {
      configurable: true,
      get() {
        return this.traceField(N.traceMalts);
      },
    },
    traceMassField: {
      configurable: true,
      get() {
        return this.traceField(N.traceMass);
      },
    },
    traceColorField: {
      configurable: true,
      get() {
        return this.traceField(N.traceColor);
      },
    },
    traceDraftMassDisplay: {
      configurable: true,
      get() {
        return this.draftMassDisplay((r) => Number(r.mass_kg) || 0);
      },
    },
  });
}

export function refreshTraceMaltsCard(app, ctx) {
  app.traceMaltRows = ctx.engine.get(N.traceMalts) ?? [];
}
export const KEYS = [...catalogDraftKeys("trace", "Trace"), "traceMaltRows", "traceField", "traceMaltField", "traceMassField", "traceColorField", "traceDraftMassDisplay"];
