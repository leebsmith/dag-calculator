// Hops card: boil additions (Tinseth) and whirlpool additions (Arrhenius
// cooling integral), both authored by IBU share.

import { catalogDraftKeys, installCatalogDraft } from "./catalogDraft.js";
import { installCoolingCurvePicker, KEYS as coolingCurveKeys } from "./hopsCoolingCurve.js";
import { HOP_NODES as N, WHIRLPOOL_ROW_DEFAULTS } from "../../views/registry/hops.js";
import { hopSectionState } from "../../views/producer/hopSections.js";
import {
  hopAlphaInputValue, hopAlphaLabel, hopBoilPctLabel, hopFormLabel, hopIbuLabel,
  hopMinutesLabel, hopAdditionLabel, hopPctLabel,
  BOIL_HOP_FORMS, WHIRLPOOL_HOP_FORMS,
} from "../../views/producer/hopRows.js";
import {
  HOP_MASS_KEY, HOP_MASS_UNITS, MAX_VISIBLE,
  boilRowsFor, createHopFormatters, hopAlphaOutsideStockFor,
  hopAlphaRangeText, hopCatalogEntries, hopCatalogItemMeta, hopMassText,
  hopTempText, whirlpoolRowsFor,
} from "../../views/hopsLogic.js";
import {
  draftDescriptors,
  fieldDescriptors,
  massDescriptors,
  policyDescriptors,
  resolveOrNull,
  whirlpoolStartDescriptors,
} from "./hopGetters.js";
import { cycleUnit } from "../../utils.js";
import { makeBoilRow } from "../../views/producer/boilPolicy.js";
import {
  makeWhirlpoolRow, readWhirlpoolCeiling, whirlpoolCeilingBadge,
} from "../../views/producer/whirlpoolPolicy.js";

function hopDraftConfig(ctx) {
  return {
    prefix: "hop",
    Cap: "Hop",
    nodeId: N.collection,
    seedKey: "hops",
    catalog: (a) => hopCatalogEntries(ctx.cache, a.hopCatalogForm),
    catalogNameOf: (item) => (item.product_form ? "hop_product" : "hop"),
    searchFields: ["name", "notes", "manufacturer", "brand"],
    idField: "hop_id", allowDuplicates: true,
    categoryField: "purpose",
    makeRow: (hop, a) => makeBoilRow(hop, a.hopCatalogForm),
    maxVisible: MAX_VISIBLE,
    itemMeta: hopCatalogItemMeta,
    searchPlaceholder: "Search hops by name…",
    emptyMessage: "No matching hops found.",
    resultLabel: (a) => a.hopResultLabel,
    catalogForm: {
      options: (a) => a.hopForms,
      value: (a) => a.hopCatalogForm,
      set: (value, a) => a.setHopCatalogForm(value),
    },
    drawerId: "hop-drawer",
    toolbarNote:
      "Enter relative IBU parts; Hamilton normalizes them to 100%. Mass is derived from Tinseth.",
    addLabel: "＋ Add Hop from Catalog",
    emptyText: "No hops in the draft. Click “＋ Add Hop from Catalog”.",
    totals: (a) => ({
      label: "Total parts:",
      value: a.fmt.formatWithDecimals(a.hopDraftPartsTotal, 1),
    }),
  };
}

function whirlpoolDraftConfig(ctx) {
  return {
    prefix: "whirlpoolHop",
    Cap: "WhirlpoolHop",
    nodeId: N.whirlpoolCollection,
    seedKey: "hops",
    catalog: (a) => hopCatalogEntries(ctx.cache, a.whirlpoolHopCatalogForm),
    catalogNameOf: (item) => (item.product_form ? "hop_product" : "hop"),
    searchFields: ["name", "notes", "manufacturer", "brand"],
    idField: "hop_id", allowDuplicates: true,
    categoryField: "purpose",
    makeRow: (hop, a) => makeWhirlpoolRow(hop, WHIRLPOOL_ROW_DEFAULTS, a.whirlpoolHopCatalogForm),
    maxVisible: MAX_VISIBLE,
    rowBadge: whirlpoolCeilingBadge,
    itemMeta: hopCatalogItemMeta,
    searchPlaceholder: "Search hops and products by name or maker…",
    emptyMessage: "No matching entries found.",
    resultLabel: (a) => a.whirlpoolHopResultLabel,
    catalogForm: {
      options: (a) => a.whirlpoolHopForms,
      value: (a) => a.whirlpoolHopCatalogForm,
      set: (value, a) => a.setWhirlpoolHopCatalogForm(value),
    },
    drawerId: "whirlpool-hop-drawer",
    toolbarNote:
      "Enter relative IBU parts; Hamilton normalizes them to 100%. Mass is derived from the whirlpool cooling integral.",
    addLabel: "＋ Add Hop from Catalog",
    emptyText: "No hops in the draft. Click “＋ Add Hop from Catalog”.",
    totals: (a) => ({
      label: "Total parts:",
      value: a.fmt.formatWithDecimals(a.whirlpoolHopDraftPartsTotal, 1),
    }),
  };
}

