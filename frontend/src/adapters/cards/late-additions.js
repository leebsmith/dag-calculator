// Late sugar additions card: definite-mass rows dosed from the sugar catalog.
// Uses the shared catalog/draft helper; bespoke bits are the summary readouts.

import { installCatalogDraft } from "./catalogDraft.js";

const NODE = "batch.sugars";

function makeRow(sugar) {
  return {
    sugar_id: sugar.id,
    name: sugar.name,
    mass_kg: 0,
    yield_fraction: sugar.yield_fraction,
    color_lovibond: sugar.color_lovibond,
    notes: sugar.notes,
  };
}

export function registerLateAdditionsCard(app, ctx) {
  installCatalogDraft(app, ctx, {
    prefix: "sugar",
    Cap: "Sugar",
    nodeId: NODE,
    seedKey: "sugars",
    idField: "sugar_id",
    categoryField: null,
    makeRow,
  });

  Object.assign(app, {
    // Rows for the read-only summary card (refreshed by refreshLateAdditionsCard).
    sugarList: [],

    sugarField(id) {
      return (this.fieldsBySlice["late-additions"] ?? []).find((f) => f.id === id) ?? null;
    },
  });

  Object.defineProperties(app, {
    lateSugarField: {
      configurable: true,
      get() {
        return (
          (this.fieldsBySlice["late-additions"] ?? []).find(
            (f) => f.control === "collection-table"
          ) ?? null
        );
      },
    },
    sugarMassField: {
      configurable: true,
      get() {
        return this.sugarField("grist.sugars_mass");
      },
    },
    sugarColorField: {
      configurable: true,
      get() {
        return this.sugarField("grist.sugar_weighted_lovibond");
      },
    },
    lateExtractField: {
      configurable: true,
      get() {
        return this.sugarField("batch.s_late_add");
      },
    },
    sugarDraftMassDisplay: {
      configurable: true,
      get() {
        return this.draftMassDisplay((r) => Number(r.mass_kg) || 0);
      },
    },
    sugarDraftExtractDisplay: {
      configurable: true,
      get() {
        return this.draftMassDisplay(
          (r) => (Number(r.mass_kg) || 0) * (Number(r.yield_fraction) || 0)
        );
      },
    },
  });
}

export function refreshLateAdditionsCard(app, ctx) {
  app.sugarList = ctx.engine.get(NODE) ?? [];
}
