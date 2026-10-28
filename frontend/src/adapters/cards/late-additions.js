// Late sugar additions card: definite-mass rows dosed from the sugar catalog.
// Uses the shared catalog/draft helper; bespoke bits are the summary readouts.

import { catalogDraftKeys, installCatalogDraft } from "./catalogDraft.js";
import { LATE_ADDITION_NODES as N } from "../../views/registry/late-additions.js";
import {
  columnValueLabel,
  sugarActive,
  sugarCatalogCountLabel,
  sugarEffectLabels,
  sugarTableCountLabel,
} from "../../views/producer/lateAdditionRows.js";
import { scalePreviewState } from "../../views/producer/scalePreview.js";
import { sugarEffect } from "../../views/producer/sugarEffect.js";
import {
  EQUAL_SUGAR_PARTS,
  MAX_SUGAR_SHARE,
  resolvedSugarMasses,
  sugarPartsFromDose,
  sugarShareFromDose,
} from "../../views/producer/sugarAllocation.js";
import { displayValue, nonlinearFns } from "../../views/producer.js";
import { reportError } from "../../observability.js";
import {
  formatPercentRounded,
  formatValueWithUnit,
  roundTo,
} from "../../utils.js";


function makeRow(sugar) {
  return {
    sugar_id: sugar.id,
    name: sugar.name,
    mass_kg: 0,
    // Share mode weights rows by parts; a catalog add must never be weightless,
    // or a positive share would solve a budget that no row holds.
    parts: EQUAL_SUGAR_PARTS,
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

function numberAt(engine, path, fallback = 0) {
  try {
    const value = engine.resolve(path);
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  } catch (err) {
    reportError("lateAdditions.number", err);
    return fallback;
  }
}

function rounded(value) {
  return roundTo(Number(value) || 0, 6);
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
    latePinPanelOpen: false,
    latePinPanelVisible: false,
    scalePreviewRows: [],
    previewCompositionCaption: "",

    sugarField(id) {
      return (this.fieldsBySlice[N.slice] ?? []).find((f) => f.id === id) ?? null;
    },

    toggleLatePinPanel() {
      this.latePinPanelOpen = !this.latePinPanelOpen;
    },

    syncScalePreviewState() {
      let rows = [];
      try {
        const raw = ctx.engine.resolve(N.preview);
        rows = Array.isArray(raw) ? raw : [];
      } catch (err) {
        reportError("lateAdditions.scalePreviews", err);
      }
      const intent = ctx.engine.get(N.intent) ?? "dose";
      const share = Number(ctx.engine.get(N.share)) || 0;
      const dose = Number(ctx.engine.get(N.dose)) || 0;
      const state = scalePreviewState({
        rows,
        style: ctx.engine.identity?.style ?? {},
        pin: this.scalePin,
        intent,
        share,
        doseLabel: intent === "share" ? "" : this.previewDoseDisplay(dose),
      });
      this.scalePreviewRows = state.rows;
      this.previewCompositionCaption = state.caption;
    },

    // The caption quotes the dose in the sugar table's display unit, not the
    // canonical kg, so the line and the table agree.
    previewDoseDisplay(kg) {
      const field = (this.fieldsBySlice[N.slice] ?? []).find(
        (f) => f.control === "collection-table"
      );
      const column =
        field?.columns?.find((c) => c.id === "resolved_mass_kg") ??
        field?.columns?.find((c) => c.id === "mass_kg") ??
        null;
      const shown = displayValue(
        ctx.artifact,
        "mass",
        column?.displayUnit,
        kg,
        nonlinearFns(ctx.artifact, ctx.engine)
      );
      return columnValueLabel(shown, column, 2);
    },

    // Dose → share: seed the authored share and the row weights from the
    // current dose, but only on the first switch (an authored share or parts
    // round-trips untouched). The explicit adopt action forces a re-sync.
    seedShareFromDose(force = false) {
      const rows = ctx.engine.get(N.collection) ?? [];
      const currentShare = Number(ctx.engine.get(N.share)) || 0;
      const currentParts = rows.reduce((sum, row) => sum + (Number(row.parts) || 0), 0);
      if (!force && (currentShare > 0 || currentParts > 0)) return false;
      const total = numberAt(ctx.engine, N.effect.extractTotal);
      const share = sugarShareFromDose(rows, total);
      this.setRoot(N.share, Math.min(MAX_SUGAR_SHARE, share));
      const extract = sugarPartsFromDose(rows);
      const weighted = extract.some((value) => value > 0);
      ctx.engine.setCollection(
        N.collection,
        rows.map((row, index) => ({
          ...row,
          parts: rounded(weighted ? extract[index] : EQUAL_SUGAR_PARTS),
        }))
      );
      return true;
    },

    setLateAdditionIntent(value) {
      const field = this.lateIntentField;
      if (!field || value === this.lateAdditionIntent) return;
      if (value === "share") this.seedShareFromDose(false);
      this.edit(field, value);
      this.lateAdditionIntentState = value;
    },

    // Explicit re-sync so an authored dose can overwrite the share/parts pair.
    adoptLateAdditionDose() {
      if (!this.seedShareFromDose(true)) return;
      this.scheduleSolve();
      this.notify();
    },

    // Explicit re-sync so the resolved share allocation can overwrite the dose.
    adoptLateAdditionShare() {
      const rows = ctx.engine.get(N.collection) ?? [];
      if (!rows.length) return;
      const share = Number(ctx.engine.get(N.share)) || 0;
      const intent = ctx.engine.get(N.intent) ?? "dose";
      const resolved = resolvedSugarMasses({
        rows,
        budgetKg: share * numberAt(ctx.engine, N.effect.extractTotal),
        share,
        mode: intent,
      });
      ctx.engine.setCollection(
        N.collection,
        rows.map((row, index) => {
          const mass = rounded(resolved[index]?.massKg);
          return { ...row, mass_kg: mass };
        })
      );
      this.scheduleSolve();
      this.notify();
    },
  });

  Object.defineProperties(app, {
    lateAdditionIntentState: { configurable: true, writable: true, value: null },
    sugarEffectState: { configurable: true, writable: true, value: null },
    sugarEffectDisplayState: { configurable: true, writable: true, value: null },
    lateAdditionIntent: {
      configurable: true,
      get() {
        return this.lateAdditionIntentState ?? "dose";
      },
    },
    lateIntentField: {
      configurable: true,
      get() {
        return this.fieldsById[N.intent] ?? null;
      },
    },
    sugarShareField: {
      configurable: true,
      get() {
        return this.fieldsById[N.share] ?? null;
      },
    },
    sugarIsActive: {
      configurable: true,
      get() {
        return sugarActive({
          rows: ctx.engine.get(N.collection) ?? [],
          intent: ctx.engine.get(N.intent) ?? "dose",
          share: Number(ctx.engine.get(N.share)) || 0,
        });
      },
    },
    lateSugarField: {
      configurable: true,
      get() {
        // The live row allocation at the current solve: `resolved_mass_kg` is a
        // computed field, never a request input.
        const field =
          (this.fieldsBySlice[N.slice] ?? []).find(
            (f) => f.control === "collection-table"
          ) ?? null;
        if (!field) return null;
        const shareMode = (ctx.engine.get(N.intent) ?? "dose") === "share";
        const columns = (field.columns ?? [])
          .filter((c) => (shareMode ? c.id !== "mass_kg" : c.id !== "resolved_mass_kg"))
          .map((c) =>
            c.id === "resolved_mass_kg" ? { ...c, label: "Mass" } : c
          );
        return { ...field, columns };
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
        return this.sugarEffectState ?? sugarEffect({});
      },
    },
    sugarEffectDisplay: {
      configurable: true,
      get() {
        return this.sugarEffectDisplayState ?? null;
      },
    },
    sugarDraftMassDisplay: {
      configurable: true,
      get() {
        if (this.lateAdditionIntent !== "share") {
          return this.draftMassDisplay((r) => Number(r.mass_kg) || 0);
        }
        const share = Number(ctx.engine.get(N.share)) || 0;
        const total = numberAt(ctx.engine, N.effect.extractTotal);
        const rows = this.draftRows ?? [];
        const resolved = resolvedSugarMasses({
          rows,
          budgetKg: share * total,
          share,
          mode: "share",
        });
        const mass = resolved.reduce((sum, row) => sum + row.massKg, 0);
        const column = this.draftColumns.find((c) => c.id === "resolved_mass_kg");
        const shown = displayValue(
          ctx.artifact,
          "mass",
          column?.displayUnit,
          mass,
          nonlinearFns(ctx.artifact, ctx.engine)
        );
        return columnValueLabel(shown, column);
      },
    },
    sugarDraftExtractDisplay: {
      configurable: true,
      get() {
        if (this.lateAdditionIntent !== "share") {
          return this.draftMassDisplay(
            (r) => (Number(r.mass_kg) || 0) * (Number(r.yield_fraction) || 0)
          );
        }
        const column = this.draftColumns.find((c) => c.id === "mass_kg");
        const budget =
          (Number(ctx.engine.get(N.share)) || 0) *
          numberAt(ctx.engine, N.effect.extractTotal);
        const shown = displayValue(
          ctx.artifact,
          "mass",
          column?.displayUnit,
          budget,
          nonlinearFns(ctx.artifact, ctx.engine)
        );
        return columnValueLabel(shown, column);
      },
    },
    sugarResultLabel: {
      configurable: true,
      get() {
        return sugarCatalogCountLabel({
          shown: this.sugarVisibleCatalog.length,
          total: this.sugarFilteredCatalog.length,
          truncated: this.sugarCatalogTruncated,
        });
      },
    },
    sugarCountLabel: {
      configurable: true,
      get() {
        return sugarTableCountLabel(this.sugarList.length);
      },
    },
  });
}