function catalogFormActions({ getView }) {
  return {
    setHopCatalogForm(value) {
      const view = getView();
      view.hopCatalogForm = value;
      view.hopSearch = "";
      view.hopCategoryFilter = [];
    },

    setWhirlpoolHopCatalogForm(value) {
      const view = getView();
      view.whirlpoolHopCatalogForm = value;
      view.whirlpoolHopSearch = "";
      view.whirlpoolHopCategoryFilter = [];
    },

    toggleWhirlpoolHelp() {
      const view = getView();
      view.whirlpoolHelpOpen = !view.whirlpoolHelpOpen;
    },

    toggleHopMassUnit() {
      const view = getView();
      const inherited = view.unitMode?.mass ?? "g";
      const next = cycleUnit(HOP_MASS_UNITS, view.hopMassUnit);
      view.setFieldUnit(HOP_MASS_KEY, next === inherited ? null : next);
    },
  };
}

function labelActions({ cache, getView, formatMass, formatTemp }) {
  return {
    hopMass(row) {
      return hopMassText(row, getView().hopMassUnit, formatMass);
    },

    whirlpoolHopMass(row) {
      return hopMassText(row, getView().hopMassUnit, formatMass);
    },

    hopForm(row) {
      return hopFormLabel(row);
    },

    hopAlpha(row) {
      return hopAlphaLabel(row);
    },

    hopAlphaInput(row) {
      return hopAlphaInputValue(row);
    },

    hopAlphaRange(row) {
      return hopAlphaRangeText(cache, row);
    },

    hopAlphaOutsideStock(row) {
      return hopAlphaOutsideStockFor(cache, row);
    },

    hopBoilPct(row) {
      return hopBoilPctLabel(row);
    },

    hopMinutes(row) {
      return hopMinutesLabel(row);
    },

    hopAddition(row) {
      return hopAdditionLabel(row);
    },

    hopTemp(row) {
      return hopTempText(row, formatTemp);
    },

    hopIbu(row) {
      return hopIbuLabel(row);
    },

    hopPct(row) {
      return hopPctLabel(row);
    },
  };
}

function alphaActions({ engine, getView }) {
  return {
    // Batch-scoped measurement edit: the row is batch data, not a record. The
    // IBU -> mass solve reads this value, so the mass re-solves immediately.
    setHopAlpha(kind, index, value) {
      const view = getView();
      const nodeId = kind === "whirlpool" ? N.whirlpoolCollection : N.collection;
      const rows = (engine.get(nodeId) ?? []).map((row) => ({ ...row }));
      const row = rows[index];
      if (!row) return;
      const pct = Number(value);
      row.alpha_acid_pct = Number.isFinite(pct) ? Math.max(0, Math.min(1, pct / 100)) : 0;
      engine.setCollection(nodeId, rows);
      view.scheduleSolve();
      view.notify();
    },
  };
}

export function createHopCard(
  ctx,
  formatters = createHopFormatters({ artifact: ctx.artifact, engine: ctx.engine, ui: ctx.ui })
) {
  const { engine, cache, getView, observability } = ctx;
  const { formatMass, formatTemp } = formatters;
  const actions = {
    hopRows: [],
    whirlpoolHopRows: [],
    whirlpoolCoolingCeiling: [],
    boilHopMassKg: null,
    whirlpoolHopMassKg: null,
    hopBoundaryTotalMassKg: null,
    hopForms: BOIL_HOP_FORMS,
    hopCatalogForm: "t90_pellet",
    whirlpoolHopForms: WHIRLPOOL_HOP_FORMS,
    whirlpoolHopCatalogForm: "t90_pellet",
    whirlpoolHelpOpen: false,
    boilHopAlphaMassKg: null,
    whirlpoolHopAlphaMassKg: null,
    ...hopSectionState(getView),
    ...catalogFormActions({ getView }),
    ...labelActions({ cache, getView, formatMass, formatTemp }),
    ...alphaActions({ engine, getView }),
  };
  Object.defineProperties(actions, {
    ...massDescriptors({ formatMass, getView }),
    ...draftDescriptors({ getView }),
    ...whirlpoolStartDescriptors({ getView }),
    ...policyDescriptors({
      cache, engine, formatTemp, formatMass, getView,
      reportError: observability.reportError,
    }),
    ...fieldDescriptors(getView),
  });
  return actions;
}

