// Late sugar additions card: definite-mass rows dosed from the sugar catalog.
// Uses the shared catalog/draft helper; bespoke bits are the summary readouts.

import {
  catalogDraftKeys,
  catalogDraftLayer,
  createCatalogDraft,
  installCatalogDraft,
} from "./catalogDraft.js";
import { allocationDescriptors, displayDescriptors, stateDescriptors } from "./lateAdditionGetters.js";
import { LATE_ADDITION_NODES as N } from "../../views/registry/late-additions.js";
import { columnValueLabel, sugarEffectLabels } from "../../views/producer/lateAdditionRows.js";
import { scalePreviewState } from "../../views/producer/scalePreview.js";
import { sugarEffect } from "../../views/producer/sugarEffect.js";
import {
  EQUAL_SUGAR_PARTS,
  MAX_SUGAR_SHARE,
  resolvedSugarMasses,
  sugarPartsFromDose,
  sugarShareFromDose,
} from "../../views/producer/sugarAllocation.js";
import { sugarSectionMetaDescriptors, sugarSectionState } from "../../views/producer/sugarSection.js";
import { displayValue, nonlinearFns } from "../../views/producer.js";
import { ignoreError } from "../../observability.js";
import { formatPercentRounded, formatValueWithUnit, roundTo } from "../../utils.js";

