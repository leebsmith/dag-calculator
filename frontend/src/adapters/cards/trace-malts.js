// Trace / color malts card: definite-mass additions from the malt catalog.
// Uses the shared catalog/draft helper; bespoke bits are the summary readouts.

import { installCatalogDraft } from "./catalogDraft.js";

const NODE = "grist.trace_malts";

function makeRow(malt) {
  return {
    catalog_id: malt.id,
    name: malt.name,
    category: malt.category,
    mass_kg: 0,
    yield_fraction: malt.yield_fraction,
    color_lovibond: malt.color_lovibond,
    moisture_pct: malt.moisture_pct ?? 0.04,
    notes: malt.notes,
  };
}

export function registerTraceMaltsCard(app, ctx) {
  installCatalogDraft(app, ctx, {
    prefix: "trace",
    Cap: "Trace",
    nodeId: NODE,
    seedKey: "malts",
    idField: "catalog_id",
    categoryField: "category",
    makeRow,
  });

  Object.assign(app, {
    // Rows for the summary card (refreshed by refreshTraceMaltsCard).
    traceMaltRows: [],

    traceField(id) {
      return (this.fieldsBySlice.fermentables ?? []).find((f) => f.id === id) ?? null;
    },
  });

  Object.defineProperties(app, {
    traceMaltField: {
      configurable: true,
      get() {
        return this.traceField(NODE);
      },
    },
    traceMassField: {
      configurable: true,
      get() {
        return this.traceField("grist.trace_malts_mass");
      },
    },
    traceColorField: {
      configurable: true,
      get() {
        return this.traceField("grist.trace_weighted_lovibond");
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
  app.traceMaltRows = ctx.engine.get(NODE) ?? [];
}