export function registerHopCard(app, ctx = {}) {
  installCatalogDraft(app, ctx, hopDraftConfig(ctx));
  installCatalogDraft(app, ctx, whirlpoolDraftConfig(ctx));
  const formatters = createHopFormatters({
    artifact: ctx.artifact,
    engine: ctx.engine,
    ui: ctx.ui,
  });
  const actions = createHopCard({ ...ctx, getView: ctx.getView ?? (() => app) }, formatters);
  Object.defineProperties(app, Object.getOwnPropertyDescriptors(actions));
  installCoolingCurvePicker(app, ctx, { formatTemp: formatters.formatTemp });
  return actions;
}

export function refreshHopCard(app, ctx) {
  const engine = ctx.engine;
  const reportError = ctx.observability?.reportError;
  const boilIbu = Number(engine.get(N.boilIbu)) || 0;
  const boilTimeMin = Number(engine.get(N.boilTime)) || 0;
  const whirlpoolIbu = Number(engine.get(N.whirlpoolIbu)) || 0;
  const volume = resolveOrNull(engine, N.postBoilVolume, reportError);
  app.hopRows = boilRowsFor({
    rows: engine.get(N.collection),
    results: resolveOrNull(engine, N.boilRows, reportError),
    boilIbu,
    boilTimeMin,
  });
  app.whirlpoolHopRows = whirlpoolRowsFor({
    rows: engine.get(N.whirlpoolCollection),
    results: resolveOrNull(engine, N.whirlpoolRows, reportError),
    whirlpoolIbu,
    volume,
  });
  app.whirlpoolCoolingCeiling = readWhirlpoolCeiling(
    engine,
    (path) => resolveOrNull(engine, path, reportError),
    N
  );
  app.boilHopMassKg = resolveOrNull(engine, N.boilMass, reportError);
  app.whirlpoolHopMassKg = resolveOrNull(engine, N.whirlpoolMass, reportError);
  app.boilHopAlphaMassKg = resolveOrNull(engine, N.boilAlphaMass, reportError);
  app.whirlpoolHopAlphaMassKg = resolveOrNull(engine, N.whirlpoolAlphaMass, reportError);
  app.hopBoundaryTotalMassKg = resolveOrNull(engine, N.totalMass, reportError);
}

export const KEYS = [
  ...catalogDraftKeys("hop", "Hop"),
  ...catalogDraftKeys("whirlpoolHop", "WhirlpoolHop"),
  "hopRows",
  "whirlpoolHopRows",
  "whirlpoolCoolingCeiling",
  "boilHopMassKg",
  "whirlpoolHopMassKg",
  "boilHopAlphaMassKg",
  "whirlpoolHopAlphaMassKg",
  "hopBoundaryTotalMassKg",
  "hopMassUnit",
  "whirlpoolHopForms",
  "whirlpoolHopCatalogForm",
  "setWhirlpoolHopCatalogForm",
  "whirlpoolHelpOpen",
  "toggleWhirlpoolHelp",
  "hopSections",
  "toggleHopSection",
  "isHopSectionOpen",
  "boilHopSectionMeta",
  "whirlpoolHopSectionMeta",
  "toggleHopMassUnit",
  "hopMass",
  "whirlpoolHopMass",
  "hopForm",
  "hopAlpha",
  "hopAlphaInput",
  "hopAlphaRange",
  "hopAlphaOutsideStock",
  "setHopAlpha",
  "hopBoilPct",
  "hopMinutes",
  "hopAddition",
  "hopDemandLine",
  "whirlpoolHopDemandLine",
  "hopTemp",
  "hopIbu",
  "hopPct",
  "boilIbuField",
  "whirlpoolIbuField",
  "totalIbuField",
  "whirlpoolAmbientField",
  "whirlpoolCoolingField",
  "whirlpoolKnockoutField",
  "whirlpoolStartTempField",
  "hopDraftPartsTotal",
  "hopDraftSummary",
  "whirlpoolHopDraftPartsTotal",
  "whirlpoolHopDraftSummary",
  "hopResultLabel",
  "whirlpoolHopResultLabel",
  "boilHopTotalMassDisplay",
  "hopTotalMassKg",
  "hopTotalMassDisplay",
  "whirlpoolHopTotalMassDisplay",
  "hopDoseWarning",
  "hopForms",
  "hopCatalogForm",
  "setHopCatalogForm",
  "whirlpoolStartBands",
  "whirlpoolStartBandValue",
  "whirlpoolStartBandHint",
  "setWhirlpoolStartBand",
  "whirlpoolCeilingMinute",
  "whirlpoolCeilingTemp",
  "whirlpoolTimelineState",
  "whirlpoolInferredChills",
  "whirlpoolZeroRestNote",
  ...coolingCurveKeys,
];
