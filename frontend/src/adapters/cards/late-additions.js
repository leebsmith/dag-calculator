// Late sugar additions card: definite-mass rows dosed from the sugar catalog.
// Uses the shared catalog/draft helper; bespoke bits are the summary readouts.

import { installCatalogDraft } from "./catalogDraft.js";
import { LATE_ADDITION_NODES as N } from "../../views/registry/late-additions.js";
import { formatPercentRounded, formatValueWithUnit, resultCounter } from "../../utils.js";


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
    nodeId: N.collection,
    seedKey: "sugars",
    idField: "sugar_id",
    categoryField: null,
    makeRow,
    itemMeta: (item) => [
      `Yield ${formatPercentRounded(item.yield_fraction)}`,
      formatValueWithUnit(item.color_lovibond, "°L", { dash: "" }),
    ],
  });

  Object.assign(app, {
    // Rows for the read-only summary card (refreshed by refreshLateAdditionsCard).
    sugarList: [],

    sugarField(id) {
      return (this.fieldsBySlice[N.slice] ?? []).find((f) => f.id === id) ?? null;
    },
  });

  Object.defineProperties(app, {
    lateSugarField: {
      configurable: true,
      get() {
        return (
          (this.fieldsBySlice[N.slice] ?? []).find(
            (f) => f.control === "collection-table"
          ) ?? null
        );
      },
    },
    sugarMassField: {
      configurable: true,
      get() {
        return this.sugarField(N.mass);
      },
    },
    sugarColorField: {
      configurable: true,
      get() {
        return this.sugarField(N.color);
      },
    },
    lateExtractField: {
      configurable: true,
      get() {
        return this.sugarField(N.extract);
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
    sugarResultLabel: {
      configurable: true,
      get() {
        return resultCounter({
          shown: this.sugarVisibleCatalog.length,
          total: this.sugarFilteredCatalog.length,
          noun: "sugar",
          truncated: this.sugarCatalogTruncated,
          truncatedHint: "refine search",
        });
      },
    },
  });
}

export function refreshLateAdditionsCard(app, ctx) {
  app.sugarList = ctx.engine.get(N.collection) ?? [];
}