export function makeRow(sugar) {
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

const SUGAR_CONFIG = {
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
  searchPlaceholder: "Search sugars by name…",
  emptyMessage: "No matching sugars found.",
  resultLabel: (a) => a.sugarResultLabel,
  drawerId: "sugar-drawer",
  toolbarNote: (state) =>
    state.lateAdditionIntent === "share"
      ? "Edit parts; the mass is derived from the sugar-extract budget."
      : "Dose sugars by mass. Yield and color come from the catalog.",
  addLabel: "＋ Add Sugar from Catalog",
  inputStep: 0.01,
  canInspect: false,
  emptyText: "No sugars in the draft. Click “＋ Add Sugar from Catalog”.",
  totals: (state) => ({
    label: state.lateAdditionIntent === "share" ? "Sugar budget:" : "Total extract:",
    value: ` ${state.sugarDraftExtractDisplay}`,
  }),
};

function numberAt(engine, path, fallback = 0, reportError = ignoreError) { // test-only default
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
function currentSugarEffect(engine, reportError = ignoreError) { // test-only default
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

function previewActions({ engine, artifact, getView, observability }) {
  return {
    syncScalePreviewState() {
      const view = getView();
      let rows = [];
      try {
        const raw = engine.resolve(N.preview);
        rows = Array.isArray(raw) ? raw : [];
      } catch (err) {
        observability.reportError("lateAdditions.scalePreviews", err);
      }
      const intent = engine.get(N.intent) ?? "dose";
      const share = Number(engine.get(N.share)) || 0;
      const dose = Number(engine.get(N.dose)) || 0;
      const state = scalePreviewState({
        rows,
        style: engine.identity?.style ?? {},
        pin: view.scalePin,
        intent,
        share,
        doseLabel: intent === "share" ? "" : view.previewDoseDisplay(dose),
      });
      view.scalePreviewRows = state.rows;
      view.previewCompositionCaption = state.caption;
    },

    // The caption quotes the dose in the sugar table's display unit, not the
    // canonical kg, so the line and the table agree.
    previewDoseDisplay(kg) {
      const field = (getView().fieldsBySlice[N.slice] ?? []).find((f) => f.id === N.collection);
      const column =
        field?.columns?.find((c) => c.id === "resolved_mass_kg") ??
        field?.columns?.find((c) => c.id === "mass_kg") ??
        null;
      const shown = displayValue(
        artifact,
        "mass",
        column?.displayUnit,
        kg,
        nonlinearFns(artifact, engine)
      );
      return columnValueLabel(shown, column, 2);
    },
  };
}

function doseActions({ engine, getView, observability }) {
  return {
    sugarField(id) {
      return (getView().fieldsBySlice[N.slice] ?? []).find((f) => f.id === id) ?? null;
    },

    // Dose → share: seed the authored share and the row weights from the
    // current dose, but only on the first switch (an authored share or parts
    // round-trips untouched). The explicit adopt action forces a re-sync.
    seedShareFromDose(force = false) {
      const view = getView();
      const rows = engine.get(N.collection) ?? [];
      const currentShare = Number(engine.get(N.share)) || 0;
      const currentParts = rows.reduce((sum, row) => sum + (Number(row.parts) || 0), 0);
      if (!force && (currentShare > 0 || currentParts > 0)) return false;
      const total = numberAt(engine, N.effect.extractTotal, 0, observability.reportError);
      const share = sugarShareFromDose(rows, total);
      view.setRoot(N.share, Math.min(MAX_SUGAR_SHARE, share));
      const extract = sugarPartsFromDose(rows);
      const weighted = extract.some((value) => value > 0);
      engine.setCollection(
        N.collection,
        rows.map((row, index) => ({
          ...row,
          parts: rounded(weighted ? extract[index] : EQUAL_SUGAR_PARTS),
        }))
      );
      return true;
    },

    setLateAdditionIntent(value) {
      const view = getView();
      const field = view.lateIntentField;
      if (!field || value === view.lateAdditionIntent) return;
      if (value === "share") view.seedShareFromDose(false);
      view.edit(field, value);
      view.lateAdditionIntentState = value;
    },

    // Explicit re-sync so an authored dose can overwrite the share/parts pair.
    adoptLateAdditionDose() {
      const view = getView();
      if (!view.seedShareFromDose(true)) return;
      view.scheduleSolve();
      view.notify();
    },

    // Explicit re-sync so the resolved share allocation can overwrite the dose.
    adoptLateAdditionShare() {
      const view = getView();
      const rows = engine.get(N.collection) ?? [];
      if (!rows.length) return;
      const share = Number(engine.get(N.share)) || 0;
      const intent = engine.get(N.intent) ?? "dose";
      const resolved = resolvedSugarMasses({
        rows,
        budgetKg: share * numberAt(engine, N.effect.extractTotal, 0, observability.reportError),
        share,
        mode: intent,
      });
      engine.setCollection(
        N.collection,
        rows.map((row, index) => {
          const mass = rounded(resolved[index]?.massKg);
          return { ...row, mass_kg: mass };
        })
      );
      view.scheduleSolve();
      view.notify();
    },
  };
}

export function createLateAdditionsCard(ctx) {
  const actions = {
    // Rows for the read-only summary card (refreshed by refreshLateAdditionsCard).
    sugarList: [],
    latePinPanelVisible: false,
    scalePreviewRows: [],
    previewCompositionCaption: "",
    ...sugarSectionState(),
    ...previewActions(ctx),
    ...doseActions(ctx),
  };
  Object.defineProperties(actions, {
    ...sugarSectionMetaDescriptors(),
    ...stateDescriptors(ctx),
    ...displayDescriptors({ ...ctx, reportError: ctx.observability?.reportError }),
    ...allocationDescriptors({ ...ctx, reportError: ctx.observability?.reportError }),
  });
  return actions;
}

export function createLateAdditionsLayers(ctx) {
  return [
    catalogDraftLayer(createCatalogDraft(ctx, SUGAR_CONFIG, ctx.registry)),
    createLateAdditionsCard(ctx),
  ];
}

export function registerLateAdditionsCard(app, ctx = {}) {
  installCatalogDraft(app, ctx, SUGAR_CONFIG);
  const actions = createLateAdditionsCard({ ...ctx, getView: ctx.getView ?? (() => app) });
  Object.defineProperties(app, Object.getOwnPropertyDescriptors(actions));
  return actions;
}

export function refreshLateAdditionsCard(app, ctx) {
  const rows = ctx.engine.get(N.collection) ?? [];
  const effect = currentSugarEffect(ctx.engine, ctx.observability?.reportError);
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
  "sugarSectionOpen",
  "toggleSugarSection",
  "sugarSectionMeta",
  "sugarField",
  "lateAdditionIntent",
  "lateIntentField",
  "sugarShareField",
  "lateSugarField",
  "sugarMassField",
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