export function refreshLateAdditionsCard(app, ctx) {
  const rows = ctx.engine.get(N.collection) ?? [];
  const effect = currentSugarEffect(ctx.engine);
  app.lateAdditionIntentState = ctx.engine.get(N.intent) ?? "dose";
  app.sugarEffectState = effect;
  app.sugarEffectDisplayState = sugarEffectLabels(effect);
  app.sugarList = rows;
  app.latePinPanelVisible = app.sugarIsActive;
  if (!app.latePinPanelVisible) app.latePinPanelOpen = false;
  app.syncScalePreviewState();
}
export const KEYS = [
  ...catalogDraftKeys("sugar", "Sugar"),
  "sugarList",
  "sugarField",
  "lateAdditionIntent",
  "lateIntentField",
  "sugarShareField",
  "lateSugarField",
  "sugarMassField",
  "sugarColorField",
  "lateExtractField",
  "lateAdditionIntentState",
  "sugarEffect",
  "sugarEffectState",
  "sugarEffectDisplay",
  "sugarEffectDisplayState",
  "sugarDraftMassDisplay",
  "sugarDraftExtractDisplay",
  "sugarResultLabel",
  "sugarCountLabel",
  "seedShareFromDose",
  "setLateAdditionIntent",
  "adoptLateAdditionDose",
  "adoptLateAdditionShare",
  "latePinPanelOpen",
  "toggleLatePinPanel",
  "scalePreviewRows",
  "previewDoseDisplay",
  "previewCompositionCaption",
  "sugarIsActive",
  "latePinPanelVisible",
  "syncScalePreviewState",
];
