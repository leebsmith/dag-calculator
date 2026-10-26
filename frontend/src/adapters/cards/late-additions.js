// Late sugar additions card: definite-mass rows dosed from the sugar catalog.
// Uses the shared catalog/draft helper; bespoke bits are the summary readouts.

import { catalogDraftKeys, installCatalogDraft } from "./catalogDraft.js";
import { LATE_ADDITION_NODES as N } from "../../views/registry/late-additions.js";
import { sugarEffect } from "../../views/producer/sugarEffect.js";
import { reportError } from "../../observability.js";
import {
  formatPercent,
  formatPercentRounded,
  formatValueWithUnit,
  formatWithDecimals,
  resultCounter,
} from "../../utils.js";


function makeRow(sugar) {
  return {
    sugar_id: sugar.id,
    name: sugar.name,
    mass_kg: 0,
    yield_fraction: sugar.yield_fraction,
    yield_basis: sugar.yield_basis,
    yield_provenance: sugar.yield_provenance,
    fermentability_fraction: sugar.fermentability_fraction,
    fermentability_provenance: sugar.fermentability_provenance,
    fermentability_basis: sugar.fermentability_basis,
    fermentability_method: sugar.fermentability_method,
    color_lovibond: sugar.color_lovibond,
    notes: sugar.notes,
  };
}

// The current dose's effect at the solved pin. Every operand comes from the
// batch solve; the panel never sets a root.
function currentSugarEffect(engine) {
  const read = (path, fallback) => {
    try {
      const value = engine.resolve(path);
      return typeof value === "number" && Number.isFinite(value) ? value : fallback;
    } catch (err) {
      reportError("lateAdditions.sugarEffect", err);
      return fallback;
    }
  };
  return sugarEffect({
    extractTotalKg: read(N.effect.extractTotal, 0),
    sugarExtractKg: read(N.extract, 0),
    sgPostBoil: read(N.effect.sgPostBoil, 0),
    apparentAttenuation: read(N.effect.apparentAttenuation, 0),
    gristYield: read(N.effect.gristYield, 0),
    grainMoisture: read(N.effect.grainMoisture, 0),
  });
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
    sugarEffect: {
      configurable: true,
      get() {
        return currentSugarEffect(ctx.engine);
      },
    },
    sugarEffectDisplay: {
      configurable: true,
      get() {
        const effect = currentSugarEffect(ctx.engine);
        if (!effect.active) return null;
        const signed = (value, decimals, suffix = "") =>
          `${value >= 0 ? "+" : ""}${formatWithDecimals(value, decimals)}${suffix}`;
        return {
          share: formatPercent(effect.share),
          og: signed(effect.ogPoints, 3),
          fg: "+0.000",
          abv: signed(effect.abvPoints, 2, "%"),
          grist:
            effect.gristKg == null
              ? "—"
              : `${formatWithDecimals(effect.gristKg, 2)} kg`,
        };
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
export const KEYS = [...catalogDraftKeys("sugar", "Sugar"), "sugarList", "sugarField", "lateSugarField", "sugarMassField", "sugarColorField", "lateExtractField", "sugarEffect", "sugarEffectDisplay", "sugarDraftMassDisplay", "sugarDraftExtractDisplay", "sugarResultLabel"];
